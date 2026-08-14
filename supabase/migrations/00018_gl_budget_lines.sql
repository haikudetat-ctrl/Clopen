-- GL budgeting foundation, part 4: the budget itself.
--
-- Bottom-up ownership, per user decision: each restaurant owns its own
-- budget line per fiscal period per GL account. An org-level ("all
-- restaurants") rollup is just sum(budget_lines) grouped by account for a
-- given fiscal_year -- no separate org-level table needed, and there's
-- nothing to keep in sync if a restaurant edits its number.

create table budget_lines (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  fiscal_period_id uuid not null references fiscal_periods(id) on delete cascade,
  gl_account_id uuid not null references gl_accounts(id),
  budgeted_amount numeric(12, 2) not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, fiscal_period_id, gl_account_id)
);

create index budget_lines_restaurant_id_idx on budget_lines(restaurant_id);
create index budget_lines_fiscal_period_id_idx on budget_lines(fiscal_period_id);
create index budget_lines_gl_account_id_idx on budget_lines(gl_account_id);

-- A budget line only makes sense against a leaf (child) account -- budgeting
-- directly against a rollup total (e.g. '5000 Total cost of goods sold')
-- would double-count once gl_pnl_summary() sums the children up to it.
-- Also enforces restaurant/fiscal_period/gl_account are all the same org.
create or replace function validate_budget_line()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_restaurant_org uuid;
  v_period_org uuid;
  v_account_org uuid;
  v_has_children boolean;
begin
  select organization_id into v_restaurant_org from public.restaurants where id = new.restaurant_id;
  select organization_id into v_period_org from public.fiscal_periods where id = new.fiscal_period_id;
  select organization_id into v_account_org from public.gl_accounts where id = new.gl_account_id;

  if v_period_org is null or v_period_org <> v_restaurant_org then
    raise exception 'fiscal_period % does not belong to the same organization as restaurant %', new.fiscal_period_id, new.restaurant_id;
  end if;

  if v_account_org is null or v_account_org <> v_restaurant_org then
    raise exception 'gl_account % does not belong to the same organization as restaurant %', new.gl_account_id, new.restaurant_id;
  end if;

  select exists(select 1 from public.gl_accounts where parent_account_id = new.gl_account_id)
  into v_has_children;

  if v_has_children then
    raise exception 'gl_account % is a rollup/parent account -- budget against its child accounts instead', new.gl_account_id;
  end if;

  return new;
end;
$$;

create trigger validate_budget_line_trigger
  before insert or update of restaurant_id, fiscal_period_id, gl_account_id on budget_lines
  for each row execute function validate_budget_line();

create or replace function set_budget_line_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger budget_lines_set_updated_at
  before update on budget_lines
  for each row execute function set_budget_line_updated_at();
