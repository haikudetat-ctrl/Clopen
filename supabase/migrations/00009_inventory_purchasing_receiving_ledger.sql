-- Inventory foundation, part 2: purchase orders, receiving, and the stock
-- ledger. Receiving goods is what actually moves stock, so receipt lines
-- and the ledger are built together in this migration.
--
-- The stock ledger is append-only and is the single source of truth for
-- on-hand quantity -- there is no mutable "current_quantity" column on
-- inventory_items to drift out of sync. On-hand is always
-- sum(quantity_delta) from the ledger, exposed via inventory_current_stock.

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  vendor_id uuid not null references vendors(id),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'partially_received', 'received', 'closed', 'cancelled')),
  source text not null default 'manual' check (source in ('manual', 'par_level_suggestion')),
  order_date date not null default current_date,
  expected_delivery_date date,
  created_by uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchase_orders_restaurant_id_idx on purchase_orders(restaurant_id);
create index purchase_orders_vendor_id_idx on purchase_orders(vendor_id);

create table purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  -- Denormalized from purchase_orders.restaurant_id by trigger below, so
  -- RLS and reporting can filter this fact table directly without a join.
  restaurant_id uuid not null references restaurants(id),
  inventory_item_id uuid not null references inventory_items(id),
  vendor_item_id uuid references vendor_items(id),
  quantity_ordered numeric(14, 4) not null check (quantity_ordered > 0),
  unit_id uuid not null references units_of_measure(id),
  unit_cost numeric(12, 4) not null,
  -- Snapshotted at insert time via to_base_unit_quantity(); intentionally
  -- NOT a generated column, because unit conversions can change over time
  -- and historical lines must not silently be recalculated.
  quantity_base_unit numeric(14, 4),
  line_total numeric(12, 2),
  created_at timestamptz not null default now()
);

create index purchase_order_lines_po_id_idx on purchase_order_lines(purchase_order_id);
create index purchase_order_lines_restaurant_id_idx on purchase_order_lines(restaurant_id);
create index purchase_order_lines_item_id_idx on purchase_order_lines(inventory_item_id);

create or replace function po_line_before_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  select restaurant_id into new.restaurant_id
  from public.purchase_orders where id = new.purchase_order_id;

  new.quantity_base_unit := public.to_base_unit_quantity(new.inventory_item_id, new.quantity_ordered, new.unit_id);
  new.line_total := new.quantity_ordered * new.unit_cost;

  return new;
end;
$$;

create trigger po_line_before_insert_trigger
  before insert on purchase_order_lines
  for each row execute function po_line_before_insert();

create trigger validate_po_line_same_org
  before insert on purchase_order_lines
  for each row execute function validate_item_restaurant_same_org();

-- A receiving event. A PO can be received across multiple deliveries
-- (partial shipments), so this is 1:many with purchase_orders.
create table purchase_order_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id),
  received_by uuid references profiles(id),
  received_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index purchase_order_receipts_po_id_idx on purchase_order_receipts(purchase_order_id);
create index purchase_order_receipts_restaurant_id_idx on purchase_order_receipts(restaurant_id);

create or replace function po_receipt_before_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  select restaurant_id into new.restaurant_id
  from public.purchase_orders where id = new.purchase_order_id;
  return new;
end;
$$;

create trigger po_receipt_before_insert_trigger
  before insert on purchase_order_receipts
  for each row execute function po_receipt_before_insert();

create table purchase_order_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references purchase_order_receipts(id) on delete cascade,
  purchase_order_line_id uuid not null references purchase_order_lines(id),
  restaurant_id uuid not null references restaurants(id),
  inventory_item_id uuid not null references inventory_items(id),
  quantity_received numeric(14, 4) not null check (quantity_received >= 0),
  unit_id uuid not null references units_of_measure(id),
  -- Actual cost at receipt -- may differ from the PO line's unit_cost.
  unit_cost numeric(12, 4) not null,
  quantity_base_unit numeric(14, 4),
  line_total numeric(12, 2),
  lot_number text,
  expiration_date date,
  condition_notes text,
  created_at timestamptz not null default now()
);

create index purchase_order_receipt_lines_receipt_id_idx on purchase_order_receipt_lines(receipt_id);
create index purchase_order_receipt_lines_restaurant_id_idx on purchase_order_receipt_lines(restaurant_id);
create index purchase_order_receipt_lines_item_id_idx on purchase_order_receipt_lines(inventory_item_id);

-- Append-only stock ledger. Every quantity change to on-hand inventory --
-- receiving, count adjustments, waste, transfers -- is a row here.
-- quantity_delta and unit_cost_at_transaction are always in the item's
-- base_unit, so valuation (quantity_delta * unit_cost_at_transaction) is
-- always comparable across transaction types and time.
create table inventory_stock_ledger (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  inventory_item_id uuid not null references inventory_items(id),
  transaction_type text not null check (transaction_type in (
    'receipt', 'count_adjustment', 'waste', 'transfer_in', 'transfer_out', 'opening_balance'
  )),
  quantity_delta numeric(14, 4) not null,
  unit_cost_at_transaction numeric(12, 4) not null,
  reference_table text,
  reference_id uuid,
  occurred_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index inventory_stock_ledger_restaurant_item_idx on inventory_stock_ledger(restaurant_id, inventory_item_id);
create index inventory_stock_ledger_reference_idx on inventory_stock_ledger(reference_table, reference_id);
create index inventory_stock_ledger_occurred_at_idx on inventory_stock_ledger(occurred_at);

create trigger validate_ledger_same_org
  before insert on inventory_stock_ledger
  for each row execute function validate_item_restaurant_same_org();

-- Last-cost costing: whenever a 'receipt' ledger row lands, update the
-- item's current_unit_cost. Centralized here (rather than on the receipt
-- line trigger) so any future ledger-writing path that posts a 'receipt'
-- keeps costs correct automatically.
create or replace function update_item_cost_from_ledger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.transaction_type = 'receipt' and new.quantity_delta > 0 then
    update public.inventory_items
    set current_unit_cost = new.unit_cost_at_transaction,
        updated_at = now()
    where id = new.inventory_item_id
      and costing_method = 'last_cost';
  end if;
  return new;
end;
$$;

create trigger update_item_cost_from_ledger_trigger
  after insert on inventory_stock_ledger
  for each row execute function update_item_cost_from_ledger();

create or replace function po_receipt_line_before_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  select restaurant_id into new.restaurant_id
  from public.purchase_order_receipts where id = new.receipt_id;

  select inventory_item_id into new.inventory_item_id
  from public.purchase_order_lines where id = new.purchase_order_line_id;

  new.quantity_base_unit := public.to_base_unit_quantity(new.inventory_item_id, new.quantity_received, new.unit_id);
  new.line_total := new.quantity_received * new.unit_cost;

  return new;
end;
$$;

create trigger po_receipt_line_before_insert_trigger
  before insert on purchase_order_receipt_lines
  for each row execute function po_receipt_line_before_insert();

-- After a receipt line is recorded, post the corresponding stock ledger
-- entry. Cost-per-base-unit is derived from the line total so it's
-- correct even when the purchase unit isn't the base unit (e.g. receiving
-- a $216 case of 12 bottles where the base unit is fl_oz).
create or replace function post_receipt_to_ledger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cost_per_base_unit numeric;
begin
  if new.quantity_base_unit is null or new.quantity_base_unit = 0 then
    v_cost_per_base_unit := 0;
  else
    v_cost_per_base_unit := new.line_total / new.quantity_base_unit;
  end if;

  insert into public.inventory_stock_ledger (
    restaurant_id, inventory_item_id, transaction_type, quantity_delta,
    unit_cost_at_transaction, reference_table, reference_id, occurred_at, created_by
  ) values (
    new.restaurant_id, new.inventory_item_id, 'receipt', new.quantity_base_unit,
    v_cost_per_base_unit, 'purchase_order_receipt_lines', new.id, new.created_at, auth.uid()
  );

  return new;
end;
$$;

create trigger post_receipt_to_ledger_trigger
  after insert on purchase_order_receipt_lines
  for each row execute function post_receipt_to_ledger();

-- Current on-hand quantity and value per restaurant/item, derived entirely
-- from the ledger. This is the table the reporting dashboard, reorder
-- suggestions, and count-variance calculations all read from.
create view inventory_current_stock as
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
