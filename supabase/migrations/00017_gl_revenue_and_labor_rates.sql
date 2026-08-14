-- GL budgeting foundation, part 3: the two actuals input tables that don't
-- already exist elsewhere in the schema -- revenue (nothing upstream
-- produces sales data yet) and labor pay rates (schedule_assignments knows
-- *who worked when*, but nothing knows what they're paid).
--
-- Known limitation, flagged rather than silently papered over: there is no
-- POS integration or time-clock/punch system in this schema yet, so:
--   - daily_sales is a manual/import target for now (a future POS
--     integration would insert into this same table).
--   - gl_actual_labor() (built in a later migration) will compute labor
--     cost from *scheduled* hours x wage rate, not actual clocked hours.
--     That's a real gap between budget-grade and payroll-grade labor
--     actuals -- fine for the P&L story this task asked for, not fine for
--     running payroll.

-- One row per restaurant/date/revenue-account. Splitting by gl_account_id
-- (food vs liquor vs beer & wine, etc.) rather than one big number per day
-- is what lets gl_actual_revenue() answer "food sales this period" instead
-- of just "total sales this period".
create table daily_sales (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  sales_date date not null,
  gl_account_id uuid not null references gl_accounts(id),
  gross_amount numeric(12, 2) not null check (gross_amount >= 0),
  discounts numeric(12, 2) not null default 0 check (discounts >= 0),
  comps numeric(12, 2) not null default 0 check (comps >= 0),
  net_amount numeric(12, 2) generated always as (gross_amount - discounts - comps) stored,
  created_at timestamptz not null default now(),
  unique (restaurant_id, sales_date, gl_account_id)
);

create index daily_sales_restaurant_date_idx on daily_sales(restaurant_id, sales_date);
create index daily_sales_gl_account_id_idx on daily_sales(gl_account_id);

-- gl_account_id must be a 'revenue'-type account belonging to the same org
-- as the restaurant -- posting sales to a labor or COGS account should be
-- impossible, not just a convention.
create or replace function validate_daily_sales_gl_account()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_restaurant_org uuid;
  v_account_org uuid;
  v_account_type text;
begin
  select organization_id into v_restaurant_org from public.restaurants where id = new.restaurant_id;
  select organization_id, account_type into v_account_org, v_account_type
  from public.gl_accounts where id = new.gl_account_id;

  if v_account_org is null or v_account_org <> v_restaurant_org then
    raise exception 'gl_account % does not belong to the same organization as restaurant %', new.gl_account_id, new.restaurant_id;
  end if;

  if v_account_type <> 'revenue' then
    raise exception 'daily_sales.gl_account_id must reference a revenue account (got account_type=%)', v_account_type;
  end if;

  return new;
end;
$$;

create trigger validate_daily_sales_gl_account_trigger
  before insert or update of restaurant_id, gl_account_id on daily_sales
  for each row execute function validate_daily_sales_gl_account();

-- Pay-rate history for staff. References staff(id) -- the standalone
-- scheduling roster -- not profiles(id), because schedule_assignments.staff_id
-- points there, and that's the join gl_actual_labor() will need
-- (scheduled hours x rate-in-effect-on-that-date).
--
-- Insert-only history: a raise doesn't edit a row, it inserts a new one
-- with a later effective_date. The before-insert trigger below closes out
-- the previously open row so "current rate" is never ambiguous.
create table staff_compensation_history (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  compensation_type text not null check (compensation_type in ('hourly', 'salary')),
  hourly_rate numeric(8, 2),
  annual_salary numeric(10, 2),
  gl_account_id uuid not null references gl_accounts(id),
  effective_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  check (
    (compensation_type = 'hourly' and hourly_rate is not null and annual_salary is null)
    or
    (compensation_type = 'salary' and annual_salary is not null and hourly_rate is null)
  ),
  check (end_date is null or end_date >= effective_date)
);

create index staff_compensation_history_staff_id_idx on staff_compensation_history(staff_id, effective_date);

-- gl_account_id must be a 'labor'-type account in the same org as the
-- staff member's restaurant.
create or replace function validate_staff_compensation_gl_account()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_staff_org uuid;
  v_account_org uuid;
  v_account_type text;
begin
  select r.organization_id into v_staff_org
  from public.staff s
  join public.restaurants r on r.id = s.restaurant_id
  where s.id = new.staff_id;

  select organization_id, account_type into v_account_org, v_account_type
  from public.gl_accounts where id = new.gl_account_id;

  if v_account_org is null or v_account_org <> v_staff_org then
    raise exception 'gl_account % does not belong to the same organization as staff %', new.gl_account_id, new.staff_id;
  end if;

  if v_account_type <> 'labor' then
    raise exception 'staff_compensation_history.gl_account_id must reference a labor account (got account_type=%)', v_account_type;
  end if;

  return new;
end;
$$;

-- Auto-closes the previously open compensation row for this staff member
-- (end_date is null) the instant a new one starts, so there is never more
-- than one "current" rate and no manual bookkeeping is required to keep
-- history consistent.
create or replace function close_previous_staff_compensation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.staff_compensation_history
  set end_date = new.effective_date - 1
  where staff_id = new.staff_id
    and end_date is null
    and effective_date < new.effective_date;

  return new;
end;
$$;

create trigger validate_staff_compensation_gl_account_trigger
  before insert or update of staff_id, gl_account_id on staff_compensation_history
  for each row execute function validate_staff_compensation_gl_account();

create trigger close_previous_staff_compensation_trigger
  before insert on staff_compensation_history
  for each row execute function close_previous_staff_compensation();
