-- Security fix, same class of bug as 00021 (gl_function_authorization_hardening),
-- just found in the older inventory module: inventory_close_count_period()
-- and receive_inventory_transfer() are SECURITY DEFINER functions exposed
-- over RPC to any authenticated user, and neither checked that the caller
-- actually belongs to the org that owns the count period / transfer before
-- acting on it. Since SECURITY DEFINER bypasses RLS, an authenticated user
-- from any organization could previously have called either function with
-- a guessed or enumerated UUID and closed another org's count period
-- (posting ledger adjustments) or marked another org's transfer received
-- (moving stock and cost) -- a write-side cross-tenant hole, not just a
-- read one.

create or replace function inventory_close_count_period(p_count_period_id uuid)
returns table (inventory_item_id uuid, variance_base_unit numeric, variance_value numeric)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text;
  v_restaurant_id uuid;
  v_unsubmitted_count integer;
begin
  select status, restaurant_id into v_status, v_restaurant_id
  from public.inventory_count_periods where id = p_count_period_id;

  if v_status is null then
    raise exception 'count period % not found', p_count_period_id;
  end if;

  if not (public.is_same_org_restaurant(v_restaurant_id) and public.can_operate_inventory()) then
    raise exception 'not authorized to close count period %', p_count_period_id;
  end if;

  if v_status = 'closed' then
    raise exception 'count period % is already closed', p_count_period_id;
  end if;

  select count(*) into v_unsubmitted_count
  from public.inventory_counts
  where count_period_id = p_count_period_id and status <> 'submitted';

  if v_unsubmitted_count > 0 then
    raise exception 'cannot close count period %: % count sheet(s) are not yet submitted', p_count_period_id, v_unsubmitted_count;
  end if;

  insert into public.inventory_stock_ledger (
    restaurant_id, inventory_item_id, transaction_type, quantity_delta,
    unit_cost_at_transaction, reference_table, reference_id, occurred_at, created_by
  )
  select
    cl.restaurant_id, cl.inventory_item_id, 'count_adjustment', cl.variance_base_unit,
    cl.unit_cost_at_count, 'inventory_count_lines', cl.id, now(), auth.uid()
  from public.inventory_count_lines cl
  join public.inventory_counts c on c.id = cl.inventory_count_id
  where c.count_period_id = p_count_period_id
    and cl.variance_base_unit <> 0;

  update public.inventory_count_periods
  set status = 'closed', closed_at = now(), closed_by = auth.uid()
  where id = p_count_period_id;

  return query
  select cl.inventory_item_id, cl.variance_base_unit, cl.variance_value
  from public.inventory_count_lines cl
  join public.inventory_counts c on c.id = cl.inventory_count_id
  where c.count_period_id = p_count_period_id;
end;
$$;

create or replace function receive_inventory_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text;
  v_organization_id uuid;
  v_from_restaurant uuid;
  v_to_restaurant uuid;
begin
  select status, organization_id, from_restaurant_id, to_restaurant_id
    into v_status, v_organization_id, v_from_restaurant, v_to_restaurant
  from public.inventory_transfers where id = p_transfer_id;

  if v_status is null then
    raise exception 'transfer % not found', p_transfer_id;
  end if;

  if not (v_organization_id = public.current_organization_id() and public.can_operate_inventory()) then
    raise exception 'not authorized to receive transfer %', p_transfer_id;
  end if;

  if v_status = 'received' then
    raise exception 'transfer % has already been received', p_transfer_id;
  end if;

  if v_status = 'cancelled' then
    raise exception 'transfer % was cancelled', p_transfer_id;
  end if;

  insert into public.inventory_stock_ledger (
    restaurant_id, inventory_item_id, transaction_type, quantity_delta,
    unit_cost_at_transaction, reference_table, reference_id, occurred_at, created_by
  )
  select v_from_restaurant, tl.inventory_item_id, 'transfer_out', -tl.quantity_base_unit,
         tl.unit_cost_at_transfer, 'inventory_transfer_lines', tl.id, now(), auth.uid()
  from public.inventory_transfer_lines tl
  where tl.transfer_id = p_transfer_id;

  insert into public.inventory_stock_ledger (
    restaurant_id, inventory_item_id, transaction_type, quantity_delta,
    unit_cost_at_transaction, reference_table, reference_id, occurred_at, created_by
  )
  select v_to_restaurant, tl.inventory_item_id, 'transfer_in', tl.quantity_base_unit,
         tl.unit_cost_at_transfer, 'inventory_transfer_lines', tl.id, now(), auth.uid()
  from public.inventory_transfer_lines tl
  where tl.transfer_id = p_transfer_id;

  update public.inventory_transfers
  set status = 'received', received_by = auth.uid(), received_at = now()
  where id = p_transfer_id;
end;
$$;
