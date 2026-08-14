-- Menu engineering support: cocktails had no price column at all (unlike
-- menu_items), and none of the weight-based shared inventory items had any
-- inventory_item_units row -- so a recipe couldn't be written in a natural
-- kitchen unit like "6oz" for a produce item, or fl oz for the syrup
-- (whose base unit is gallons). This adds the missing price column and the
-- missing recipe-unit conversions using the schema's own is_recipe_unit flag.
alter table public.cocktails add column price numeric;

insert into public.inventory_item_units (inventory_item_id, unit_id, conversion_factor, is_purchase_unit, is_count_unit, is_recipe_unit)
values
  ('30000000-0000-4000-9000-000000000001', 'dca1523e-b2fd-4333-9d5d-1b56db9e5397', 0.0625, false, false, true), -- Tomatoes, ounce
  ('30000000-0000-4000-9000-000000000002', 'dca1523e-b2fd-4333-9d5d-1b56db9e5397', 0.0625, false, false, true), -- Lettuce, ounce
  ('30000000-0000-4000-9000-000000000003', 'dca1523e-b2fd-4333-9d5d-1b56db9e5397', 0.0625, false, false, true), -- Onions, ounce
  ('30000000-0000-4000-9000-000000000006', 'dca1523e-b2fd-4333-9d5d-1b56db9e5397', 0.0625, false, false, true), -- Salmon Fillet, ounce
  ('30000000-0000-4000-9000-000000000008', 'dca1523e-b2fd-4333-9d5d-1b56db9e5397', 0.0625, false, false, true); -- Coffee Beans, ounce

insert into public.inventory_item_units (inventory_item_id, unit_id, conversion_factor, is_purchase_unit, is_count_unit, is_recipe_unit)
values ('30000000-0000-4000-9000-000000000007', 'e3826895-0ad7-4962-94e8-077cfa905f93', 0.0078125, false, false, true); -- Soda Syrup: 1 fl oz = 1/128 gal

-- Batched menu-engineering read: one row per active menu item and cocktail
-- with theoretical cost, cost %, and a target-cost flag. Built as a single
-- set-returning function (rather than looping inventory_recipe_theoretical_cost
-- per item client-side) since a real menu can easily be 50-100+ items and
-- that many round trips per page load isn't reasonable.
create or replace function public.inventory_menu_engineering(p_restaurant_id uuid)
returns table (
  kind text,
  item_id uuid,
  name text,
  category_name text,
  price numeric,
  theoretical_cost numeric,
  cost_pct numeric,
  is_costed boolean,
  target_pct numeric,
  over_target boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  with authorized as (
    select public.is_same_org_restaurant(p_restaurant_id) and public.can_view_financials() as ok
  ),
  food as (
    select
      'food'::text as kind,
      mi.id as item_id,
      mi.name,
      mc.name as category_name,
      mi.price,
      coalesce(sum((ri.quantity_base_unit / (ri.yield_percent / 100.0)) * ii.current_unit_cost), 0) as theoretical_cost,
      bool_or(ri.id is not null) as is_costed
    from public.menu_items mi
    left join public.menu_categories mc on mc.id = mi.category_id
    left join public.recipe_ingredients ri on ri.menu_item_id = mi.id
    left join public.inventory_items ii on ii.id = ri.inventory_item_id
    where mi.restaurant_id = p_restaurant_id and mi.is_active and (select ok from authorized)
    group by mi.id, mi.name, mc.name, mi.price
  ),
  beverage as (
    select
      'beverage'::text,
      c.id,
      c.name,
      c.category,
      c.price,
      coalesce(sum((ri.quantity_base_unit / (ri.yield_percent / 100.0)) * ii.current_unit_cost), 0),
      bool_or(ri.id is not null)
    from public.cocktails c
    left join public.recipe_ingredients ri on ri.cocktail_id = c.id
    left join public.inventory_items ii on ii.id = ri.inventory_item_id
    where c.restaurant_id = p_restaurant_id and c.is_active and (select ok from authorized)
    group by c.id, c.name, c.category, c.price
  ),
  combined as (
    select * from food
    union all
    select * from beverage
  )
  select
    kind,
    item_id,
    name,
    category_name,
    price,
    theoretical_cost,
    case when price is null or price = 0 then null else round(theoretical_cost / price * 100, 1) end as cost_pct,
    is_costed,
    case when kind = 'food' then 30.0 else 20.0 end as target_pct,
    case
      when price is null or price = 0 then false
      when kind = 'food' then (theoretical_cost / price * 100) > 30.0
      else (theoretical_cost / price * 100) > 20.0
    end as over_target
  from combined
  order by kind, name;
$function$;
