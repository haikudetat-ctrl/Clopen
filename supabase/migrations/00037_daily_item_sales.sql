-- Item-level sales capture, from Toast's Product Mix (PMIX) export.
--
-- Why PMIX rather than the Sales Category report: PMIX is per-item AND
-- carries sales category as a column, so one export both rolls up to the
-- four GL revenue accounts for the P&L and keeps the item rows underneath.
-- The Sales Category report only ever gives the rollup, so PMIX is a strict
-- superset for our purposes.
--
-- What this unlocks: inventory_menu_engineering() (00030) already computes
-- theoretical cost and cost % per menu item and cocktail, but has no idea
-- what actually sold -- it's been running on seeded data. Item rows with a
-- resolved menu_item_id/cocktail_id are the missing half: real sell-through
-- against real theoretical cost, and the basis for theoretical-vs-actual
-- usage against recipe_ingredients.
--
-- PMIX alone has no covers, tips, or tender breakdown -- those come from
-- the Sales Summary export, which is a card/label layout rather than a
-- table. Hence the two-file nightly drop and the file_kind column below.

create table daily_item_sales (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  sales_date date not null,
  item_name text not null,
  -- '' rather than null so the unique key below stays simple; PMIX rows
  -- without a group are common enough that a partial index isn't worth it.
  menu_group text not null default '',
  -- Canonical category (food / liquor / beer_wine / na_beverage / other),
  -- mapped by the importer from whatever the house calls it in Toast.
  category text not null
    check (category in ('food', 'liquor', 'beer_wine', 'na_beverage', 'other')),
  -- The raw Toast sales-category string, kept for traceability so a
  -- mis-mapped category is diagnosable after the fact.
  sales_category_raw text,
  quantity numeric(12, 3) not null default 0,
  gross_amount numeric(12, 2) not null default 0,
  discounts numeric(12, 2) not null default 0,
  voids numeric(12, 2) not null default 0,
  refunds numeric(12, 2) not null default 0,
  net_amount numeric(12, 2) not null default 0,
  -- Resolved by case-insensitive name match at ingest, null when the POS
  -- name has drifted from the menu. Deliberately nullable and non-blocking:
  -- an unmatched item is a data-quality signal, not a reason to reject the
  -- night's numbers. The ingest returns a count of unmatched items.
  menu_item_id uuid references menu_items(id) on delete set null,
  cocktail_id uuid references cocktails(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, sales_date, item_name, menu_group, category)
);

create index daily_item_sales_restaurant_date_idx
  on daily_item_sales(restaurant_id, sales_date);
create index daily_item_sales_menu_item_idx
  on daily_item_sales(menu_item_id) where menu_item_id is not null;
create index daily_item_sales_cocktail_idx
  on daily_item_sales(cocktail_id) where cocktail_id is not null;

alter table daily_item_sales enable row level security;

create policy daily_item_sales_select on daily_item_sales
  for select to authenticated
  using (
    (can_view_financials() and is_same_org_restaurant(restaurant_id))
    or can_record_sales_for(restaurant_id)
  );

create policy daily_item_sales_write on daily_item_sales
  for all to authenticated
  using (can_record_sales_for(restaurant_id))
  with check (can_record_sales_for(restaurant_id));

-- A restaurant now saves one mapping per export kind, since the nightly
-- drop is two different files with two different shapes.
alter table sales_import_mappings
  add column file_kind text not null default 'pmix'
  check (file_kind in ('pmix', 'sales_summary', 'other'));

-- One import can now be assembled from more than one file.
alter table sales_imports add column source_files text[];

-- Extends ingest_daily_sales with an optional `items` array. Everything
-- else about the contract is unchanged: same exists/replace semantics, same
-- pro-rata discount allocation, same reconciliation warnings.
--
-- Added to the payload:
--   "items": [
--     {"item_name":"Bucatini","menu_group":"Pasta","category":"food",
--      "sales_category_raw":"Food","quantity":34,"gross":782.00,
--      "discounts":12.00,"voids":0,"refunds":0,"net":770.00}
--   ],
--   "source_files": ["pmix-2026-08-15.csv","sales-summary-2026-08-15.csv"]
--
-- The importer is expected to have already summed duplicate rows (the same
-- item can appear more than once in PMIX across modifiers/subgroups) before
-- calling -- the unique key here will reject un-aggregated input rather
-- than silently keeping only one of them.
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
  v_item jsonb;
  v_items_written int := 0;
  v_unmatched_items int := 0;
  v_item_name text;
  v_menu_item_id uuid;
  v_cocktail_id uuid;
  v_mismatch record;
begin
  if not public.can_record_sales_for(p_restaurant_id) then
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

  if v_existing_count > 0 and not p_replace then
    return jsonb_build_object(
      'status', 'exists',
      'sales_date', v_sales_date,
      'existing', jsonb_build_object(
        'revenue', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'code', ga.code, 'name', ga.name, 'gross', ds.gross_amount,
            'discounts', ds.discounts, 'comps', ds.comps, 'net', ds.net_amount
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
        'item_count', (
          select count(*) from public.daily_item_sales dis
          where dis.restaurant_id = p_restaurant_id and dis.sales_date = v_sales_date
        ),
        'recorded_at', (
          select max(si.created_at) from public.sales_imports si
          where si.restaurant_id = p_restaurant_id
            and si.sales_date = v_sales_date and si.status = 'committed'
        )
      )
    );
  end if;

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
      and si.sales_date = v_sales_date and si.status = 'committed'
    order by si.created_at desc limit 1;

    update public.sales_imports set status = 'replaced'
    where restaurant_id = p_restaurant_id
      and sales_date = v_sales_date and status = 'committed';

    delete from public.daily_sales
    where restaurant_id = p_restaurant_id and sales_date = v_sales_date;
    delete from public.daily_sales_tenders
    where restaurant_id = p_restaurant_id and sales_date = v_sales_date;
    delete from public.daily_sales_summary
    where restaurant_id = p_restaurant_id and sales_date = v_sales_date;
    delete from public.daily_item_sales
    where restaurant_id = p_restaurant_id and sales_date = v_sales_date;
  end if;

  for v_rev in select * from jsonb_array_elements(p_payload->'revenue')
  loop
    v_category := v_rev->>'category';
    v_code := case v_category
      when 'food' then '4010' when 'na_beverage' then '4020'
      when 'liquor' then '4030' when 'beer_wine' then '4040'
      when 'other' then '4090' else null end;
    if v_code is null then
      raise exception 'unknown revenue category % (expected food, na_beverage, liquor, beer_wine, or other)', v_category;
    end if;

    select ga.id into v_gl_id from public.gl_accounts ga
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
      v_alloc_discount := 0;
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

  if v_largest_category is not null then
    update public.daily_sales ds
    set discounts = ds.discounts + (v_day_discounts - v_sum_discount),
        comps = ds.comps + (v_day_comps - v_sum_comp)
    from public.gl_accounts ga
    where ga.id = ds.gl_account_id
      and ds.restaurant_id = p_restaurant_id
      and ds.sales_date = v_sales_date
      and ga.code = case v_largest_category
        when 'food' then '4010' when 'na_beverage' then '4020'
        when 'liquor' then '4030' when 'beer_wine' then '4040'
        when 'other' then '4090' end;
  end if;

  insert into public.daily_sales_summary (
    restaurant_id, sales_date, covers, check_count, tips_total, service_charges,
    tax_collected, voids, refunds, reported_gross_sales, reported_net_sales,
    notes, source, recorded_by
  ) values (
    p_restaurant_id, v_sales_date,
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
    v_source, auth.uid()
  );

  if jsonb_typeof(p_payload->'tenders') = 'array' then
    for v_tender in select * from jsonb_array_elements(p_payload->'tenders')
    loop
      insert into public.daily_sales_tenders (
        restaurant_id, sales_date, tender_type, amount, txn_count
      ) values (
        p_restaurant_id, v_sales_date, v_tender->>'tender_type',
        coalesce((v_tender->>'amount')::numeric, 0),
        (v_tender->>'txn_count')::integer
      );
      v_sum_tenders := v_sum_tenders + coalesce((v_tender->>'amount')::numeric, 0);
      v_tenders_written := v_tenders_written + 1;
    end loop;
  end if;

  -- Item rows from PMIX. Name matching is case- and whitespace-insensitive
  -- against active menu items first, then cocktails.
  if jsonb_typeof(p_payload->'items') = 'array' then
    for v_item in select * from jsonb_array_elements(p_payload->'items')
    loop
      v_item_name := nullif(trim(v_item->>'item_name'), '');
      if v_item_name is null then
        raise exception 'an item row is missing item_name';
      end if;

      v_category := v_item->>'category';
      if v_category not in ('food', 'liquor', 'beer_wine', 'na_beverage', 'other') then
        raise exception 'item % has unknown category %', v_item_name, v_category;
      end if;

      select mi.id into v_menu_item_id
      from public.menu_items mi
      where mi.restaurant_id = p_restaurant_id
        and mi.is_active
        and lower(trim(mi.name)) = lower(v_item_name)
      limit 1;

      v_cocktail_id := null;
      if v_menu_item_id is null then
        select c.id into v_cocktail_id
        from public.cocktails c
        where c.restaurant_id = p_restaurant_id
          and c.is_active
          and lower(trim(c.name)) = lower(v_item_name)
        limit 1;
      end if;

      if v_menu_item_id is null and v_cocktail_id is null then
        v_unmatched_items := v_unmatched_items + 1;
      end if;

      insert into public.daily_item_sales (
        restaurant_id, sales_date, item_name, menu_group, category,
        sales_category_raw, quantity, gross_amount, discounts, voids, refunds,
        net_amount, menu_item_id, cocktail_id
      ) values (
        p_restaurant_id, v_sales_date, v_item_name,
        coalesce(nullif(trim(v_item->>'menu_group'), ''), ''),
        v_category,
        nullif(trim(v_item->>'sales_category_raw'), ''),
        coalesce((v_item->>'quantity')::numeric, 0),
        coalesce((v_item->>'gross')::numeric, 0),
        coalesce((v_item->>'discounts')::numeric, 0),
        coalesce((v_item->>'voids')::numeric, 0),
        coalesce((v_item->>'refunds')::numeric, 0),
        coalesce(
          (v_item->>'net')::numeric,
          coalesce((v_item->>'gross')::numeric, 0) - coalesce((v_item->>'discounts')::numeric, 0)
        ),
        v_menu_item_id, v_cocktail_id
      );

      v_items_written := v_items_written + 1;
    end loop;
  end if;

  insert into public.sales_imports (
    restaurant_id, sales_date, source, status, file_name, source_files, payload,
    uploaded_by, replaced_import_id
  ) values (
    p_restaurant_id, v_sales_date, v_source, 'committed',
    nullif(trim(p_payload->>'file_name'), ''),
    case when jsonb_typeof(p_payload->'source_files') = 'array'
      then (select array_agg(value::text) from jsonb_array_elements_text(p_payload->'source_files') as value)
      else null end,
    p_payload, auth.uid(), v_prior_import_id
  ) returning id into v_new_import_id;

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

  if v_unmatched_items > 0 then
    v_warnings := v_warnings || format(
      '%s item%s in this file did not match a menu item or cocktail in Clopen -- they were recorded but will not appear in menu engineering.',
      v_unmatched_items,
      case when v_unmatched_items = 1 then '' else 's' end
    );
  end if;

  -- Cross-check the two files against each other: item rows come from
  -- PMIX, the category revenue lines from the Sales Summary, so a category
  -- where they disagree usually means a category-mapping mistake.
  if v_items_written > 0 then
    for v_mismatch in
      select i.category,
             i.item_gross,
             coalesce(r.rev_gross, 0) as rev_gross
      from (
        select dis.category, sum(dis.gross_amount) as item_gross
        from public.daily_item_sales dis
        where dis.restaurant_id = p_restaurant_id and dis.sales_date = v_sales_date
        group by dis.category
      ) i
      left join (
        select case ga.code
                 when '4010' then 'food' when '4020' then 'na_beverage'
                 when '4030' then 'liquor' when '4040' then 'beer_wine'
                 when '4090' then 'other' end as category,
               sum(ds.gross_amount) as rev_gross
        from public.daily_sales ds
        join public.gl_accounts ga on ga.id = ds.gl_account_id
        where ds.restaurant_id = p_restaurant_id and ds.sales_date = v_sales_date
        group by 1
      ) r on r.category = i.category
      where abs(i.item_gross - coalesce(r.rev_gross, 0)) > 0.01
    loop
      v_warnings := v_warnings || format(
        'Item rows total %s for %s but the category revenue line says %s.',
        to_char(v_mismatch.item_gross, 'FM999999990.00'),
        v_mismatch.category,
        to_char(v_mismatch.rev_gross, 'FM999999990.00')
      );
    end loop;
  end if;

  return jsonb_build_object(
    'status', case when v_existing_count > 0 then 'replaced' else 'ingested' end,
    'sales_date', v_sales_date,
    'import_id', v_new_import_id,
    'replaced_import_id', v_prior_import_id,
    'revenue_rows', v_rows_written,
    'tender_rows', v_tenders_written,
    'item_rows', v_items_written,
    'unmatched_items', v_unmatched_items,
    'total_gross', v_total_gross,
    'warnings', to_jsonb(v_warnings)
  );
end;
$$;
