-- Links the standalone `staff` roster to a real login (`profiles`), closing
-- the gap called out in 00007_scheduling_tenant_scope_rls.sql: "staff here
-- is a standalone roster ... no way yet to let an individual staff member
-- manage their own availability -- that needs a staff.user_id -> profiles.id
-- column as a follow-up."
--
-- Nullable and optional: not every staff row will have a login (e.g. staff
-- who aren't given app access), and not every profile is on the staff
-- roster (e.g. an owner_admin who doesn't work shifts). Unique when set, so
-- one login maps to at most one staff row.

alter table public.staff add column user_id uuid references public.profiles(id);

create unique index staff_user_id_key on public.staff(user_id) where user_id is not null;

-- Lets a linked staff member manage (insert/update/delete) their own
-- availability rows directly, alongside the existing owner_admin-only
-- "availability_owner_all" policy from 00007. Read access is unchanged --
-- already restaurant-wide via "availability_select_same_restaurant".
create policy "availability_self_manage" on public.availability
  for all using (
    exists (
      select 1 from public.staff s
      where s.id = availability.staff_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.staff s
      where s.id = availability.staff_id
        and s.user_id = auth.uid()
    )
  );
