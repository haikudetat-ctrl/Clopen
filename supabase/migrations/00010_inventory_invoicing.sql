-- Inventory foundation, part 3: vendor invoices (AP). An invoice is a
-- billing document -- it can be matched against a PO/receipt for 3-way
-- matching, but it does NOT itself move stock (receiving already did that).
-- Quantity/cost mismatches between receipt and invoice are exactly what
-- the reporting layer will want to flag later; this schema just needs to
-- keep both linked so that's possible.

create table invoices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  vendor_id uuid not null references vendors(id),
  purchase_order_id uuid references purchase_orders(id),
  invoice_number text,
  invoice_date date not null default current_date,
  due_date date,
  subtotal numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'disputed')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_restaurant_id_idx on invoices(restaurant_id);
create index invoices_vendor_id_idx on invoices(vendor_id);
create index invoices_purchase_order_id_idx on invoices(purchase_order_id);

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id),
  inventory_item_id uuid not null references inventory_items(id),
  -- Links back to what was actually received, enabling 3-way match
  -- (PO quantity/cost vs receipt quantity/cost vs invoice quantity/cost).
  purchase_order_line_id uuid references purchase_order_lines(id),
  purchase_order_receipt_line_id uuid references purchase_order_receipt_lines(id),
  description text,
  quantity numeric(14, 4) not null,
  unit_id uuid not null references units_of_measure(id),
  unit_cost numeric(12, 4) not null,
  quantity_base_unit numeric(14, 4),
  line_total numeric(12, 2),
  created_at timestamptz not null default now()
);

create index invoice_lines_invoice_id_idx on invoice_lines(invoice_id);
create index invoice_lines_restaurant_id_idx on invoice_lines(restaurant_id);
create index invoice_lines_item_id_idx on invoice_lines(inventory_item_id);

create or replace function invoice_line_before_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  select restaurant_id into new.restaurant_id
  from public.invoices where id = new.invoice_id;

  new.quantity_base_unit := public.to_base_unit_quantity(new.inventory_item_id, new.quantity, new.unit_id);
  new.line_total := new.quantity * new.unit_cost;

  return new;
end;
$$;

create trigger invoice_line_before_insert_trigger
  before insert on invoice_lines
  for each row execute function invoice_line_before_insert();

create trigger validate_invoice_line_same_org
  before insert on invoice_lines
  for each row execute function validate_item_restaurant_same_org();
