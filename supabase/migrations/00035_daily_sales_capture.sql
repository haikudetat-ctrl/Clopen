-- Daily sales capture: the write path for daily_sales.
--
-- Until now nothing in the app wrote to daily_sales -- every row came from
-- a seed migration -- so the flash report, budget variance, P&L summary,
-- and portfolio rollup were all reading demo data. This adds the tables and
-- the single ingest function that a manager's end-of-night close (and,
-- later, a nightly Toast pull) both write through.
--
-- daily_sales itself is deliberately UNCHANGED. It stays the per-revenue-
-- category breakdown that gl_actual_revenue()/gl_pnl_summary() consume.
-- Covers, tips, tax, and tender splits are day-level facts -- forcing them
-- into daily_sales would duplicate every one of them across the four
-- revenue rows for that day -- so they get their own tables below.

-- One row per restaurant per business day. Everything here is a day-level
-- fact that has no meaningful per-revenue-category split.
create table daily_sales_summary (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  sales_date date not null,
  covers integer check (covers is null or covers >= 0),
  check_count integer check (check_count is null or check_count >= 0),
  tips_total numeric(12, 2) not null default 0 check (tips_total >= 0),
  service_charges numeric(12, 2) not null default 0 check (service_charges >= 0),
  tax_collected numeric(12, 2) not null default 0 check (tax_collected >= 0),
  voids numeric(12, 2) not null default 0 check (voids >= 0),
  refunds numeric(12, 2) not null default 0 check (refunds >= 0),
  -- What the POS itself reported for the day, kept alongside the derived
  -- sum of daily_sales so a mis-mapped column shows up as a reconciliation
  -- gap instead of quietly becoming the truth.
  reported_gross_sales numeric(12, 2),
  reported_net_sales numeric(12, 2),
  notes text,
  source text not null default 'manual_csv'
    check (source in ('manual_csv', 'manual_entry', 'toast_api')),
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, sales_date)
);

create index daily_sales_summary_restaurant_date_idx
  on daily_sales_summary(restaurant_id, sales_date);

-- Payment tender breakdown. Separate table rather than columns because the
-- set of tender types a house accepts varies, and because cash
-- specifically needs to be reconcilable against the deposit.
create table daily_sales_tenders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  sales_date date not null,
  tender_type text not null
    check (tender_type in ('cash', 'credit', 'gift_card', 'house_account', 'other')),
  amount numeric(12, 2) not null default 0,
  txn_count integer check (txn_count is null or txn_count >= 0),
  created_at timestamptz not null default now(),
  unique (restaurant_id, sales_date, tender_type)
);

create index daily_sales_tenders_restaurant_date_idx
  on daily_sales_tenders(restaurant_id, sales_date);

-- Saved column mappings, so a manager maps their export's columns once and
-- every later drop-and-go is a single confirm.
--
-- header_signature is a normalized fingerprint of the file's header row;
-- matching it on a later upload is what lets the importer skip the mapping
-- step entirely. mapping is shaped {mode, fields}: 'column' mode handles a
-- tabular export (one row per day, fields across columns), 'label' mode is
-- reserved for report-style exports like Toast's Sales Summary that are
-- label/value rows rather than a flat table. Only 'column' is implemented
-- today -- the shape is here so adding 'label' needs no migration.
create table sales_import_mappings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  header_signature text not null,
  mapping jsonb not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, header_signature)
);

-- Provenance and audit for every committed import. Superseded imports are
-- marked 'replaced' and kept rather than deleted, so "who changed Tuesday's
-- numbers and what were they before" is always answerable -- these figures
-- flow into the P&L.
create table sales_imports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  sales_date date not null,
  source text not null check (source in ('manual_csv', 'manual_entry', 'toast_api')),
  status text not null default 'committed' check (status in ('committed', 'replaced')),
  file_name text,
  payload jsonb not null,
  uploaded_by uuid references profiles(id),
  replaced_import_id uuid references sales_imports(id),
  created_at timestamptz not null default now()
);

create index sales_imports_restaurant_date_idx
  on sales_imports(restaurant_id, sales_date, status);

alter table daily_sales_summary enable row level security;
alter table daily_sales_tenders enable row level security;
alter table sales_import_mappings enable row level security;
alter table sales_imports enable row level security;

-- Same split as daily_sales after 00034: whoever can record sales can read
-- and write the day they recorded, and an owner_admin can see everything
-- via can_view_financials().
create policy daily_sales_summary_select on daily_sales_summary
  for select to authenticated
  using (is_same_org_restaurant(restaurant_id) and (can_view_financials() or can_record_sales()));

create policy daily_sales_summary_write on daily_sales_summary
  for all to authenticated
  using (is_same_org_restaurant(restaurant_id) and can_record_sales())
  with check (is_same_org_restaurant(restaurant_id) and can_record_sales());

create policy daily_sales_tenders_select on daily_sales_tenders
  for select to authenticated
  using (is_same_org_restaurant(restaurant_id) and (can_view_financials() or can_record_sales()));

create policy daily_sales_tenders_write on daily_sales_tenders
  for all to authenticated
  using (is_same_org_restaurant(restaurant_id) and can_record_sales())
  with check (is_same_org_restaurant(restaurant_id) and can_record_sales());

create policy sales_import_mappings_select on sales_import_mappings
  for select to authenticated
  using (is_same_org_restaurant(restaurant_id) and (can_view_financials() or can_record_sales()));

create policy sales_import_mappings_write on sales_import_mappings
  for all to authenticated
  using (is_same_org_restaurant(restaurant_id) and can_record_sales())
  with check (is_same_org_restaurant(restaurant_id) and can_record_sales());

create policy sales_imports_select on sales_imports
  for select to authenticated
  using (is_same_org_restaurant(restaurant_id) and (can_view_financials() or can_record_sales()));

create policy sales_imports_write on sales_imports
  for all to authenticated
  using (is_same_org_restaurant(restaurant_id) and can_record_sales())
  with check (is_same_org_restaurant(restaurant_id) and can_record_sales());

-- The one write path for a day's sales. Both the CSV importer and (later)
-- the nightly Toast pull normalize into the same payload and call this, so
-- the second producer is a new caller rather than a second pipeline --
-- mirroring how plcb_ingest_order() is the single entry point for PLCB.
--
-- Payload shape:
--   {
--     "sales_date": "2026-08-15",              -- required
--     "source": "manual_csv",
--     "revenue": [                              -- required, >= 1 entry
--       {"category": "food", "gross": 4210.50, "discounts": 80, "comps": 30},
--       {"category": "liquor", "gross": 1880.25}
--     ],
--     "discounts": 120.00,                      -- day total, allocated if
--     "comps": 45.00,                           --   not given per category
--     "covers": 187, "check_count": 92,
--     "tips_total": 1420.00, "service_charges": 210.00,
--     "tax_collected": 640.12, "voids": 0, "refunds": 0,
--     "reported_gross_sales": 7241.50, "reported_net_sales": 7076.50,
--     "notes": null, "file_name": "toast-2026-08-15.csv",
--     "tenders": [{"tender_type": "cash", "amount": 890.00, "txn_count": 12}]
--   }
--
-- Returns status 'exists' (with the current values, for the replace-diff
-- the UI shows) when the day is already recorded and p_replace is false.
create or replace function ingest_daily_sales(
  p_restaurant_id uuid,
  p_payload jsonb,
  p_replace boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_org_id uuid;
  v_sales_date date;
  v_source text;
  v_existing_count int;
  v_prior_import_id uuid;
  v_new_import_id uuid;
  v_rev jsonb;
  v_category text;
  v_code text;
  v_gl_id uuid;
  v_gross numeric;
  v_total_gross numeric := 0;
  v_day_discounts numeric;
  v_day_comps numeric;
  v_explicit_discounts numeric := 0;
  v_explicit_comps numeric := 0;
  v_alloc_discount numeric;
  v_alloc_comp numeric;
  v_sum_discount numeric := 0;
  v_sum_comp numeric := 0;
  v_largest_category text;
  v_largest_gross numeric := -1;
  v_rows_written int := 0;
  v_tender jsonb;
  v_tenders_written int := 0;
  v_sum_tenders numeric := 0;
  v_reported_gross numeric;
  v_warnings text[] := array[]::text[];
begin
  -- SECURITY DEFINER bypasses RLS entirely, so this has to check
  -- authorization itself -- same pattern as plcb_ingest_order() and every
  -- other GL/inventory RPC in this project.
  if not (public.is_same_org_restaurant(p_restaurant_id) and public.can_record_sales()) then
    raise exception 'not authorized to record sales for restaurant %', p_restaurant_id
      using errcode = '42501';
  end if;

  if nullif(trim(p_payload->>'sales_date'), '') is null then
    raise exception 'payload is missing sales_date -- refusing to guess which night this is';
  end if;
  v_sales_date := (p_payload->>'sales_date')::date;

  v_source := coalesce(nullif(trim(p_payload->>'source'), ''), 'manual_csv');
  if v_source not in ('manual_csv', 'manual_entry', 'toast_api') then
    raise exception 'unknown sales source %', v_source;
  end if;

  if jsonb_typeof(p_payload->'revenue') <> 'array'
     or jsonb_array_length(p_payload->'revenue') = 0 then
    raise exception 'payload must include a non-empty revenue array';
  end if;

  select r.organization_id into v_org_id from public.restaurants r where r.id = p_restaurant_id;

  select count(*) into v_existing_count
  from public.daily_sales ds
  where ds.restaurant_id = p_restaurant_id and ds.sales_date = v_sales_date;

  -- Already-recorded night and no explicit replace: hand back what's on
  -- file so the caller can show a before/after diff and ask.
  if v_existing_count > 0 and not p_replace then
    return jsonb_build_object(
      'status', 'exists',
      'sales_date', v_sales_date,
      'existing', jsonb_build_object(
        'revenue', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'code', ga.code,
            'name', ga.name,
            'gross', ds.gross_amount,
            'discounts', ds.discounts,
            'comps', ds.comps,
            'net', ds.net_amount
          ) order by ga.code), '[]'::jsonb)
          from public.daily_sales ds
          join public.gl_accounts ga on ga.id = ds.gl_account_id
          where ds.restaurant_id = p_restaurant_id and ds.sales_date = v_sales_date
        ),
        'summary', (
          select to_jsonb(s) - 'id' - 'restaurant_id'
          from public.daily_sales_summary s
          where s.restaurant_id = p_restaurant_id and s.sales_date = v_sales_date
        ),
        'tenders', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'tender_type', t.tender_type, 'amount', t.amount, 'txn_count', t.txn_count
          ) order by t.tender_type), '[]'::jsonb)
          from public.daily_sales_tenders t
          where t.restaurant_id = p_restaurant_id and t.sales_date = v_sales_date
        ),
        'recorded_at', (
          select max(si.created_at) from public.sales_imports si
          where si.restaurant_id = p_restaurant_id
            and si.sales_date = v_sales_date
            and si.status = 'committed'
        )
      )
    );
  end if;

  -- First pass: total the gross and note which categories carry their own
  -- discount/comp figures, so the day-level totals only get spread across
  -- the ones that don't.
  for v_rev in select * from jsonb_array_elements(p_payload->'revenue')
  loop
    v_gross := coalesce((v_rev->>'gross')::numeric, 0);
    v_total_gross := v_total_gross + v_gross;
    if v_rev ? 'discounts' then
      v_explicit_discounts := v_explicit_discounts + coalesce((v_rev->>'discounts')::numeric, 0);
    end if;
    if v_rev ? 'comps' then
      v_explicit_comps := v_explicit_comps + coalesce((v_rev->>'comps')::numeric, 0);
    end if;
    if v_gross > v_largest_gross then
      v_largest_gross := v_gross;
      v_largest_category := v_rev->>'category';
    end if;
  end loop;

  v_day_discounts := coalesce((p_payload->>'discounts')::numeric, v_explicit_discounts);
  v_day_comps := coalesce((p_payload->>'comps')::numeric, v_explicit_comps);

  if p_replace and v_existing_count > 0 then
    select si.id into v_prior_import_id
    from public.sales_imports si
    where si.restaurant_id = p_restaurant_id
      and si.sales_date = v_sales_date
      and si.status = 'committed'
    order by si.created_at desc
    limit 1;

    update public.sales_imports
    set status = 'replaced'
    where restaurant_id = p_restaurant_id
      and sales_date = v_sales_date
      and status = 'committed';

    delete from public.daily_sales
    where restaurant_id = p_restaurant_id and sales_date = v_sales_date;
    delete from public.daily_sales_tenders
    where restaurant_id = p_restaurant_id and sales_date = v_sales_date;
    delete from public.daily_sales_summary
    where restaurant_id = p_restaurant_id and sales_date = v_sales_date;
  end if;

  -- Second pass: write a daily_sales row per category, allocating any
  -- day-level discounts/comps pro-rata by gross. Allocation is rounded to
  -- the cent per category and the remainder is assigned to the largest
  -- category, so the categories always sum back to exactly the day total --
  -- otherwise the P&L drifts from the POS by pennies.
  for v_rev in select * from jsonb_array_elements(p_payload->'revenue')
  loop
    v_category := v_rev->>'category';
    v_code := case v_category
      when 'food' then '4010'
      when 'na_beverage' then '4020'
      when 'liquor' then '4030'
      when 'beer_wine' then '4040'
      when 'other' then '4090'
      else null
    end;
    if v_code is null then
      raise exception 'unknown revenue category % (expected food, na_beverage, liquor, beer_wine, or other)', v_category;
    end if;

    select ga.id into v_gl_id
    from public.gl_accounts ga
    where ga.organization_id = v_org_id and ga.code = v_code;
    if v_gl_id is null then
      raise exception 'no revenue account with code % in this organization''s chart of accounts', v_code;
    end if;

    v_gross := coalesce((v_rev->>'gross')::numeric, 0);

    if v_rev ? 'discounts' then
      v_alloc_discount := coalesce((v_rev->>'discounts')::numeric, 0);
    elsif v_total_gross > 0 and v_category is distinct from v_largest_category then
      v_alloc_discount := round(v_day_discounts * (v_gross / v_total_gross), 2);
    else
      v_alloc_discount := 0; -- largest category settled after the loop
    end if;

    if v_rev ? 'comps' then
      v_alloc_comp := coalesce((v_rev->>'comps')::numeric, 0);
    elsif v_total_gross > 0 and v_category is distinct from v_largest_category then
      v_alloc_comp := round(v_day_comps * (v_gross / v_total_gross), 2);
    else
      v_alloc_comp := 0;
    end if;

    insert into public.daily_sales (
      restaurant_id, sales_date, gl_account_id, gross_amount, discounts, comps
    ) values (
      p_restaurant_id, v_sales_date, v_gl_id, v_gross, v_alloc_discount, v_alloc_comp
    );

    v_sum_discount := v_sum_discount + v_alloc_discount;
    v_sum_comp := v_sum_comp + v_alloc_comp;
    v_rows_written := v_rows_written + 1;
  end loop;

  -- Settle the rounding remainder onto the largest category.
  if v_largest_category is not null then
    update public.daily_sales ds
    set discounts = ds.discounts + (v_day_discounts - v_sum_discount),
        comps = ds.comps + (v_day_comps - v_sum_comp)
    from public.gl_accounts ga
    where ga.id = ds.gl_account_id
      and ds.restaurant_id = p_restaurant_id
      and ds.sales_date = v_sales_date
      and ga.code = case v_largest_category
        when 'food' then '4010'
        when 'na_beverage' then '4020'
        when 'liquor' then '4030'
        when 'beer_wine' then '4040'
        when 'other' then '4090'
      end;
  end if;

  insert into public.daily_sales_summary (
    restaurant_id, sales_date, covers, check_count, tips_total, service_charges,
    tax_collected, voids, refunds, reported_gross_sales, reported_net_sales,
    notes, source, recorded_by
  ) values (
    p_restaurant_id,
    v_sales_date,
    (p_payload->>'covers')::integer,
    (p_payload->>'check_count')::integer,
    coalesce((p_payload->>'tips_total')::numeric, 0),
    coalesce((p_payload->>'service_charges')::numeric, 0),
    coalesce((p_payload->>'tax_collected')::numeric, 0),
    coalesce((p_payload->>'voids')::numeric, 0),
    coalesce((p_payload->>'refunds')::numeric, 0),
    (p_payload->>'reported_gross_sales')::numeric,
    (p_payload->>'reported_net_sales')::numeric,
    nullif(trim(p_payload->>'notes'), ''),
    v_source,
    auth.uid()
  );

  if jsonb_typeof(p_payload->'tenders') = 'array' then
    for v_tender in select * from jsonb_array_elements(p_payload->'tenders')
    loop
      insert into public.daily_sales_tenders (
        restaurant_id, sales_date, tender_type, amount, txn_count
      ) values (
        p_restaurant_id,
        v_sales_date,
        v_tender->>'tender_type',
        coalesce((v_tender->>'amount')::numeric, 0),
        (v_tender->>'txn_count')::integer
      );
      v_sum_tenders := v_sum_tenders + coalesce((v_tender->>'amount')::numeric, 0);
      v_tenders_written := v_tenders_written + 1;
    end loop;
  end if;

  insert into public.sales_imports (
    restaurant_id, sales_date, source, status, file_name, payload,
    uploaded_by, replaced_import_id
  ) values (
    p_restaurant_id, v_sales_date, v_source, 'committed',
    nullif(trim(p_payload->>'file_name'), ''), p_payload,
    auth.uid(), v_prior_import_id
  )
  returning id into v_new_import_id;

  -- Reconciliation: surface mismatches rather than silently accepting them.
  -- A mis-mapped column usually shows up here first.
  v_reported_gross := (p_payload->>'reported_gross_sales')::numeric;
  if v_reported_gross is not null and abs(v_reported_gross - v_total_gross) > 0.01 then
    v_warnings := v_warnings || format(
      'Category gross totals %s but the file reports %s for the day (off by %s).',
      to_char(v_total_gross, 'FM999999990.00'),
      to_char(v_reported_gross, 'FM999999990.00'),
      to_char(v_reported_gross - v_total_gross, 'FM999999990.00')
    );
  end if;

  if v_tenders_written > 0 then
    declare
      v_expected numeric := (v_total_gross - v_day_discounts - v_day_comps)
        + coalesce((p_payload->>'tax_collected')::numeric, 0)
        + coalesce((p_payload->>'tips_total')::numeric, 0)
        + coalesce((p_payload->>'service_charges')::numeric, 0);
    begin
      if abs(v_sum_tenders - v_expected) > 0.01 then
        v_warnings := v_warnings || format(
          'Tenders total %s but net sales plus tax, tips, and service charges come to %s.',
          to_char(v_sum_tenders, 'FM999999990.00'),
          to_char(v_expected, 'FM999999990.00')
        );
      end if;
    end;
  end if;

  return jsonb_build_object(
    'status', case when v_existing_count > 0 then 'replaced' else 'ingested' end,
    'sales_date', v_sales_date,
    'import_id', v_new_import_id,
    'replaced_import_id', v_prior_import_id,
    'revenue_rows', v_rows_written,
    'tender_rows', v_tenders_written,
    'total_gross', v_total_gross,
    'warnings', to_jsonb(v_warnings)
  );
end;
$$;
