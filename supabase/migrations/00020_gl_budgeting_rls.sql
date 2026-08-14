-- GL budgeting foundation, part 6: RLS lockdown.
--
-- Two capability functions, following the same wrapper pattern as
-- can_operate_inventory()/can_manage_inventory_catalog(): both currently
-- just check is_owner_admin(), because the profiles.role check constraint
-- only allows 'owner_admin' | 'head_bartender' | 'staff_user' -- there is
-- no manager/investor/read-only-financials role yet. Flagged as a known
-- limitation: today, financial data (budgets, wages, P&L) is entirely
-- owner_admin-only, same as inventory. When a manager or investor role is
-- introduced, only these two functions need to change -- nothing else.
create or replace function can_manage_budget()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.is_owner_admin();
$$;

create or replace function can_view_financials()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.is_owner_admin();
$$;

alter table gl_accounts enable row level security;
alter table fiscal_periods enable row level security;
alter table daily_sales enable row level security;
alter table staff_compensation_history enable row level security;
alter table budget_lines enable row level security;

-- gl_accounts: org-scoped (accounts aren't tied to one restaurant).
create policy gl_accounts_select on gl_accounts
  for select to authenticated
  using (organization_id = current_organization_id() and can_view_financials());

create policy gl_accounts_write on gl_accounts
  for all to authenticated
  using (organization_id = current_organization_id() and can_manage_budget())
  with check (organization_id = current_organization_id() and can_manage_budget());

-- fiscal_periods: org-scoped.
create policy fiscal_periods_select on fiscal_periods
  for select to authenticated
  using (organization_id = current_organization_id() and can_view_financials());

create policy fiscal_periods_write on fiscal_periods
  for all to authenticated
  using (organization_id = current_organization_id() and can_manage_budget())
  with check (organization_id = current_organization_id() and can_manage_budget());

-- daily_sales: restaurant-scoped.
create policy daily_sales_select on daily_sales
  for select to authenticated
  using (is_same_org_restaurant(restaurant_id) and can_view_financials());

create policy daily_sales_write on daily_sales
  for all to authenticated
  using (is_same_org_restaurant(restaurant_id) and can_manage_budget())
  with check (is_same_org_restaurant(restaurant_id) and can_manage_budget());

-- staff_compensation_history: individual wage data -- scoped through
-- staff.restaurant_id, owner_admin only, no exceptions.
create policy staff_compensation_history_select on staff_compensation_history
  for select to authenticated
  using (
    can_view_financials()
    and exists (
      select 1 from staff s
      where s.id = staff_compensation_history.staff_id
        and is_same_org_restaurant(s.restaurant_id)
    )
  );

create policy staff_compensation_history_write on staff_compensation_history
  for all to authenticated
  using (
    can_manage_budget()
    and exists (
      select 1 from staff s
      where s.id = staff_compensation_history.staff_id
        and is_same_org_restaurant(s.restaurant_id)
    )
  )
  with check (
    can_manage_budget()
    and exists (
      select 1 from staff s
      where s.id = staff_compensation_history.staff_id
        and is_same_org_restaurant(s.restaurant_id)
    )
  );

-- budget_lines: restaurant-scoped.
create policy budget_lines_select on budget_lines
  for select to authenticated
  using (is_same_org_restaurant(restaurant_id) and can_view_financials());

create policy budget_lines_write on budget_lines
  for all to authenticated
  using (is_same_org_restaurant(restaurant_id) and can_manage_budget())
  with check (is_same_org_restaurant(restaurant_id) and can_manage_budget());
