-- inventory_stock_ledger had no way to record WHY a waste entry happened,
-- and (like every other ledger-mutating path in this app -- receiving,
-- count-close) had no direct INSERT RLS policy at all, only SELECT. Adding
-- columns for a structured reason plus free-text detail, and a
-- SECURITY DEFINER function to post waste the same way everything else
-- posts to this ledger, rather than opening up direct table access.
alter table public.inventory_stock_ledger add column reason_code text;
alter table public.inventory_stock_ledger add column notes text;

create or replace function public.inventory_log_waste(
  p_restaurant_id uuid,
  p_inventory_item_id uuid,
  p_quantity_base_unit numeric,
  p_reason_code text,
  p_notes text default null,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_unit_cost numeric;
  v_org_id uuid;
  v_ledger_id uuid;
begin
  if not (public.is_same_org_restaurant(p_restaurant_id) and public.can_operate_inventory()) then
    raise exception 'not authorized to log waste for restaurant %', p_restaurant_id;
  end if;

  if p_quantity_base_unit is null or p_quantity_base_unit <= 0 then
    raise exception 'quantity must be a positive number';
  end if;

  select organization_id, current_unit_cost into v_org_id, v_unit_cost
  from public.inventory_items
  where id = p_inventory_item_id;

  if v_org_id is null then
    raise exception 'inventory item % not found', p_inventory_item_id;
  end if;

  if v_org_id <> public.current_organization_id() then
    raise exception 'inventory item % does not belong to your organization', p_inventory_item_id;
  end if;

  insert into public.inventory_stock_ledger
    (restaurant_id, inventory_item_id, transaction_type, quantity_delta, unit_cost_at_transaction, reason_code, notes, occurred_at, created_by)
  values
    (p_restaurant_id, p_inventory_item_id, 'waste', -abs(p_quantity_base_unit), coalesce(v_unit_cost, 0), p_reason_code, p_notes, p_occurred_at, auth.uid())
  returning id into v_ledger_id;

  return v_ledger_id;
end;
$function$;
