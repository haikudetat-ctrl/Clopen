-- plcb_ingest_order: takes a restaurant_id and a parsed PlcbOrder (as jsonb,
-- same shape as lib/plcb/parse-invoice.ts's PlcbOrder type) and runs the
-- full receiving cycle: purchase_order -> purchase_order_lines ->
-- purchase_order_receipt -> purchase_order_receipt_lines (which triggers
-- post_receipt_to_ledger() and posts real stock-ledger movement), plus an
-- invoice + invoice_lines for AP tracking with freight/fees broken out to
-- their own GL line.
--
-- Generic by design: takes whichever restaurant_id the caller is authorized
-- for, auto-creates the "PLCB" vendor / inventory catalog entries the first
-- time each item is seen, and never assumes a specific organization. Any
-- Clopen client (any organization) can call this the same way once they
-- upload their own PLCB PDF -- see /inventory/purchasing/import-plcb.
create or replace function public.plcb_ingest_order(p_restaurant_id uuid, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_org_id uuid;
  v_vendor_id uuid;
  v_existing_po_id uuid;
  v_po_id uuid;
  v_receipt_id uuid;
  v_invoice_id uuid;
  v_freight_gl_id uuid;
  v_bottle_unit_id uuid;
  v_fl_oz_unit_id uuid;
  v_ea_unit_id uuid;
  v_order_number text;
  v_order_date date;
  v_received_at timestamptz;
  v_item jsonb;
  v_item_code text;
  v_item_name text;
  v_size_ml numeric;
  v_ordered_qty numeric;
  v_shipped_qty numeric;
  v_unit_price numeric;
  v_item_id uuid;
  v_vendor_item_id uuid;
  v_category_name text;
  v_category_id uuid;
  v_gl_code text;
  v_gl_name text;
  v_gl_account_id uuid;
  v_lines_inserted int := 0;
  v_freight numeric;
  v_additional_fee numeric;
begin
  -- Every SECURITY DEFINER function that touches a specific restaurant must
  -- check authorization itself -- it bypasses RLS entirely otherwise. This
  -- mirrors the pattern applied to every other inventory/GL RPC this
  -- project has (generate_fiscal_periods, gl_pnl_summary, etc.) after the
  -- earlier cross-tenant auth-gap sweep.
  if not (public.is_same_org_restaurant(p_restaurant_id) and public.can_operate_inventory()) then
    raise exception 'not authorized to operate inventory for restaurant %', p_restaurant_id
      using errcode = '42501';
  end if;

  select r.organization_id into v_org_id from public.restaurants r where r.id = p_restaurant_id;

  v_order_number := nullif(trim(p_order->>'orderNumber'), '');
  if v_order_number is null then
    raise exception 'PLCB order is missing an order number -- cannot ingest or de-duplicate it';
  end if;

  if nullif(trim(p_order->>'orderDate'), '') is null then
    raise exception 'PLCB order % is missing an order date -- refusing to guess a receiving date', v_order_number;
  end if;
  v_order_date := (p_order->>'orderDate')::date;
  -- Ledger-affecting rows must carry the real business-event date, not
  -- upload/processing time (the same lesson learned earlier this project
  -- with post_receipt_to_ledger() and inventory_close_count_period()).
  v_received_at := v_order_date::timestamptz;

  -- Dedup: PLCB's own export has confirmed duplicate order numbers across
  -- different downloaded filenames (same order re-exported). If this
  -- restaurant already has a plcb_import PO for this order number, don't
  -- create a second receiving/ledger event for it.
  select id into v_existing_po_id
  from public.purchase_orders
  where restaurant_id = p_restaurant_id
    and source = 'plcb_import'
    and external_reference = v_order_number;

  if v_existing_po_id is not null then
    return jsonb_build_object(
      'status', 'duplicate',
      'purchase_order_id', v_existing_po_id,
      'message', 'Order ' || v_order_number || ' was already imported for this restaurant.'
    );
  end if;

  -- Vendor: one "PLCB" vendor per organization, created on first use.
  select id into v_vendor_id from public.vendors where organization_id = v_org_id and name = 'PLCB';
  if v_vendor_id is null then
    insert into public.vendors (organization_id, name, is_active)
    values (v_org_id, 'PLCB', true)
    returning id into v_vendor_id;
  end if;

  select id into v_bottle_unit_id from public.units_of_measure where abbreviation = 'btl';
  select id into v_fl_oz_unit_id from public.units_of_measure where abbreviation = 'fl oz';
  select id into v_ea_unit_id from public.units_of_measure where abbreviation = 'ea';

  insert into public.purchase_orders (
    restaurant_id, vendor_id, status, source, order_date, external_reference, notes
  ) values (
    p_restaurant_id, v_vendor_id, 'received', 'plcb_import', v_order_date, v_order_number,
    'Imported from PLCB Licensee Online Order Portal'
      || case when nullif(trim(p_order->>'importerName'), '') is not null
              then ' (importer: ' || (p_order->>'importerName') || ')' else '' end
  )
  returning id into v_po_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_order->'lineItems', '[]'::jsonb))
  loop
    v_shipped_qty := coalesce((v_item->>'shippedQty')::numeric, 0);
    -- Backordered/cancelled items (shippedQty 0) were never actually
    -- fulfilled -- nothing to receive, nothing to bill. The parser already
    -- zeroes their itemTotal for the same reason.
    if v_shipped_qty <= 0 then
      continue;
    end if;

    v_item_code := nullif(trim(v_item->>'itemCode'), '');
    v_item_name := coalesce(nullif(trim(v_item->>'name'), ''), 'PLCB item ' || coalesce(v_item_code, '(unknown code)'));
    v_size_ml := coalesce((v_item->>'sizeMl')::numeric, 750);
    v_ordered_qty := greatest(coalesce((v_item->>'orderedQty')::numeric, 0), v_shipped_qty);
    v_unit_price := coalesce((v_item->>'unitPrice')::numeric, 0);

    v_item_id := null;
    v_vendor_item_id := null;
    if v_item_code is not null then
      select vi.id, vi.inventory_item_id into v_vendor_item_id, v_item_id
      from public.vendor_items vi
      where vi.vendor_id = v_vendor_id and vi.vendor_sku = v_item_code;
    end if;

    if v_item_id is null then
      -- Best-guess category from the product name -- PLCB's Licensee
      -- portal covers wine & spirits, so default to Liquor unless the name
      -- clearly reads as wine (there's no beer in this dataset, but the
      -- word-boundary check costs nothing to include for the rare case).
      v_category_name := case
        when v_item_name ~* 'wine|chardonnay|cabernet|sauvignon|merlot|pinot|riesling|ros[eé]|champagne|prosecco|moscato|malbec|zinfandel|syrah|shiraz|vermouth'
          then 'Beer & Wine'
        when v_item_name ~* '\mbeer\M|\male\M|\mlager\M|\mstout\M|\mcider\M|\mipa\M'
          then 'Beer & Wine'
        else 'Liquor'
      end;

      select id into v_category_id
      from public.inventory_categories
      where organization_id = v_org_id and name = v_category_name;

      if v_category_id is null then
        v_gl_code := case v_category_name when 'Beer & Wine' then '5040' else '5030' end;
        v_gl_name := case v_category_name when 'Beer & Wine' then 'Beer & wine cost' else 'Liquor cost' end;

        select id into v_gl_account_id
        from public.gl_accounts
        where organization_id = v_org_id and code = v_gl_code;

        if v_gl_account_id is null then
          insert into public.gl_accounts (organization_id, code, name, account_type, sort_order)
          values (v_org_id, v_gl_code, v_gl_name, 'cogs', (v_gl_code::int))
          returning id into v_gl_account_id;
        end if;

        insert into public.inventory_categories (organization_id, name, gl_account_id, sort_order)
        values (v_org_id, v_category_name, v_gl_account_id, case v_category_name when 'Liquor' then 4 else 5 end)
        returning id into v_category_id;
      end if;

      -- Base unit is fluid ounce for liquor/wine, matching the convention
      -- already used by every hand-seeded Liquor/Beer & Wine item (pour
      -- costing needs a sub-bottle unit). current_unit_cost here is a
      -- starting estimate in base-unit terms; the receipt-to-ledger trigger
      -- chain is what actually maintains it going forward.
      insert into public.inventory_items (organization_id, category_id, name, base_unit_id, current_unit_cost, is_active)
      values (v_org_id, v_category_id, v_item_name, v_fl_oz_unit_id, round(v_unit_price / (v_size_ml * 0.033814), 4), true)
      returning id into v_item_id;

      insert into public.inventory_item_units (inventory_item_id, unit_id, conversion_factor, is_purchase_unit, is_count_unit)
      values (v_item_id, v_bottle_unit_id, round(v_size_ml * 0.033814, 6), true, true);

      insert into public.vendor_items (vendor_id, inventory_item_id, vendor_sku, purchase_unit_id, current_unit_cost, is_preferred)
      values (v_vendor_id, v_item_id, v_item_code, v_bottle_unit_id, v_unit_price, true)
      returning id into v_vendor_item_id;
    else
      update public.vendor_items
      set current_unit_cost = v_unit_price, last_purchased_at = v_received_at
      where id = v_vendor_item_id;
    end if;

    insert into public.purchase_order_lines (purchase_order_id, inventory_item_id, vendor_item_id, quantity_ordered, unit_id, unit_cost)
    values (v_po_id, v_item_id, v_vendor_item_id, v_ordered_qty, v_bottle_unit_id, v_unit_price);

    v_lines_inserted := v_lines_inserted + 1;
  end loop;

  if v_lines_inserted = 0 then
    raise exception 'PLCB order % has no shippable line items to receive', v_order_number;
  end if;

  -- Full receiving cycle: the receipt is what triggers post_receipt_to_ledger()
  -- and actually moves inventory_stock_ledger, dated to the order's real
  -- date rather than whenever this import happens to run.
  insert into public.purchase_order_receipts (purchase_order_id, received_at, notes)
  values (v_po_id, v_received_at, 'Received via PLCB import, order ' || v_order_number)
  returning id into v_receipt_id;

  insert into public.purchase_order_receipt_lines (receipt_id, purchase_order_line_id, quantity_received, unit_id, unit_cost)
  select v_receipt_id, pol.id, pol.quantity_ordered, pol.unit_id, pol.unit_cost
  from public.purchase_order_lines pol
  where pol.purchase_order_id = v_po_id;

  -- Invoice for AP tracking. Freight and any additional order-level fee
  -- (Supplier-Imposed Shipping Fee / PLCB Handling Fee) post to their own
  -- GL line rather than getting blended into per-bottle landed cost.
  select id into v_freight_gl_id from public.gl_accounts where organization_id = v_org_id and code = '7070';
  if v_freight_gl_id is null
     and (coalesce((p_order->>'freight')::numeric, 0) > 0 or coalesce((p_order->>'additionalOrderFee')::numeric, 0) > 0)
  then
    -- A brand-new organization that hasn't run seed_standard_coa() yet has
    -- no chart of accounts at all -- without this, freight/fees would
    -- silently vanish instead of posting anywhere, which is exactly the
    -- "new client property" scenario this pipeline exists for.
    insert into public.gl_accounts (organization_id, code, name, account_type, sort_order)
    values (v_org_id, '7070', 'Delivery & freight', 'controllable', 7070)
    returning id into v_freight_gl_id;
  end if;

  insert into public.invoices (restaurant_id, vendor_id, purchase_order_id, invoice_number, invoice_date, subtotal, tax_amount, total_amount, status)
  values (
    p_restaurant_id, v_vendor_id, v_po_id, v_order_number, v_order_date,
    coalesce((p_order->>'taxableAmount')::numeric, (p_order->>'grossPrice')::numeric, 0),
    coalesce((p_order->>'tax')::numeric, 0),
    coalesce((p_order->>'orderTotal')::numeric, 0),
    'pending'
  )
  returning id into v_invoice_id;

  insert into public.invoice_lines (invoice_id, inventory_item_id, purchase_order_line_id, quantity, unit_id, unit_cost)
  select v_invoice_id, pol.inventory_item_id, pol.id, pol.quantity_ordered, pol.unit_id, pol.unit_cost
  from public.purchase_order_lines pol
  where pol.purchase_order_id = v_po_id;

  v_freight := coalesce((p_order->>'freight')::numeric, 0);
  if v_freight > 0 and v_freight_gl_id is not null then
    insert into public.invoice_lines (invoice_id, gl_account_id, description, quantity, unit_id, unit_cost)
    values (v_invoice_id, v_freight_gl_id, 'PLCB Special Order freight, order ' || v_order_number, 1, v_ea_unit_id, v_freight);
  end if;

  v_additional_fee := coalesce((p_order->>'additionalOrderFee')::numeric, 0);
  if v_additional_fee > 0 and v_freight_gl_id is not null then
    insert into public.invoice_lines (invoice_id, gl_account_id, description, quantity, unit_id, unit_cost)
    values (v_invoice_id, v_freight_gl_id, 'PLCB supplier/handling fee, order ' || v_order_number, 1, v_ea_unit_id, v_additional_fee);
  end if;

  return jsonb_build_object(
    'status', 'ingested',
    'purchase_order_id', v_po_id,
    'receipt_id', v_receipt_id,
    'invoice_id', v_invoice_id,
    'line_items_received', v_lines_inserted
  );
end;
$$;
