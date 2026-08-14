-- Security fix, caught by the post-build advisor scan (not by RLS, which
-- doesn't apply here): every gl_* reporting function, plus
-- generate_fiscal_periods() and seed_standard_coa() from earlier in this
-- feature, is `security definer` and exposed over RPC to any authenticated
-- user. SECURITY DEFINER functions run with the function owner's
-- privileges and bypass RLS entirely -- so without an explicit check
-- inside the function body, any authenticated user in ANY organization
-- could call e.g. gl_pnl_summary(some_other_orgs_restaurant_id, ...) and
-- read that restaurant's real revenue, labor, and P&L. Same story for
-- generate_fiscal_periods()/seed_standard_coa() on the write side -- an
-- authenticated user from Org B could have generated periods or seeded a
-- chart of accounts for Org A.
--
-- Fix: every one of these functions now checks the caller's org/restaurant
-- membership and role (can_view_financials() for reads, can_manage_budget()
-- for writes) before doing anything, exactly like the RLS policies already
-- do for direct table access. This is the same class of bug as the
-- original is_owner_admin() cross-tenant hole fixed earlier in this
-- project -- caught this time before any real data existed.

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
    and public.is_same_org_restaurant(p_restaurant_id)
    and public.can_view_financials()
  group by ds.gl_account_id;
$$;

create or replace function gl_actual_cogs(p_restaurant_id uuid, p_start_date date, p_end_date date)
returns table (gl_account_id uuid, actual_amount numeric)
language sql
stable
security definer
set search_path to ''
as $$
  with authorized as (
    select public.is_same_org_restaurant(p_restaurant_id) and public.can_view_financials() as ok
  ),
  item_category as (
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
      and (select ok from authorized)
    group by ic.gl_account_id
  ),
  ending as (
    select ic.gl_account_id, sum(l.quantity_delta * l.unit_cost_at_transaction) as value
    from public.inventory_stock_ledger l
    join item_category ic on ic.inventory_item_id = l.inventory_item_id
    where l.restaurant_id = p_restaurant_id
      and l.occurred_at < (p_end_date + 1)::timestamptz
      and (select ok from authorized)
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
      and (select ok from authorized)
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

create or replace function gl_actual_labor(p_restaurant_id uuid, p_start_date date, p_end_date date)
returns table (gl_account_id uuid, actual_amount numeric)
language sql
stable
security definer
set search_path to ''
as $$
  with authorized as (
    select public.is_same_org_restaurant(p_restaurant_id) and public.can_view_financials() as ok
  ),
  shifts as (
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
      and (select ok from authorized)
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
      and (select ok from authorized)
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
    and public.is_same_org_restaurant(p_restaurant_id)
    and public.can_view_financials()
  group by il.gl_account_id;
$$;

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
    and public.is_same_org_restaurant(p_restaurant_id)
    and public.can_view_financials()
  order by ga.sort_order;
$$;

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
  if not (public.is_same_org_restaurant(p_restaurant_id) and public.can_view_financials()) then
    raise exception 'not authorized to view financials for restaurant %', p_restaurant_id;
  end if;

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
  if not (public.is_same_org_restaurant(p_restaurant_id) and public.can_view_financials()) then
    raise exception 'not authorized to view financials for restaurant %', p_restaurant_id;
  end if;

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

-- Same class of fix for the two functions from earlier in this feature.
create or replace function generate_fiscal_periods(p_organization_id uuid, p_fiscal_year integer, p_start_date date)
returns setof fiscal_periods
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_period_start date := p_start_date;
  v_week_counts integer[] := array[4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5];
  v_period_number integer;
  v_quarter integer;
  v_week_count integer;
  v_period_end date;
begin
  if not (p_organization_id = public.current_organization_id() and public.can_manage_budget()) then
    raise exception 'not authorized to generate fiscal periods for organization %', p_organization_id;
  end if;

  if exists (select 1 from public.fiscal_periods where organization_id = p_organization_id and fiscal_year = p_fiscal_year) then
    raise exception 'fiscal_year % already has periods for organization %', p_fiscal_year, p_organization_id;
  end if;

  for v_period_number in 1..12 loop
    v_week_count := v_week_counts[v_period_number];
    v_quarter := ceil(v_period_number::numeric / 3);
    v_period_end := v_period_start + (v_week_count * 7 - 1);

    insert into public.fiscal_periods (
      organization_id, fiscal_year, period_number, quarter, week_count, period_start, period_end
    ) values (
      p_organization_id, p_fiscal_year, v_period_number, v_quarter, v_week_count, v_period_start, v_period_end
    );

    v_period_start := v_period_end + 1;
  end loop;

  return query
    select * from public.fiscal_periods
    where organization_id = p_organization_id and fiscal_year = p_fiscal_year
    order by period_number;
end;
$$;

create or replace function seed_standard_coa(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_revenue uuid;
  v_cogs uuid;
  v_labor uuid;
  v_controllable uuid;
  v_occupancy uuid;
  v_g_and_a uuid;
begin
  if not (p_organization_id = public.current_organization_id() and public.can_manage_budget()) then
    raise exception 'not authorized to seed a chart of accounts for organization %', p_organization_id;
  end if;

  if exists (select 1 from public.gl_accounts where organization_id = p_organization_id) then
    raise exception 'organization % already has gl_accounts', p_organization_id;
  end if;

  insert into public.gl_accounts (organization_id, code, name, account_type, sort_order) values
    (p_organization_id, '4000', 'Total revenue', 'revenue', 100)
    returning id into v_revenue;
  insert into public.gl_accounts (organization_id, code, name, account_type, parent_account_id, sort_order) values
    (p_organization_id, '4010', 'Food sales', 'revenue', v_revenue, 110),
    (p_organization_id, '4020', 'N/A beverage sales', 'revenue', v_revenue, 120),
    (p_organization_id, '4030', 'Liquor sales', 'revenue', v_revenue, 130),
    (p_organization_id, '4040', 'Beer & wine sales', 'revenue', v_revenue, 140),
    (p_organization_id, '4090', 'Other revenue', 'revenue', v_revenue, 190);

  insert into public.gl_accounts (organization_id, code, name, account_type, sort_order) values
    (p_organization_id, '5000', 'Total cost of goods sold', 'cogs', 200)
    returning id into v_cogs;
  insert into public.gl_accounts (organization_id, code, name, account_type, parent_account_id, sort_order) values
    (p_organization_id, '5010', 'Food cost', 'cogs', v_cogs, 210),
    (p_organization_id, '5020', 'N/A beverage cost', 'cogs', v_cogs, 220),
    (p_organization_id, '5030', 'Liquor cost', 'cogs', v_cogs, 230),
    (p_organization_id, '5040', 'Beer & wine cost', 'cogs', v_cogs, 240);

  insert into public.gl_accounts (organization_id, code, name, account_type, sort_order) values
    (p_organization_id, '6000', 'Total labor', 'labor', 300)
    returning id into v_labor;
  insert into public.gl_accounts (organization_id, code, name, account_type, parent_account_id, sort_order) values
    (p_organization_id, '6010', 'Hourly wages - FOH', 'labor', v_labor, 310),
    (p_organization_id, '6020', 'Hourly wages - BOH', 'labor', v_labor, 320),
    (p_organization_id, '6030', 'Management salaries', 'labor', v_labor, 330),
    (p_organization_id, '6040', 'Payroll taxes', 'labor', v_labor, 340),
    (p_organization_id, '6050', 'Employee benefits', 'labor', v_labor, 350);

  insert into public.gl_accounts (organization_id, code, name, account_type, sort_order) values
    (p_organization_id, '7000', 'Total controllable expenses', 'controllable', 400)
    returning id into v_controllable;
  insert into public.gl_accounts (organization_id, code, name, account_type, parent_account_id, sort_order) values
    (p_organization_id, '7010', 'Restaurant supplies', 'controllable', v_controllable, 410),
    (p_organization_id, '7020', 'Smallwares', 'controllable', v_controllable, 420),
    (p_organization_id, '7030', 'Repairs & maintenance', 'controllable', v_controllable, 430),
    (p_organization_id, '7040', 'Marketing & advertising', 'controllable', v_controllable, 440),
    (p_organization_id, '7050', 'Credit card fees', 'controllable', v_controllable, 450),
    (p_organization_id, '7060', 'Uniforms & laundry', 'controllable', v_controllable, 460);

  insert into public.gl_accounts (organization_id, code, name, account_type, sort_order) values
    (p_organization_id, '8000', 'Total occupancy', 'occupancy', 500)
    returning id into v_occupancy;
  insert into public.gl_accounts (organization_id, code, name, account_type, parent_account_id, sort_order) values
    (p_organization_id, '8010', 'Rent', 'occupancy', v_occupancy, 510),
    (p_organization_id, '8020', 'Utilities', 'occupancy', v_occupancy, 520),
    (p_organization_id, '8030', 'Property tax', 'occupancy', v_occupancy, 530),
    (p_organization_id, '8040', 'Insurance', 'occupancy', v_occupancy, 540);

  insert into public.gl_accounts (organization_id, code, name, account_type, sort_order) values
    (p_organization_id, '9000', 'Total general & administrative', 'g_and_a', 600)
    returning id into v_g_and_a;
  insert into public.gl_accounts (organization_id, code, name, account_type, parent_account_id, sort_order) values
    (p_organization_id, '9010', 'Office supplies', 'g_and_a', v_g_and_a, 610),
    (p_organization_id, '9020', 'Professional fees', 'g_and_a', v_g_and_a, 620),
    (p_organization_id, '9030', 'Bank charges', 'g_and_a', v_g_and_a, 630),
    (p_organization_id, '9090', 'Other expenses', 'g_and_a', v_g_and_a, 690);
end;
$$;
