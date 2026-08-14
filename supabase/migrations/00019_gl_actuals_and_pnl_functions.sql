-- GL budgeting foundation, part 5: the functions that actually tell the
-- story -- turning raw operational data (sales, the stock ledger,
-- schedules, invoices) into GL-account actuals, budget-vs-actual, and a
-- full P&L summary.
--
-- Every function takes a restaurant_id and an explicit [p_start_date,
-- p_end_date] range rather than assuming fiscal periods -- callers can pass
-- a fiscal_periods row's dates, a calendar month, or any custom range, and
-- the inventory-ledger-based COGS formula in particular does not require
-- count periods to align with fiscal periods at all.
--
-- KNOWN LIMITATIONS (flagged, not hidden):
--   1. gl_actual_labor() costs *scheduled* hours x wage rate, because there
--      is no time-clock/punch system in this schema. This is fine for a
--      budget-vs-actual story, not a substitute for payroll-grade actuals.
--   2. Salaried staff are prorated straight-line by calendar days in range
--      (annual_salary x days/365), not by pay period.
--   3. gl_actual_cogs() only distinguishes purchases vs. everything-else
--      (usage, waste, shrink, net transfers) -- by design, that's what the
--      classic "beginning + purchases - ending" formula gives you. If you
--      want a waste-only or transfer-only breakout, query
--      inventory_stock_ledger directly by transaction_type.

-- ── Revenue ─────────────────────────────────────────────────────────────
create or replace function gl_actual_revenue(p_restaurant_id uuid, p_start_date date, p_end_date date)
returns table (gl_account_id uuid, actual_amount numeric)
language sql
stable
security definer
set search_path to ''
as $$
  select ds.gl_account_id, sum(ds.net_amount) as actual_amount
  from public.daily_sales ds
  where ds.restaurant_id = p_restaurant_id
    and ds.sales_date between p_start_date and p_end_date
  group by ds.gl_account_id;
$$;

-- ── COGS ────────────────────────────────────────────────────────────────
-- Periodic formula: beginning inventory value + purchases - ending
-- inventory value, computed straight from the append-only stock ledger and
-- grouped by the GL account each inventory_category maps to.
create or replace function gl_actual_cogs(p_restaurant_id uuid, p_start_date date, p_end_date date)
returns table (gl_account_id uuid, actual_amount numeric)
language sql
stable
security definer
set search_path to ''
as $$
  with item_category as (
    select i.id as inventory_item_id, c.gl_account_id
    from public.inventory_items i
    join public.inventory_categories c on c.id = i.category_id
    where c.gl_account_id is not null
  ),
  beginning as (
    select ic.gl_account_id, sum(l.quantity_delta * l.unit_cost_at_transaction) as value
    from public.inventory_stock_ledger l
    join item_category ic on ic.inventory_item_id = l.inventory_item_id
    where l.restaurant_id = p_restaurant_id
      and l.occurred_at < p_start_date::timestamptz
    group by ic.gl_account_id
  ),
  ending as (
    select ic.gl_account_id, sum(l.quantity_delta * l.unit_cost_at_transaction) as value
    from public.inventory_stock_ledger l
    join item_category ic on ic.inventory_item_id = l.inventory_item_id
    where l.restaurant_id = p_restaurant_id
      and l.occurred_at < (p_end_date + 1)::timestamptz
    group by ic.gl_account_id
  ),
  purchases as (
    select ic.gl_account_id, sum(l.quantity_delta * l.unit_cost_at_transaction) as value
    from public.inventory_stock_ledger l
    join item_category ic on ic.inventory_item_id = l.inventory_item_id
    where l.restaurant_id = p_restaurant_id
      and l.transaction_type = 'receipt'
      and l.occurred_at >= p_start_date::timestamptz
      and l.occurred_at < (p_end_date + 1)::timestamptz
    group by ic.gl_account_id
  ),
  accounts as (
    select distinct gl_account_id from beginning
    union select distinct gl_account_id from ending
    union select distinct gl_account_id from purchases
  )
  select
    a.gl_account_id,
    coalesce(b.value, 0) + coalesce(p.value, 0) - coalesce(e.value, 0) as actual_amount
  from accounts a
  left join beginning b on b.gl_account_id = a.gl_account_id
  left join ending e on e.gl_account_id = a.gl_account_id
  left join purchases p on p.gl_account_id = a.gl_account_id;
$$;

-- ── Labor ───────────────────────────────────────────────────────────────
create or replace function gl_actual_labor(p_restaurant_id uuid, p_start_date date, p_end_date date)
returns table (gl_account_id uuid, actual_amount numeric)
language sql
stable
security definer
set search_path to ''
as $$
  with shifts as (
    select
      sa.staff_id,
      (s.week_start + sa.day) as shift_date,
      extract(epoch from (
        case when st.end_time <= st.start_time then st.end_time + interval '1 day' else st.end_time end
      ) - st.start_time) / 3600.0 as hours
    from public.schedule_assignments sa
    join public.schedules s on s.id = sa.schedule_id
    join public.shift_templates st on st.id = sa.template_id
    where s.restaurant_id = p_restaurant_id
      and sa.staff_id is not null
      and (s.week_start + sa.day) between p_start_date and p_end_date
  ),
  hourly_cost as (
    select sch.gl_account_id, sum(sh.hours * sch.hourly_rate) as amount
    from shifts sh
    join public.staff_compensation_history sch
      on sch.staff_id = sh.staff_id
      and sch.compensation_type = 'hourly'
      and sch.effective_date <= sh.shift_date
      and (sch.end_date is null or sch.end_date >= sh.shift_date)
    group by sch.gl_account_id
  ),
  salary_cost as (
    select
      sch.gl_account_id,
      sum(
        sch.annual_salary
        * (
            least(p_end_date, coalesce(sch.end_date, p_end_date))
            - greatest(p_start_date, sch.effective_date)
            + 1
          ) / 365.0
      ) as amount
    from public.staff_compensation_history sch
    join public.staff s on s.id = sch.staff_id
    where s.restaurant_id = p_restaurant_id
      and sch.compensation_type = 'salary'
      and sch.effective_date <= p_end_date
      and (sch.end_date is null or sch.end_date >= p_start_date)
    group by sch.gl_account_id
  ),
  combined as (
    select gl_account_id, amount from hourly_cost
    union all
    select gl_account_id, amount from salary_cost
  )
  select gl_account_id, sum(amount) as actual_amount
  from combined
  group by gl_account_id;
$$;

-- ── Controllable / occupancy / G&A / other (direct GL-tagged AP spend) ──
create or replace function gl_actual_opex(p_restaurant_id uuid, p_start_date date, p_end_date date)
returns table (gl_account_id uuid, actual_amount numeric)
language sql
stable
security definer
set search_path to ''
as $$
  select il.gl_account_id, sum(il.line_total) as actual_amount
  from public.invoice_lines il
  join public.invoices i on i.id = il.invoice_id
  where il.restaurant_id = p_restaurant_id
    and il.gl_account_id is not null
    and i.invoice_date between p_start_date and p_end_date
  group by il.gl_account_id;
$$;

-- ── Everything, per leaf GL account (zero-filled) ──────────────────────
create or replace function gl_actual_by_account(p_restaurant_id uuid, p_start_date date, p_end_date date)
returns table (gl_account_id uuid, code text, name text, account_type text, actual_amount numeric)
language sql
stable
security definer
set search_path to ''
as $$
  with actuals as (
    select * from public.gl_actual_revenue(p_restaurant_id, p_start_date, p_end_date)
    union all
    select * from public.gl_actual_cogs(p_restaurant_id, p_start_date, p_end_date)
    union all
    select * from public.gl_actual_labor(p_restaurant_id, p_start_date, p_end_date)
    union all
    select * from public.gl_actual_opex(p_restaurant_id, p_start_date, p_end_date)
  )
  select
    ga.id as gl_account_id,
    ga.code,
    ga.name,
    ga.account_type,
    coalesce(a.actual_amount, 0) as actual_amount
  from public.gl_accounts ga
  left join actuals a on a.gl_account_id = ga.id
  where ga.parent_account_id is not null -- leaf accounts only
    and ga.organization_id = (select organization_id from public.restaurants where id = p_restaurant_id)
  order by ga.sort_order;
$$;

-- ── Budget vs. actual, per leaf GL account, for one fiscal period ──────
create or replace function gl_budget_vs_actual(p_restaurant_id uuid, p_fiscal_period_id uuid)
returns table (
  gl_account_id uuid, code text, name text, account_type text,
  budgeted_amount numeric, actual_amount numeric, variance numeric, variance_pct numeric
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_start date;
  v_end date;
begin
  select period_start, period_end into v_start, v_end
  from public.fiscal_periods where id = p_fiscal_period_id;

  if v_start is null then
    raise exception 'fiscal_period % not found', p_fiscal_period_id;
  end if;

  return query
  select
    gaa.gl_account_id, gaa.code, gaa.name, gaa.account_type,
    coalesce(bl.budgeted_amount, 0) as budgeted_amount,
    gaa.actual_amount,
    gaa.actual_amount - coalesce(bl.budgeted_amount, 0) as variance,
    case when coalesce(bl.budgeted_amount, 0) = 0 then null
      else round((gaa.actual_amount - bl.budgeted_amount) / abs(bl.budgeted_amount) * 100, 1)
    end as variance_pct
  from public.gl_actual_by_account(p_restaurant_id, v_start, v_end) gaa
  left join public.budget_lines bl
    on bl.gl_account_id = gaa.gl_account_id
    and bl.restaurant_id = p_restaurant_id
    and bl.fiscal_period_id = p_fiscal_period_id;
end;
$$;

-- ── The P&L story, for operators and investors alike ───────────────────
-- Rolls leaf-account actuals up to the classic restaurant P&L structure:
-- Revenue -> COGS -> Gross Profit -> Labor -> Prime Cost -> Controllable ->
-- Occupancy -> G&A -> Operating Income, each expressed both in dollars and
-- as a % of revenue (the number operators and investors actually compare
-- across restaurants and periods). 'other'-type accounts, if ever used,
-- are folded into G&A rather than dropped.
create or replace function gl_pnl_summary(p_restaurant_id uuid, p_start_date date, p_end_date date)
returns table (line_item text, amount numeric, pct_of_revenue numeric, sort_order integer)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_revenue numeric;
  v_cogs numeric;
  v_gross_profit numeric;
  v_labor numeric;
  v_prime_cost numeric;
  v_controllable numeric;
  v_occupancy numeric;
  v_g_and_a numeric;
  v_operating_income numeric;
begin
  select coalesce(sum(actual_amount), 0) into v_revenue
  from public.gl_actual_by_account(p_restaurant_id, p_start_date, p_end_date) where account_type = 'revenue';

  select coalesce(sum(actual_amount), 0) into v_cogs
  from public.gl_actual_by_account(p_restaurant_id, p_start_date, p_end_date) where account_type = 'cogs';

  select coalesce(sum(actual_amount), 0) into v_labor
  from public.gl_actual_by_account(p_restaurant_id, p_start_date, p_end_date) where account_type = 'labor';

  select coalesce(sum(actual_amount), 0) into v_controllable
  from public.gl_actual_by_account(p_restaurant_id, p_start_date, p_end_date) where account_type = 'controllable';

  select coalesce(sum(actual_amount), 0) into v_occupancy
  from public.gl_actual_by_account(p_restaurant_id, p_start_date, p_end_date) where account_type = 'occupancy';

  select coalesce(sum(actual_amount), 0) into v_g_and_a
  from public.gl_actual_by_account(p_restaurant_id, p_start_date, p_end_date) where account_type in ('g_and_a', 'other');

  v_gross_profit := v_revenue - v_cogs;
  v_prime_cost := v_cogs + v_labor;
  v_operating_income := v_gross_profit - v_labor - v_controllable - v_occupancy - v_g_and_a;

  return query
  select * from (
    select 'Revenue'::text as line_item, v_revenue as amount, 100.0 as pct_of_revenue, 10 as sort_order
    union all
    select 'COGS', v_cogs, case when v_revenue = 0 then null else round(v_cogs / v_revenue * 100, 1) end, 20
    union all
    select 'Gross Profit', v_gross_profit, case when v_revenue = 0 then null else round(v_gross_profit / v_revenue * 100, 1) end, 30
    union all
    select 'Labor', v_labor, case when v_revenue = 0 then null else round(v_labor / v_revenue * 100, 1) end, 40
    union all
    select 'Prime Cost', v_prime_cost, case when v_revenue = 0 then null else round(v_prime_cost / v_revenue * 100, 1) end, 50
    union all
    select 'Controllable Expenses', v_controllable, case when v_revenue = 0 then null else round(v_controllable / v_revenue * 100, 1) end, 60
    union all
    select 'Occupancy', v_occupancy, case when v_revenue = 0 then null else round(v_occupancy / v_revenue * 100, 1) end, 70
    union all
    select 'G&A', v_g_and_a, case when v_revenue = 0 then null else round(v_g_and_a / v_revenue * 100, 1) end, 80
    union all
    select 'Operating Income', v_operating_income, case when v_revenue = 0 then null else round(v_operating_income / v_revenue * 100, 1) end, 90
  ) pnl
  order by sort_order;
end;
$$;
