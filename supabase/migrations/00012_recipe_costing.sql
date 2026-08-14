-- Inventory foundation, part 5: links menu_items/cocktails to
-- inventory_items so theoretical food/beverage cost can be computed
-- straight from the data, once real vendor costs are flowing in.

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid references menu_items(id) on delete cascade,
  cocktail_id uuid references cocktails(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id),
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_id uuid not null references units_of_measure(id),
  quantity_base_unit numeric(14, 4),
  -- Accounts for prep loss (e.g. peeling, trimming, evaporation). 100 =
  -- no loss; 80 means you need 1/0.8x the usable quantity of raw product.
  yield_percent numeric(5, 2) not null default 100 check (yield_percent > 0 and yield_percent <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (num_nonnulls(menu_item_id, cocktail_id) = 1)
);

create index recipe_ingredients_menu_item_id_idx on recipe_ingredients(menu_item_id);
create index recipe_ingredients_cocktail_id_idx on recipe_ingredients(cocktail_id);
create index recipe_ingredients_inventory_item_id_idx on recipe_ingredients(inventory_item_id);

create or replace function recipe_ingredient_before_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_restaurant_id uuid;
  v_restaurant_org uuid;
  v_item_org uuid;
begin
  if new.menu_item_id is not null then
    select restaurant_id into v_restaurant_id from public.menu_items where id = new.menu_item_id;
  else
    select restaurant_id into v_restaurant_id from public.cocktails where id = new.cocktail_id;
  end if;

  select organization_id into v_restaurant_org from public.restaurants where id = v_restaurant_id;
  select organization_id into v_item_org from public.inventory_items where id = new.inventory_item_id;

  if v_restaurant_org is null or v_item_org is null or v_restaurant_org <> v_item_org then
    raise exception 'recipe_ingredients: the menu item/cocktail''s restaurant and the inventory_item must belong to the same organization';
  end if;

  new.quantity_base_unit := public.to_base_unit_quantity(new.inventory_item_id, new.quantity, new.unit_id);

  return new;
end;
$$;

create trigger recipe_ingredient_before_insert_trigger
  before insert on recipe_ingredients
  for each row execute function recipe_ingredient_before_insert();

-- Theoretical cost for one menu item or cocktail (pass exactly one arg),
-- summed across its ingredients at current inventory cost, adjusted for
-- prep yield.
create or replace function inventory_recipe_theoretical_cost(p_menu_item_id uuid default null, p_cocktail_id uuid default null)
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(sum(
    (ri.quantity_base_unit / (ri.yield_percent / 100.0)) * ii.current_unit_cost
  ), 0)
  from public.recipe_ingredients ri
  join public.inventory_items ii on ii.id = ri.inventory_item_id
  where (p_menu_item_id is not null and ri.menu_item_id = p_menu_item_id)
     or (p_cocktail_id is not null and ri.cocktail_id = p_cocktail_id);
$$;
