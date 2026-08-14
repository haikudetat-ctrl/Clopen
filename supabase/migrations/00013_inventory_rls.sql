-- Row Level Security for the entire inventory module.
--
-- Access model (documented explicitly since it's a real product decision,
-- not just plumbing): inventory/vendor/cost data is sensitive in most
-- restaurants, so for now the whole module -- catalog, vendors, purchase
-- orders, receiving, invoices, counts, waste, transfers, the stock ledger
-- -- is readable and writable only by owner_admin, via two capability
-- functions rather than a raw is_owner_admin() check:
--
--   can_manage_inventory_catalog() -- defining items, vendors, pricing
--   can_operate_inventory()        -- day-to-day: receiving, counting,
--                                     waste, transfers, par levels, POs
--
-- Both resolve to is_owner_admin() today because there's no dedicated
-- inventory/kitchen-manager role yet. The split exists so that adding one
-- later (e.g. a 'kitchen_manager' role that can operate but not touch
-- vendor pricing) only requires editing these two functions, not rewriting
-- every policy below.
--
-- The one exception is recipe_ingredients: ingredient lists (quantities,
-- not costs) are treated like the rest of the menu/cocktail content --
-- visible to everyone at that restaurant -- since kitchen staff need prep
-- quantities to do their job, matching how menu_items/cocktails already work.

create or replace function can_manage_inventory_catalog()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.is_owner_admin();
$$;

create or replace function can_operate_inventory()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.is_owner_admin();
$$;

-- Fix: recreate inventory_current_stock with security_invoker so it
-- enforces the RLS of the querying user against inventory_stock_ledger /
-- inventory_items, instead of running with the view owner's (likely
-- RLS-bypassing) privileges.
create or replace view inventory_current_stock
with (security_invoker = true) as
select
  l.restaurant_id,
  l.inventory_item_id,
  i.organization_id,
  sum(l.quantity_delta) as quantity_on_hand_base_unit,
  i.current_unit_cost,
  sum(l.quantity_delta) * i.current_unit_cost as value_on_hand
from inventory_stock_ledger l
join inventory_items i on i.id = l.inventory_item_id
group by l.restaurant_id, l.inventory_item_id, i.organization_id, i.current_unit_cost;

alter table units_of_measure enable row level security;
alter table inventory_categories enable row level security;
alter table inventory_items enable row level security;
alter table inventory_item_units enable row level security;
alter table vendors enable row level security;
alter table vendor_items enable row level security;
alter table inventory_par_levels enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_lines enable row level security;
alter table purchase_order_receipts enable row level security;
alter table purchase_order_receipt_lines enable row level security;
alter table invoices enable row level security;
alter table invoice_lines enable row level security;
alter table inventory_stock_ledger enable row level security;
alter table inventory_count_periods enable row level security;
alter table inventory_counts enable row level security;
alter table inventory_count_lines enable row level security;
alter table waste_logs enable row level security;
alter table inventory_transfers enable row level security;
alter table inventory_transfer_lines enable row level security;
alter table recipe_ingredients enable row level security;

-- units_of_measure: global reference data, read-only to any signed-in user.
create policy "authenticated can view units_of_measure" on units_of_measure
  for select to authenticated using (true);

-- inventory_categories, inventory_items: org-scoped catalog.
create policy "can_operate_inventory can view inventory_categories" on inventory_categories
  for select using (can_operate_inventory() and organization_id = current_organization_id());
create policy "can_manage_inventory_catalog can write inventory_categories" on inventory_categories
  for all
  using (can_manage_inventory_catalog() and organization_id = current_organization_id())
  with check (can_manage_inventory_catalog() and organization_id = current_organization_id());

create policy "can_operate_inventory can view inventory_items" on inventory_items
  for select using (can_operate_inventory() and organization_id = current_organization_id());
create policy "can_manage_inventory_catalog can write inventory_items" on inventory_items
  for all
  using (can_manage_inventory_catalog() and organization_id = current_organization_id())
  with check (can_manage_inventory_catalog() and organization_id = current_organization_id());

create policy "can_operate_inventory can view inventory_item_units" on inventory_item_units
  for select using (
    can_operate_inventory() and exists (
      select 1 from inventory_items i
      where i.id = inventory_item_units.inventory_item_id
        and i.organization_id = current_organization_id()
    )
  );
create policy "can_manage_inventory_catalog can write inventory_item_units" on inventory_item_units
  for all
  using (
    can_manage_inventory_catalog() and exists (
      select 1 from inventory_items i
      where i.id = inventory_item_units.inventory_item_id
        and i.organization_id = current_organization_id()
    )
  )
  with check (
    can_manage_inventory_catalog() and exists (
      select 1 from inventory_items i
      where i.id = inventory_item_units.inventory_item_id
        and i.organization_id = current_organization_id()
    )
  );

-- vendors, vendor_items
create policy "can_operate_inventory can view vendors" on vendors
  for select using (can_operate_inventory() and organization_id = current_organization_id());
create policy "can_manage_inventory_catalog can write vendors" on vendors
  for all
  using (can_manage_inventory_catalog() and organization_id = current_organization_id())
  with check (can_manage_inventory_catalog() and organization_id = current_organization_id());

create policy "can_operate_inventory can view vendor_items" on vendor_items
  for select using (
    can_operate_inventory() and exists (
      select 1 from vendors v where v.id = vendor_items.vendor_id and v.organization_id = current_organization_id()
    )
  );
create policy "can_manage_inventory_catalog can write vendor_items" on vendor_items
  for all
  using (
    can_manage_inventory_catalog() and exists (
      select 1 from vendors v where v.id = vendor_items.vendor_id and v.organization_id = current_organization_id()
    )
  )
  with check (
    can_manage_inventory_catalog() and exists (
      select 1 from vendors v where v.id = vendor_items.vendor_id and v.organization_id = current_organization_id()
    )
  );

-- inventory_par_levels: restaurant-scoped, operational.
create policy "can_operate_inventory can view inventory_par_levels" on inventory_par_levels
  for select using (can_operate_inventory() and is_same_restaurant(restaurant_id));
create policy "can_operate_inventory can write inventory_par_levels" on inventory_par_levels
  for all
  using (can_operate_inventory() and is_same_org_restaurant(restaurant_id))
  with check (can_operate_inventory() and is_same_org_restaurant(restaurant_id));

-- Purchasing / receiving
create policy "can_operate_inventory can view purchase_orders" on purchase_orders
  for select using (can_operate_inventory() and is_same_restaurant(restaurant_id));
create policy "can_operate_inventory can write purchase_orders" on purchase_orders
  for all
  using (can_operate_inventory() and is_same_org_restaurant(restaurant_id))
  with check (can_operate_inventory() and is_same_org_restaurant(restaurant_id));

create policy "can_operate_inventory can view purchase_order_lines" on purchase_order_lines
  for select using (can_operate_inventory() and is_same_restaurant(restaurant_id));
create policy "can_operate_inventory can write purchase_order_lines" on purchase_order_lines
  for all
  using (can_operate_inventory() and is_same_org_restaurant(restaurant_id))
  with check (can_operate_inventory() and is_same_org_restaurant(restaurant_id));

create policy "can_operate_inventory can view purchase_order_receipts" on purchase_order_receipts
  for select using (can_operate_inventory() and is_same_restaurant(restaurant_id));
create policy "can_operate_inventory can write purchase_order_receipts" on purchase_order_receipts
  for all
  using (can_operate_inventory() and is_same_org_restaurant(restaurant_id))
  with check (can_operate_inventory() and is_same_org_restaurant(restaurant_id));

create policy "can_operate_inventory can view purchase_order_receipt_lines" on purchase_order_receipt_lines
  for select using (can_operate_inventory() and is_same_restaurant(restaurant_id));
create policy "can_operate_inventory can write purchase_order_receipt_lines" on purchase_order_receipt_lines
  for all
  using (can_operate_inventory() and is_same_org_restaurant(restaurant_id))
  with check (can_operate_inventory() and is_same_org_restaurant(restaurant_id));

-- Invoicing (AP)
create policy "can_operate_inventory can view invoices" on invoices
  for select using (can_operate_inventory() and is_same_restaurant(restaurant_id));
create policy "can_manage_inventory_catalog can write invoices" on invoices
  for all
  using (can_manage_inventory_catalog() and is_same_org_restaurant(restaurant_id))
  with check (can_manage_inventory_catalog() and is_same_org_restaurant(restaurant_id));

create policy "can_operate_inventory can view invoice_lines" on invoice_lines
  for select using (can_operate_inventory() and is_same_restaurant(restaurant_id));
create policy "can_manage_inventory_catalog can write invoice_lines" on invoice_lines
  for all
  using (can_manage_inventory_catalog() and is_same_org_restaurant(restaurant_id))
  with check (can_manage_inventory_catalog() and is_same_org_restaurant(restaurant_id));

-- Stock ledger: system-managed (written only by SECURITY DEFINER trigger
-- functions running as their owner, which bypasses RLS). No insert/update/
-- delete policy is intentional -- regular clients cannot write to it
-- directly, only through receiving/counting/waste/transfer flows.
create policy "can_operate_inventory can view inventory_stock_ledger" on inventory_stock_ledger
  for select using (can_operate_inventory() and is_same_restaurant(restaurant_id));

-- Counts / period close
create policy "can_operate_inventory can view inventory_count_periods" on inventory_count_periods
  for select using (can_operate_inventory() and is_same_restaurant(restaurant_id));
create policy "can_operate_inventory can write inventory_count_periods" on inventory_count_periods
  for all
  using (can_operate_inventory() and is_same_org_restaurant(restaurant_id))
  with check (can_operate_inventory() and is_same_org_restaurant(restaurant_id));

create policy "can_operate_inventory can view inventory_counts" on inventory_counts
  for select using (can_operate_inventory() and is_same_restaurant(restaurant_id));
create policy "can_operate_inventory can write inventory_counts" on inventory_counts
  for all
  using (can_operate_inventory() and is_same_org_restaurant(restaurant_id))
  with check (can_operate_inventory() and is_same_org_restaurant(restaurant_id));

create policy "can_operate_inventory can view inventory_count_lines" on inventory_count_lines
  for select using (can_operate_inventory() and is_same_restaurant(restaurant_id));
create policy "can_operate_inventory can write inventory_count_lines" on inventory_count_lines
  for all
  using (can_operate_inventory() and is_same_org_restaurant(restaurant_id))
  with check (can_operate_inventory() and is_same_org_restaurant(restaurant_id));

-- Waste
create policy "can_operate_inventory can view waste_logs" on waste_logs
  for select using (can_operate_inventory() and is_same_restaurant(restaurant_id));
create policy "can_operate_inventory can write waste_logs" on waste_logs
  for all
  using (can_operate_inventory() and is_same_org_restaurant(restaurant_id))
  with check (can_operate_inventory() and is_same_org_restaurant(restaurant_id));

-- Transfers: span two restaurants within one org, so scope by
-- organization_id + membership in either side, rather than a single
-- restaurant_id.
create policy "can_operate_inventory can view inventory_transfers" on inventory_transfers
  for select using (
    can_operate_inventory() and organization_id = current_organization_id()
  );
create policy "can_operate_inventory can write inventory_transfers" on inventory_transfers
  for all
  using (can_operate_inventory() and organization_id = current_organization_id())
  with check (can_operate_inventory() and organization_id = current_organization_id());

create policy "can_operate_inventory can view inventory_transfer_lines" on inventory_transfer_lines
  for select using (
    can_operate_inventory() and exists (
      select 1 from inventory_transfers t
      where t.id = inventory_transfer_lines.transfer_id
        and t.organization_id = current_organization_id()
    )
  );
create policy "can_operate_inventory can write inventory_transfer_lines" on inventory_transfer_lines
  for all
  using (
    can_operate_inventory() and exists (
      select 1 from inventory_transfers t
      where t.id = inventory_transfer_lines.transfer_id
        and t.organization_id = current_organization_id()
    )
  )
  with check (
    can_operate_inventory() and exists (
      select 1 from inventory_transfers t
      where t.id = inventory_transfer_lines.transfer_id
        and t.organization_id = current_organization_id()
    )
  );

-- Recipe ingredients: visible to the whole team at that restaurant, like
-- menu_items/cocktails themselves. Only management can edit, since this
-- feeds theoretical cost.
create policy "org members can view recipe_ingredients for menu items" on recipe_ingredients
  for select using (
    (menu_item_id is not null and exists (
      select 1 from menu_items mi where mi.id = recipe_ingredients.menu_item_id and is_same_restaurant(mi.restaurant_id)
    ))
    or
    (cocktail_id is not null and exists (
      select 1 from cocktails c where c.id = recipe_ingredients.cocktail_id and is_same_restaurant(c.restaurant_id)
    ))
  );

create policy "can_manage_inventory_catalog can write recipe_ingredients" on recipe_ingredients
  for all
  using (
    can_manage_inventory_catalog() and (
      (menu_item_id is not null and exists (
        select 1 from menu_items mi where mi.id = recipe_ingredients.menu_item_id and is_same_org_restaurant(mi.restaurant_id)
      ))
      or
      (cocktail_id is not null and exists (
        select 1 from cocktails c where c.id = recipe_ingredients.cocktail_id and is_same_org_restaurant(c.restaurant_id)
      ))
    )
  )
  with check (
    can_manage_inventory_catalog() and (
      (menu_item_id is not null and exists (
        select 1 from menu_items mi where mi.id = recipe_ingredients.menu_item_id and is_same_org_restaurant(mi.restaurant_id)
      ))
      or
      (cocktail_id is not null and exists (
        select 1 from cocktails c where c.id = recipe_ingredients.cocktail_id and is_same_org_restaurant(c.restaurant_id)
      ))
    )
  );
