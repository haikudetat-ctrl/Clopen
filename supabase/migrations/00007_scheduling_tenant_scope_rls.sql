-- Tenant-scopes and locks down the scheduling subsystem (staff,
-- availability, shift_templates, shift_requirements, schedules,
-- schedule_assignments), which previously had RLS disabled and no
-- restaurant_id at all -- fully exposed to the anon/authenticated
-- Supabase client roles with zero tenant isolation.
--
-- staff / shift_templates / schedules are the "root" tables that get a
-- restaurant_id column directly. availability, shift_requirements, and
-- schedule_assignments derive their restaurant scope through those roots.
--
-- Note: `staff` here is a standalone roster (name/roles/skill_level) with
-- no link to `profiles`/auth.users, so there's no way yet to let an
-- individual staff member manage their own availability -- that needs a
-- staff.user_id -> profiles.id column as a follow-up. For now, read access
-- is restaurant-wide (matching the pattern used for shift_notes, menu_items,
-- etc.) and all writes are restricted to owner_admin.

alter table staff add column restaurant_id uuid references restaurants(id);
alter table shift_templates add column restaurant_id uuid references restaurants(id);
alter table schedules add column restaurant_id uuid references restaurants(id);

do $$
declare
  restaurant_count integer;
  default_restaurant_id uuid;
begin
  select count(*) into restaurant_count from restaurants;

  if restaurant_count = 1 then
    select id into default_restaurant_id from restaurants limit 1;

    update staff set restaurant_id = default_restaurant_id where restaurant_id is null;
    update shift_templates set restaurant_id = default_restaurant_id where restaurant_id is null;
    update schedules set restaurant_id = default_restaurant_id where restaurant_id is null;
  elsif exists (
    select 1 from staff where restaurant_id is null
    union all select 1 from shift_templates where restaurant_id is null
    union all select 1 from schedules where restaurant_id is null
  ) then
    raise exception 'Cannot auto-backfill restaurant_id: % restaurants exist and some scheduling rows are unassigned. Backfill manually before re-running.', restaurant_count;
  end if;
end $$;

alter table staff alter column restaurant_id set not null;
alter table shift_templates alter column restaurant_id set not null;
alter table schedules alter column restaurant_id set not null;

create index staff_restaurant_id_idx on staff(restaurant_id);
create index shift_templates_restaurant_id_idx on shift_templates(restaurant_id);
create index schedules_restaurant_id_idx on schedules(restaurant_id);

alter table staff enable row level security;
alter table availability enable row level security;
alter table shift_templates enable row level security;
alter table shift_requirements enable row level security;
alter table schedules enable row level security;
alter table schedule_assignments enable row level security;

create policy "staff_select_active_same_restaurant" on staff
  for select using (active and is_same_restaurant(restaurant_id));

create policy "staff_owner_all" on staff
  for all using (is_owner_admin() and is_same_org_restaurant(restaurant_id))
  with check (is_owner_admin() and is_same_org_restaurant(restaurant_id));

create policy "shift_templates_select_same_restaurant" on shift_templates
  for select using (is_same_restaurant(restaurant_id));

create policy "shift_templates_owner_all" on shift_templates
  for all using (is_owner_admin() and is_same_org_restaurant(restaurant_id))
  with check (is_owner_admin() and is_same_org_restaurant(restaurant_id));

create policy "schedules_select_same_restaurant" on schedules
  for select using (is_same_restaurant(restaurant_id));

create policy "schedules_owner_all" on schedules
  for all using (is_owner_admin() and is_same_org_restaurant(restaurant_id))
  with check (is_owner_admin() and is_same_org_restaurant(restaurant_id));

create policy "availability_select_same_restaurant" on availability
  for select using (
    exists (
      select 1 from staff s
      where s.id = availability.staff_id
        and is_same_restaurant(s.restaurant_id)
    )
  );

create policy "availability_owner_all" on availability
  for all using (
    is_owner_admin() and exists (
      select 1 from staff s
      where s.id = availability.staff_id
        and is_same_org_restaurant(s.restaurant_id)
    )
  )
  with check (
    is_owner_admin() and exists (
      select 1 from staff s
      where s.id = availability.staff_id
        and is_same_org_restaurant(s.restaurant_id)
    )
  );

create policy "shift_requirements_select_same_restaurant" on shift_requirements
  for select using (
    exists (
      select 1 from shift_templates t
      where t.id = shift_requirements.template_id
        and is_same_restaurant(t.restaurant_id)
    )
  );

create policy "shift_requirements_owner_all" on shift_requirements
  for all using (
    is_owner_admin() and exists (
      select 1 from shift_templates t
      where t.id = shift_requirements.template_id
        and is_same_org_restaurant(t.restaurant_id)
    )
  )
  with check (
    is_owner_admin() and exists (
      select 1 from shift_templates t
      where t.id = shift_requirements.template_id
        and is_same_org_restaurant(t.restaurant_id)
    )
  );

create policy "schedule_assignments_select_same_restaurant" on schedule_assignments
  for select using (
    exists (
      select 1 from schedules sc
      where sc.id = schedule_assignments.schedule_id
        and is_same_restaurant(sc.restaurant_id)
    )
  );

create policy "schedule_assignments_owner_all" on schedule_assignments
  for all using (
    is_owner_admin() and exists (
      select 1 from schedules sc
      where sc.id = schedule_assignments.schedule_id
        and is_same_org_restaurant(sc.restaurant_id)
    )
  )
  with check (
    is_owner_admin() and exists (
      select 1 from schedules sc
      where sc.id = schedule_assignments.schedule_id
        and is_same_org_restaurant(sc.restaurant_id)
    )
  );
