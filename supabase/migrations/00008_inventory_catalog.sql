-- Inventory foundation, part 1: units of measure, item catalog, vendors,
-- and par levels. This is the base layer everything else (purchasing,
-- receiving, counts, recipe costing) builds on.
--
-- Design decisions (see conversation for rationale):
--   - Item catalog and vendor list are ORG-scoped (shared across a multi-
--     location operator's restaurants), not per-restaurant.
--   - Every item has a base_unit (the unit its cost and all ledger math is
--     stored in). Other purchase/count/recipe units convert to it via
--     inventory_item_units.conversion_factor.
--   - units_of_measure is a global reference table, not tenant-scoped.

create table units_of_measure (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  abbreviation text not null unique,
  unit_type text not null check (unit_type in ('count', 'weight', 'volume')),
  created_at timestamptz not null default now()
);

create table inventory_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  parent_category_id uuid references inventory_categories(id) on delete set null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index inventory_categories_organization_id_idx on inventory_categories(organization_id);

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  category_id uuid references inventory_categories(id) on delete set null,
  name text not null,
  sku text,
  base_unit_id uuid not null references units_of_measure(id),
  -- Cost per base_unit. Maintained by trigger from the most recent receipt
  -- ("last cost" method). See 00009 for the trigger that updates this.
  current_unit_cost numeric(12, 4) not null default 0,
  costing_method text not null default 'last_cost' check (costing_method in ('last_cost', 'weighted_average')),
  storage_location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inventory_items_organization_id_idx on inventory_items(organization_id);
create index inventory_items_category_id_idx on inventory_items(category_id);

-- Per-item unit conversions. Every row not equal to the item's base_unit
-- must appear here before it can be used anywhere (PO, receipt, count,
-- recipe) -- to_base_unit_quantity() below raises if it's missing, rather
-- than silently guessing.
create table inventory_item_units (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  unit_id uuid not null references units_of_measure(id),
  -- How many of the item's base_unit one of *this* unit equals.
  -- E.g. base_unit = fl_oz; unit = bottle (750ml); conversion_factor = 25.36
  conversion_factor numeric(14, 6) not null check (conversion_factor > 0),
  is_purchase_unit boolean not null default false,
  is_count_unit boolean not null default false,
  is_recipe_unit boolean not null default false,
  created_at timestamptz not null default now(),
  unique (inventory_item_id, unit_id)
);

create index inventory_item_units_item_id_idx on inventory_item_units(inventory_item_id);

-- Converts a quantity expressed in `p_unit_id` to the item's base_unit.
-- Raises rather than guessing if the item/unit pair has no defined
-- conversion -- a missing conversion should be a loud error, not a silent
-- data-integrity bug that only shows up in a cost report months later.
create or replace function to_base_unit_quantity(p_item_id uuid, p_quantity numeric, p_unit_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_base_unit_id uuid;
  v_factor numeric;
begin
  select base_unit_id into v_base_unit_id from public.inventory_items where id = p_item_id;

  if v_base_unit_id is null then
    raise exception 'inventory_item % not found', p_item_id;
  end if;

  if p_unit_id = v_base_unit_id then
    return p_quantity;
  end if;

  select conversion_factor into v_factor
  from public.inventory_item_units
  where inventory_item_id = p_item_id and unit_id = p_unit_id;

  if v_factor is null then
    raise exception 'no unit conversion defined for inventory_item % and unit %. Add a row to inventory_item_units first.', p_item_id, p_unit_id;
  end if;

  return p_quantity * v_factor;
end;
$$;

create table vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  account_number text,
  contact_name text,
  contact_email text,
  contact_phone text,
  payment_terms text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendors_organization_id_idx on vendors(organization_id);

-- Which vendors sell a given item, in what pack/unit, at what cost. An item
-- can have multiple vendor_items (multiple vendors, or the same vendor with
-- multiple pack sizes) -- is_preferred marks the default for reordering.
create table vendor_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  vendor_sku text,
  pack_description text,
  purchase_unit_id uuid not null references units_of_measure(id),
  current_unit_cost numeric(12, 4) not null,
  is_preferred boolean not null default false,
  last_purchased_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, inventory_item_id, purchase_unit_id)
);

create index vendor_items_vendor_id_idx on vendor_items(vendor_id);
create index vendor_items_inventory_item_id_idx on vendor_items(inventory_item_id);

-- Location-level par levels drive reorder suggestions (see
-- inventory_reorder_suggestions() in 00010).
create table inventory_par_levels (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  par_level_quantity numeric(14, 4) not null default 0,
  reorder_point numeric(14, 4) not null default 0,
  preferred_vendor_item_id uuid references vendor_items(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (inventory_item_id, restaurant_id)
);

create index inventory_par_levels_restaurant_id_idx on inventory_par_levels(restaurant_id);

-- Defensive integrity check: an item's org must match the restaurant's org
-- wherever both appear together. Without this, a bug (or a compromised
-- client) could silently associate one tenant's catalog item with another
-- tenant's restaurant.
create or replace function validate_item_restaurant_same_org()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item_org uuid;
  v_restaurant_org uuid;
begin
  select organization_id into v_item_org from public.inventory_items where id = new.inventory_item_id;
  select organization_id into v_restaurant_org from public.restaurants where id = new.restaurant_id;

  if v_item_org is null or v_restaurant_org is null or v_item_org <> v_restaurant_org then
    raise exception 'inventory_item % and restaurant % do not belong to the same organization', new.inventory_item_id, new.restaurant_id;
  end if;

  return new;
end;
$$;

create trigger validate_par_level_same_org
  before insert or update of inventory_item_id, restaurant_id on inventory_par_levels
  for each row execute function validate_item_restaurant_same_org();
