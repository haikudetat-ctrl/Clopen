-- Adds a multi-tenant `organizations` layer on top of the existing
-- single-restaurant schema, and fixes a cross-tenant isolation gap:
-- `is_owner_admin()` previously checked only `profiles.role`, with no
-- restaurant or org scoping, so any owner_admin could read/write every
-- other tenant's data via the *_owner_all policies. This migration scopes
-- every one of those policies to the caller's organization.
--
-- Model: an organization can own multiple restaurants (locations). A
-- profile's restaurant_id is the location a staff member works day to day;
-- organization_id is derived from that automatically. An owner_admin who
-- oversees multiple locations can have restaurant_id = null and
-- organization_id set directly, giving them org-wide access without being
-- tied to one location.

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table restaurants
  add column organization_id uuid references organizations(id);

alter table profiles
  add column organization_id uuid references organizations(id);

create index restaurants_organization_id_idx on restaurants(organization_id);
create index profiles_organization_id_idx on profiles(organization_id);

-- Keep profiles.organization_id in sync with the assigned restaurant's org,
-- so app code only needs to set restaurant_id for location-scoped staff.
create or replace function sync_profile_organization()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.restaurant_id is not null then
    select organization_id into new.organization_id
    from public.restaurants
    where id = new.restaurant_id;
  end if;
  return new;
end;
$$;

create trigger sync_profile_organization_trigger
  before insert or update of restaurant_id on profiles
  for each row execute function sync_profile_organization();

create or replace function current_organization_id()
returns uuid
language sql
stable security definer
set search_path to ''
as $$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function is_same_org_restaurant(target_restaurant_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.restaurants r
    where r.id = target_restaurant_id
      and r.organization_id = public.current_organization_id()
  );
$$;

alter table organizations enable row level security;

create policy "org members can view own org" on organizations
  for select using (id = current_organization_id());

create policy "owner_admin can update own org" on organizations
  for update using (is_owner_admin() and id = current_organization_id());

-- Re-scope every *_owner_all / *_owner_select policy from a bare
-- is_owner_admin() (global) to is_owner_admin() + organization match.

drop policy "restaurants_owner_all" on restaurants;
create policy "restaurants_owner_all" on restaurants
  for all using (is_owner_admin() and organization_id = current_organization_id())
  with check (is_owner_admin() and organization_id = current_organization_id());

drop policy "profiles_owner_all" on profiles;
create policy "profiles_owner_all" on profiles
  for all using (is_owner_admin() and organization_id = current_organization_id())
  with check (is_owner_admin() and organization_id = current_organization_id());

drop policy "beverage_categories_owner_all" on beverage_categories;
create policy "beverage_categories_owner_all" on beverage_categories
  for all using (is_owner_admin() and is_same_org_restaurant(restaurant_id))
  with check (is_owner_admin() and is_same_org_restaurant(restaurant_id));

drop policy "beverage_items_owner_all" on beverage_items;
create policy "beverage_items_owner_all" on beverage_items
  for all using (is_owner_admin() and is_same_org_restaurant(restaurant_id))
  with check (is_owner_admin() and is_same_org_restaurant(restaurant_id));

drop policy "cocktails_owner_all" on cocktails;
create policy "cocktails_owner_all" on cocktails
  for all using (is_owner_admin() and is_same_org_restaurant(restaurant_id))
  with check (is_owner_admin() and is_same_org_restaurant(restaurant_id));

drop policy "cocktail_versions_owner_all" on cocktail_versions;
create policy "cocktail_versions_owner_all" on cocktail_versions
  for all using (
    is_owner_admin() and exists (
      select 1 from cocktails c
      where c.id = cocktail_versions.cocktail_id
        and is_same_org_restaurant(c.restaurant_id)
    )
  )
  with check (
    is_owner_admin() and exists (
      select 1 from cocktails c
      where c.id = cocktail_versions.cocktail_id
        and is_same_org_restaurant(c.restaurant_id)
    )
  );

drop policy "menu_categories_owner_all" on menu_categories;
create policy "menu_categories_owner_all" on menu_categories
  for all using (is_owner_admin() and is_same_org_restaurant(restaurant_id))
  with check (is_owner_admin() and is_same_org_restaurant(restaurant_id));

drop policy "menu_items_owner_all" on menu_items;
create policy "menu_items_owner_all" on menu_items
  for all using (is_owner_admin() and is_same_org_restaurant(restaurant_id))
  with check (is_owner_admin() and is_same_org_restaurant(restaurant_id));

drop policy "menu_item_faqs_owner_all" on menu_item_faqs;
create policy "menu_item_faqs_owner_all" on menu_item_faqs
  for all using (
    is_owner_admin() and exists (
      select 1 from menu_items mi
      where mi.id = menu_item_faqs.menu_item_id
        and is_same_org_restaurant(mi.restaurant_id)
    )
  )
  with check (
    is_owner_admin() and exists (
      select 1 from menu_items mi
      where mi.id = menu_item_faqs.menu_item_id
        and is_same_org_restaurant(mi.restaurant_id)
    )
  );

drop policy "menu_item_allergen_guidance_owner_all" on menu_item_allergen_guidance;
create policy "menu_item_allergen_guidance_owner_all" on menu_item_allergen_guidance
  for all using (
    is_owner_admin() and exists (
      select 1 from menu_items mi
      where mi.id = menu_item_allergen_guidance.menu_item_id
        and is_same_org_restaurant(mi.restaurant_id)
    )
  )
  with check (
    is_owner_admin() and exists (
      select 1 from menu_items mi
      where mi.id = menu_item_allergen_guidance.menu_item_id
        and is_same_org_restaurant(mi.restaurant_id)
    )
  );

drop policy "shift_notes_owner_all" on shift_notes;
create policy "shift_notes_owner_all" on shift_notes
  for all using (is_owner_admin() and is_same_org_restaurant(restaurant_id))
  with check (is_owner_admin() and is_same_org_restaurant(restaurant_id));

drop policy "shift_note_ack_owner_all" on shift_note_acknowledgements;
create policy "shift_note_ack_owner_all" on shift_note_acknowledgements
  for all using (
    is_owner_admin() and exists (
      select 1 from shift_notes n
      where n.id = shift_note_acknowledgements.shift_note_id
        and is_same_org_restaurant(n.restaurant_id)
    )
  )
  with check (
    is_owner_admin() and exists (
      select 1 from shift_notes n
      where n.id = shift_note_acknowledgements.shift_note_id
        and is_same_org_restaurant(n.restaurant_id)
    )
  );

drop policy "staff_questions_owner_all" on staff_questions;
create policy "staff_questions_owner_all" on staff_questions
  for all using (is_owner_admin() and is_same_org_restaurant(restaurant_id))
  with check (is_owner_admin() and is_same_org_restaurant(restaurant_id));

drop policy "staff_suggestions_owner_all" on staff_suggestions;
create policy "staff_suggestions_owner_all" on staff_suggestions
  for all using (is_owner_admin() and is_same_org_restaurant(restaurant_id))
  with check (is_owner_admin() and is_same_org_restaurant(restaurant_id));

drop policy "training_modules_owner_all" on training_modules;
create policy "training_modules_owner_all" on training_modules
  for all using (is_owner_admin() and is_same_org_restaurant(restaurant_id))
  with check (is_owner_admin() and is_same_org_restaurant(restaurant_id));

drop policy "training_sections_owner_all" on training_sections;
create policy "training_sections_owner_all" on training_sections
  for all using (
    is_owner_admin() and exists (
      select 1 from training_modules tm
      where tm.id = training_sections.module_id
        and is_same_org_restaurant(tm.restaurant_id)
    )
  )
  with check (
    is_owner_admin() and exists (
      select 1 from training_modules tm
      where tm.id = training_sections.module_id
        and is_same_org_restaurant(tm.restaurant_id)
    )
  );

drop policy "training_questions_owner_all" on training_questions;
create policy "training_questions_owner_all" on training_questions
  for all using (
    is_owner_admin() and exists (
      select 1 from training_modules tm
      where tm.id = training_questions.module_id
        and is_same_org_restaurant(tm.restaurant_id)
    )
  )
  with check (
    is_owner_admin() and exists (
      select 1 from training_modules tm
      where tm.id = training_questions.module_id
        and is_same_org_restaurant(tm.restaurant_id)
    )
  );

drop policy "training_progress_owner_all" on training_progress;
create policy "training_progress_owner_all" on training_progress
  for all using (
    is_owner_admin() and exists (
      select 1 from training_modules tm
      where tm.id = training_progress.module_id
        and is_same_org_restaurant(tm.restaurant_id)
    )
  )
  with check (
    is_owner_admin() and exists (
      select 1 from training_modules tm
      where tm.id = training_progress.module_id
        and is_same_org_restaurant(tm.restaurant_id)
    )
  );

drop policy "usage_events_owner_select" on usage_events;
create policy "usage_events_owner_select" on usage_events
  for select using (
    is_owner_admin() and (restaurant_id is null or is_same_org_restaurant(restaurant_id))
  );
