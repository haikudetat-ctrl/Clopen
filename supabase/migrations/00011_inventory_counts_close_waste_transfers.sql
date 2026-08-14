-- Inventory foundation, part 4: periodic counts with period close, waste,
-- transfers between locations, and the reorder-suggestion function that
-- closes the loop back to "order generation."

-- A count period is one inventory cycle (e.g. a week or a month) for a
-- restaurant. Closing it is what turns counted quantities into permanent
-- stock-ledger adjustments -- this is "closing the inventory cycle."
create table inventory_count_periods (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index inventory_count_periods_restaurant_id_idx on inventory_count_periods(restaurant_id);

-- A count sheet within a period (e.g. "walk-in cooler, counted by Alex").
-- A period can have several of these before it's closed.
create table inventory_counts (
  id uuid primary key default gen_random_uuid(),
  count_period_id uuid not null references inventory_count_periods(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id),
  counted_by uuid references profiles(id),
  area_label text,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create index inventory_counts_period_id_idx on inventory_counts(count_period_id);
create index inventory_counts_restaurant_id_idx on inventory_counts(restaurant_id);

create or replace function count_before_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  select restaurant_id into new.restaurant_id
  from public.inventory_count_periods where id = new.count_period_id;
  return new;
end;
$$;

create trigger count_before_insert_trigger
  before insert on inventory_counts
  for each row execute function count_before_insert();

-- One counted item on a count sheet. expected_quantity_base_unit and
-- unit_cost_at_count are snapshotted at count time -- not recalculated
-- later -- so a count taken Monday reflects Monday's on-hand, even if more
-- receipts/waste land before the period is actually closed.
create table inventory_count_lines (
  id uuid primary key default gen_random_uuid(),
  inventory_count_id uuid not null references inventory_counts(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id),
  inventory_item_id uuid not null references inventory_items(id),
  counted_quantity numeric(14, 4) not null check (counted_quantity >= 0),
  unit_id uuid not null references units_of_measure(id),
  counted_quantity_base_unit numeric(14, 4),
  expected_quantity_base_unit numeric(14, 4) not null default 0,
  unit_cost_at_count numeric(12, 4) not null default 0,
  variance_base_unit numeric(14, 4) generated always as (counted_quantity_base_unit - expected_quantity_base_unit) stored,
  variance_value numeric(12, 2) generated always as ((counted_quantity_base_unit - expected_quantity_base_unit) * unit_cost_at_count) stored,
  notes text,
  created_at timestamptz not null default now(),
  unique (inventory_count_id, inventory_item_id)
);

create index inventory_count_lines_count_id_idx on inventory_count_lines(inventory_count_id);
create index inventory_count_lines_restaurant_id_idx on inventory_count_lines(restaurant_id);
create index inventory_count_lines_item_id_idx on inventory_count_lines(inventory_item_id);

create or replace function count_line_before_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_current_on_hand numeric;
  v_current_cost numeric;
begin
  select restaurant_id into new.restaurant_id
  from public.inventory_counts where id = new.inventory_count_id;

  new.counted_quantity_base_unit := public.to_base_unit_quantity(new.inventory_item_id, new.counted_quantity, new.unit_id);

  select quantity_on_hand_base_unit into v_current_on_hand
  from public.inventory_current_stock
  where restaurant_id = new.restaurant_id and inventory_item_id = new.inventory_item_id;

  select current_unit_cost into v_current_cost
  from public.inventory_items where id = new.inventory_item_id;

  new.expected_quantity_base_unit := coalesce(v_current_on_hand, 0);
  new.unit_cost_at_count := coalesce(v_current_cost, 0);

  return new;
end;
$$;

create trigger count_line_before_insert_trigger
  before insert on inventory_count_lines
  for each row execute function count_line_before_insert();

create trigger validate_count_line_same_org
  before insert on inventory_count_lines
  for each row execute function validate_item_restaurant_same_org();

-- Closes a count period: every submitted count sheet's variances become
-- permanent stock-ledger adjustments, and the period is locked. Requires
-- every count sheet in the period to already be submitted, so a period
-- can't be closed with a half-finished count silently ignored.
create or replace function inventory_close_count_period(p_count_period_id uuid)
returns table (
  inventory_item_id uuid,
  variance_base_unit numeric,
  variance_value numeric
)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text;
  v_unsubmitted_count integer;
begin
  select status into v_status from public.inventory_count_periods where id = p_count_period_id;

  if v_status is null then
    raise exception 'count period % not found', p_count_period_id;
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

create table waste_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id),
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_id uuid not null references units_of_measure(id),
  quantity_base_unit numeric(14, 4),
  unit_cost_at_waste numeric(12, 4),
  reason text not null check (reason in ('spoilage', 'breakage', 'prep_waste', 'comp', 'theft_suspected', 'expired', 'other')),
  logged_by uuid references profiles(id),
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index waste_logs_restaurant_id_idx on waste_logs(restaurant_id);
create index waste_logs_item_id_idx on waste_logs(inventory_item_id);

create or replace function waste_log_before_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_current_cost numeric;
begin
  new.quantity_base_unit := public.to_base_unit_quantity(new.inventory_item_id, new.quantity, new.unit_id);

  select current_unit_cost into v_current_cost
  from public.inventory_items where id = new.inventory_item_id;

  new.unit_cost_at_waste := coalesce(v_current_cost, 0);

  return new;
end;
$$;

create trigger waste_log_before_insert_trigger
  before insert on waste_logs
  for each row execute function waste_log_before_insert();

create trigger validate_waste_log_same_org
  before insert on waste_logs
  for each row execute function validate_item_restaurant_same_org();

create or replace function post_waste_to_ledger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.inventory_stock_ledger (
    restaurant_id, inventory_item_id, transaction_type, quantity_delta,
    unit_cost_at_transaction, reference_table, reference_id, occurred_at, created_by
  ) values (
    new.restaurant_id, new.inventory_item_id, 'waste', -new.quantity_base_unit,
    new.unit_cost_at_waste, 'waste_logs', new.id, new.occurred_at, auth.uid()
  );
  return new;
end;
$$;

create trigger post_waste_to_ledger_trigger
  after insert on waste_logs
  for each row execute function post_waste_to_ledger();

-- Transfers span two restaurants within one organization, so they're keyed
-- to organization_id directly rather than a single restaurant_id.
create table inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  from_restaurant_id uuid not null references restaurants(id),
  to_restaurant_id uuid not null references restaurants(id),
  status text not null default 'pending' check (status in ('pending', 'in_transit', 'received', 'cancelled')),
  initiated_by uuid references profiles(id),
  initiated_at timestamptz not null default now(),
  received_by uuid references profiles(id),
  received_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  check (from_restaurant_id <> to_restaurant_id)
);

create index inventory_transfers_organization_id_idx on inventory_transfers(organization_id);
create index inventory_transfers_from_restaurant_idx on inventory_transfers(from_restaurant_id);
create index inventory_transfers_to_restaurant_idx on inventory_transfers(to_restaurant_id);

create or replace function validate_transfer_same_org()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_from_org uuid;
  v_to_org uuid;
begin
  select organization_id into v_from_org from public.restaurants where id = new.from_restaurant_id;
  select organization_id into v_to_org from public.restaurants where id = new.to_restaurant_id;

  if v_from_org is null or v_to_org is null or v_from_org <> new.organization_id or v_to_org <> new.organization_id then
    raise exception 'from_restaurant and to_restaurant must both belong to organization %', new.organization_id;
  end if;

  return new;
end;
$$;

create trigger validate_transfer_same_org_trigger
  before insert on inventory_transfers
  for each row execute function validate_transfer_same_org();

create table inventory_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references inventory_transfers(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id),
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_id uuid not null references units_of_measure(id),
  quantity_base_unit numeric(14, 4),
  unit_cost_at_transfer numeric(12, 4),
  created_at timestamptz not null default now()
);

create index inventory_transfer_lines_transfer_id_idx on inventory_transfer_lines(transfer_id);
create index inventory_transfer_lines_item_id_idx on inventory_transfer_lines(inventory_item_id);

create or replace function transfer_line_before_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_current_cost numeric;
  v_item_org uuid;
  v_transfer_org uuid;
begin
  select organization_id into v_item_org from public.inventory_items where id = new.inventory_item_id;
  select organization_id into v_transfer_org from public.inventory_transfers where id = new.transfer_id;

  if v_item_org is null or v_transfer_org is null or v_item_org <> v_transfer_org then
    raise exception 'inventory_item % does not belong to the same organization as transfer %', new.inventory_item_id, new.transfer_id;
  end if;

  new.quantity_base_unit := public.to_base_unit_quantity(new.inventory_item_id, new.quantity, new.unit_id);

  select current_unit_cost into v_current_cost from public.inventory_items where id = new.inventory_item_id;
  new.unit_cost_at_transfer := coalesce(v_current_cost, 0);

  return new;
end;
$$;

create trigger transfer_line_before_insert_trigger
  before insert on inventory_transfer_lines
  for each row execute function transfer_line_before_insert();

-- Posts both sides of a transfer (transfer_out at the source, transfer_in
-- at the destination) to the ledger, and marks the transfer received.
-- Stock only moves on confirmed receipt, not on initiation, so goods
-- "in transit" aren't double-counted or missing from either location.
create or replace function receive_inventory_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text;
  v_from_restaurant uuid;
  v_to_restaurant uuid;
begin
  select status, from_restaurant_id, to_restaurant_id
    into v_status, v_from_restaurant, v_to_restaurant
  from public.inventory_transfers where id = p_transfer_id;

  if v_status is null then
    raise exception 'transfer % not found', p_transfer_id;
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

-- Closes the loop back to "order generation": which items at a location
-- are at or below their reorder point, how much to order, and from whom.
create or replace function inventory_reorder_suggestions(p_restaurant_id uuid)
returns table (
  inventory_item_id uuid,
  item_name text,
  current_quantity_base_unit numeric,
  par_level_quantity numeric,
  reorder_point numeric,
  suggested_order_quantity numeric,
  preferred_vendor_item_id uuid,
  preferred_vendor_id uuid,
  purchase_unit_id uuid,
  vendor_unit_cost numeric
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    pl.inventory_item_id,
    i.name,
    coalesce(s.quantity_on_hand_base_unit, 0) as current_quantity_base_unit,
    pl.par_level_quantity,
    pl.reorder_point,
    greatest(pl.par_level_quantity - coalesce(s.quantity_on_hand_base_unit, 0), 0) as suggested_order_quantity,
    vi.id as preferred_vendor_item_id,
    vi.vendor_id as preferred_vendor_id,
    vi.purchase_unit_id,
    vi.current_unit_cost as vendor_unit_cost
  from public.inventory_par_levels pl
  join public.inventory_items i on i.id = pl.inventory_item_id
  left join public.inventory_current_stock s
    on s.restaurant_id = pl.restaurant_id and s.inventory_item_id = pl.inventory_item_id
  left join public.vendor_items vi on vi.id = pl.preferred_vendor_item_id
  where pl.restaurant_id = p_restaurant_id
    and coalesce(s.quantity_on_hand_base_unit, 0) <= pl.reorder_point
  order by i.name;
$$;
