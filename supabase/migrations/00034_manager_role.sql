-- Introduces the `manager` role -- the fourth profiles.role value, and the
-- first one added since the original schema.
--
-- Motivation: nightly sales entry is a manager's end-of-shift job, not an
-- owner's. But today every financial surface is owner_admin-only, so the
-- only way to let someone close out the night was to hand them owner
-- access to the entire P&L, budgets, and wage history. This splits
-- "records sales" away from "sees the financial picture".
--
-- 00013_inventory_rls.sql and 00020_gl_budgeting_rls.sql both left notes
-- predicting this migration ("when a manager or investor role is
-- introduced, only these two functions need to change -- nothing else").
-- That prediction holds for everything gated on can_view_financials() /
-- can_manage_budget(): this migration deliberately does NOT widen those,
-- so a manager still cannot reach gl_pnl_summary, gl_restaurant_rollup,
-- budget_lines, or staff_compensation_history.
--
-- Note the constraint, is_owner_admin(), and set_user_role_by_email() all
-- live only in the pre-existing database (00001/00002 are marked
-- SUPERSEDED / NOT APPLIED), so the definitions below were introspected
-- from the live project rather than read from this repo.

-- Postgres has no ALTER ... ALTER CONSTRAINT for CHECK -- drop and recreate.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['owner_admin'::text, 'manager'::text, 'head_bartender'::text, 'staff_user'::text]));

-- Base predicate, mirroring is_owner_admin()'s shape exactly (including the
-- is_active check -- a deactivated manager loses the capability).
create or replace function is_manager()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'manager'
      and p.is_active
  );
$$;

-- Capability wrapper, following the same pattern as can_operate_inventory()
-- / can_manage_budget(): policies call the wrapper, never the raw role
-- predicate, so a future role only has to edit this body.
create or replace function can_record_sales()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.is_owner_admin() or public.is_manager();
$$;

-- The role-mutation RPC hard-codes its own allow-list independent of the
-- check constraint, so it has to learn about 'manager' separately or
-- promoting someone fails with "Invalid role" despite the constraint
-- allowing it.
create or replace function public.set_user_role_by_email(target_email text, new_role text)
returns profiles
language plpgsql
security definer
set search_path to ''
as $function$
declare
  updated_profile public.profiles;
begin
  if not public.is_owner_admin() then
    raise exception 'Only owner_admin can change user roles';
  end if;

  if new_role not in ('owner_admin', 'manager', 'head_bartender', 'staff_user') then
    raise exception 'Invalid role: %', new_role;
  end if;

  update public.profiles p
  set role = new_role,
      updated_at = now()
  from auth.users u
  where u.id = p.id
    and lower(u.email) = lower(target_email)
  returning p.* into updated_profile;

  if updated_profile.id is null then
    raise exception 'No user found for email %', target_email;
  end if;

  return updated_profile;
end;
$function$;

-- daily_sales_write was `for all`, which in Postgres INCLUDES select.
-- Because permissive policies of the same command are OR'd together,
-- granting a manager write access through that policy would have silently
-- also granted them read access to the table regardless of what
-- daily_sales_select says. Decompose it into explicit per-command policies
-- so read and write are actually separable.
drop policy daily_sales_write on daily_sales;

create policy daily_sales_insert on daily_sales
  for insert to authenticated
  with check (is_same_org_restaurant(restaurant_id) and (can_manage_budget() or can_record_sales()));

create policy daily_sales_update on daily_sales
  for update to authenticated
  using (is_same_org_restaurant(restaurant_id) and (can_manage_budget() or can_record_sales()))
  with check (is_same_org_restaurant(restaurant_id) and (can_manage_budget() or can_record_sales()));

create policy daily_sales_delete on daily_sales
  for delete to authenticated
  using (is_same_org_restaurant(restaurant_id) and (can_manage_budget() or can_record_sales()));

-- A manager has to be able to read back the rows they recorded -- the
-- re-upload diff ("here's what's already entered for this night vs. what
-- you just dropped") is unbuildable otherwise, and UPDATE requires a USING
-- clause the row satisfies anyway. This is per-day category revenue only;
-- the aggregated financial picture stays behind can_view_financials().
drop policy daily_sales_select on daily_sales;
create policy daily_sales_select on daily_sales
  for select to authenticated
  using (is_same_org_restaurant(restaurant_id) and (can_view_financials() or can_record_sales()));

-- The sales-entry UI has to label revenue lines ("Food sales", "Liquor
-- sales") by name, which means reading gl_accounts. Scope that to revenue
-- accounts only -- a manager still can't enumerate the COGS, labor, or
-- opex side of the chart of accounts.
drop policy gl_accounts_select on gl_accounts;
create policy gl_accounts_select on gl_accounts
  for select to authenticated
  using (
    organization_id = current_organization_id()
    and (
      can_view_financials()
      or (can_record_sales() and account_type = 'revenue')
    )
  );
