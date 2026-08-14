-- Seed a representative set of recipe-costed items so the menu
-- engineering feature has real numbers to show. recipe_ingredients was
-- completely empty and every menu_items.price was null -- there was
-- nothing to cost. Only items that plausibly use the 12 shared inventory
-- items get a real recipe; everything else remains "not yet costed",
-- an honest state for a partially-rolled-out costing effort. Requires
-- 00030's price column and recipe-unit conversions.
do $$
declare
  v_restaurant_id uuid := '00000000-0000-4000-8000-000000000001';
  v_oz uuid := 'dca1523e-b2fd-4333-9d5d-1b56db9e5397';
  v_fl_oz uuid := 'e3826895-0ad7-4962-94e8-077cfa905f93';
  v_tomatoes uuid := '30000000-0000-4000-9000-000000000001';
  v_lettuce uuid := '30000000-0000-4000-9000-000000000002';
  v_onions uuid := '30000000-0000-4000-9000-000000000003';
  v_salmon uuid := '30000000-0000-4000-9000-000000000006';
  v_soda_syrup uuid := '30000000-0000-4000-9000-000000000007';
  v_coffee uuid := '30000000-0000-4000-9000-000000000008';
  v_vodka uuid := '30000000-0000-4000-9000-000000000009';
  v_whiskey uuid := '30000000-0000-4000-9000-00000000000a';
  v_lager uuid := '30000000-0000-4000-9000-00000000000b';
  v_red_wine uuid := '30000000-0000-4000-9000-00000000000c';
  v_martini_id uuid := '00000000-0000-4000-8000-000000000601';
  v_whiskey_id uuid := gen_random_uuid();
  v_lager_id uuid := gen_random_uuid();
  v_wine_id uuid := gen_random_uuid();
  v_soda_id uuid := gen_random_uuid();
  v_coffee_id uuid := gen_random_uuid();
begin
  update public.menu_items set price = 14.00 where id = '484f983f-9892-4daf-afda-62a0f87877d6'; -- Marinated Roma Tomatoes
  update public.menu_items set price = 16.00 where id = '895341bb-57db-4c08-9e4b-39b91c3d4b78'; -- Insalata Mista
  update public.menu_items set price = 24.00 where id = 'd71a41be-0402-43f5-8624-81ec581eb4c7'; -- King Salmon Crudo Bruschetta

  insert into public.recipe_ingredients (menu_item_id, inventory_item_id, quantity, unit_id, sort_order)
  values
    ('484f983f-9892-4daf-afda-62a0f87877d6', v_tomatoes, 6, v_oz, 1),
    ('484f983f-9892-4daf-afda-62a0f87877d6', v_onions, 0.5, v_oz, 2),
    ('895341bb-57db-4c08-9e4b-39b91c3d4b78', v_lettuce, 4, v_oz, 1),
    ('895341bb-57db-4c08-9e4b-39b91c3d4b78', v_tomatoes, 2, v_oz, 2),
    ('895341bb-57db-4c08-9e4b-39b91c3d4b78', v_onions, 1, v_oz, 3),
    ('d71a41be-0402-43f5-8624-81ec581eb4c7', v_salmon, 4, v_oz, 1);

  update public.cocktails set price = 16.00 where id = v_martini_id;
  insert into public.recipe_ingredients (cocktail_id, inventory_item_id, quantity, unit_id, sort_order)
  values (v_martini_id, v_vodka, 2.5, v_fl_oz, 1);

  -- New beverage-program entries covering the rest of the shared catalog
  -- (whiskey, beer, wine, soda, coffee) so the whole catalog has at least
  -- one costed item against it, not just the one pre-existing cocktail.
  insert into public.cocktails (id, restaurant_id, name, category, price, is_active)
  values
    (v_whiskey_id, v_restaurant_id, 'House Whiskey, Neat', 'house', 15.00, true),
    (v_lager_id, v_restaurant_id, 'Draft Lager', 'house', 8.00, true),
    (v_wine_id, v_restaurant_id, 'House Red Wine, Glass', 'house', 14.00, true),
    (v_soda_id, v_restaurant_id, 'Fountain Soda', 'zero_proof', 4.00, true),
    (v_coffee_id, v_restaurant_id, 'Drip Coffee', 'zero_proof', 5.00, true);

  insert into public.recipe_ingredients (cocktail_id, inventory_item_id, quantity, unit_id, sort_order)
  values
    (v_whiskey_id, v_whiskey, 2, v_fl_oz, 1),
    (v_lager_id, v_lager, 16, v_fl_oz, 1),
    (v_wine_id, v_red_wine, 6, v_fl_oz, 1),
    (v_soda_id, v_soda_syrup, 1, v_fl_oz, 1),
    (v_coffee_id, v_coffee, 0.4, v_oz, 1);
end $$;
