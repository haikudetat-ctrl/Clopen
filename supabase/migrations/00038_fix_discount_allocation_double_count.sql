-- Fixes a money bug in ingest_daily_sales's discount/comp allocation.
--
-- Symptom, reproduced against live data: a payload where SOME revenue lines
-- carry an explicit discount and others don't would spread the explicit
-- amount across every category AND overwrite the explicit line's own value.
--
--   revenue: [ {liquor, gross 100, discounts 10}, {food, gross 100} ]
--   before:  liquor discounts 5.00, food discounts 5.00   <- both wrong
--   after:   liquor discounts 10.00, food discounts 0.00
--
-- Root cause: v_day_discounts falls back to the sum of the explicit line
-- values when no day-level total is supplied, and that same sum was then
-- used as the pool to allocate pro-rata across the lines that had no
-- explicit value -- counting it twice. The rounding-remainder settlement
-- then landed on the largest category overall, which could be one that had
-- an explicit value, corrupting it.
--
-- Correct semantics: an explicit per-category value is authoritative and is
-- excluded from allocation entirely. Only the difference between the day
-- total and the sum of explicit values is spread, and it is spread only
-- across the categories that did not specify one, pro-rata by their gross,
-- with the rounding remainder settled on the largest category IN THAT POOL.
--
-- Not reachable from the CSV importer, whose rollUpByCategory() always
-- emits a discount figure on every revenue line -- but ingest_daily_sales
-- is the shared contract the Toast API path and manual entry will also call,
-- so the partial-explicit case has to be right.
--
-- Also adds a warning when every line is explicit but the day total
-- disagrees with their sum, which previously passed silently.

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
  v_unalloc_disc numeric;
  v_unalloc_comp numeric;
  v_pool_gross_disc numeric := 0;
  v_pool_gross_comp numeric := 0;
  v_largest_pool_disc_cat text;
  v_largest_pool_disc_gross numeric := -1;
  v_largest_pool_comp_cat text;
  v_largest_pool_comp_gross numeric := -1;
  v_alloc_discount numeric;
  v_alloc_comp numeric;
  v_sum_pool_disc numeric := 0;
  v_sum_pool_comp numeric := 0;
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

  -- Pass 1: totals, plus the pro-rata POOL -- gross and largest member of
  -- only those categories that did NOT supply their own figure.
  for v_rev in select * from jsonb_array_elements(p_payload->'revenue')
  loop
    v_gross := coalesce((v_rev->>'gross')::numeric, 0);
    v_category := v_rev->>'category';
    v_total_gross := v_total_gross + v_gross;

    if v_rev ? 'discounts' then
      v_explicit_discounts := v_explicit_discounts + coalesce((v_rev->>'discounts')::numeric, 0);
    else
      v_pool_gross_disc := v_pool_gross_disc + v_gross;
      if v_gross > v_largest_pool_disc_gross then
        v_largest_pool_disc_gross := v_gross;
        v_largest_pool_disc_cat := v_category;
      end if;
    end if;

    if v_rev ? 'comps' then
      v_explicit_comps := v_explicit_comps + coalesce((v_rev->>'comps')::numeric, 0);
    else
      v_pool_gross_comp := v_pool_gross_comp + v_gross;
      if v_gross > v_largest_pool_comp_gross then
        v_largest_pool_comp_gross := v_gross;
        v_largest_pool_comp_cat := v_category;
      end if;
    end if;
  end loop;

  v_day_discounts := coalesce((p_payload->>'discounts')::numeric, v_explicit_discounts);
  v_day_comps := coalesce((p_payload->>'comps')::numeric, v_explicit_comps);

  -- Only the part of the day total NOT already claimed by an explicit line
  -- is available to spread.
  v_unalloc_disc := v_day_discounts - v_explicit_discounts;
  v_unalloc_comp := v_day_comps - v_explicit_comps;

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

    -- An explicit figure is authoritative and never reallocated.
    if v_rev ? 'discounts' then
      v_alloc_discount := coalesce((v_rev->>'discounts')::numeric, 0);
    elsif v_pool_gross_disc > 0 and v_category is distinct from v_largest_pool_disc_cat then
      v_alloc_discount := round(v_unalloc_disc * (v_gross / v_pool_gross_disc), 2);
      v_sum_pool_disc := v_sum_pool_disc + v_alloc_discount;
    else
      v_alloc_discount := 0; -- largest pool member settled after the loop
    end if;

    if v_rev ? 'comps' then
      v_alloc_comp := coalesce((v_rev->>'comps')::numeric, 0);
    elsif v_pool_gross_comp > 0 and v_category is distinct from v_largest_pool_comp_cat then
      v_alloc_comp := round(v_unalloc_comp * (v_gross / v_pool_gross_comp), 2);
      v_sum_pool_comp := v_sum_pool_comp + v_alloc_comp;
    else
      v_alloc_comp := 0;
    end if;

    insert into public.daily_sales (
      restaurant_id, sales_date, gl_account_id, gross_amount, discounts, comps
    ) values (
      p_restaurant_id, v_sales_date, v_gl_id, v_gross, v_alloc_discount, v_alloc_comp
    );

    v_rows_written := v_rows_written + 1;
  end loop;

  -- Settle the rounding remainder on the largest category in each pool, so
  -- the categories sum back to the day total to the cent.
  if v_largest_pool_disc_cat is not null then
    update public.daily_sales ds
    set discounts = ds.discounts + (v_unalloc_disc - v_sum_pool_disc)
    from public.gl_accounts ga
    where ga.id = ds.gl_account_id
      and ds.restaurant_id = p_restaurant_id
      and ds.sales_date = v_sales_date
      and ga.code = case v_largest_pool_disc_cat
        when 'food' then '4010' when 'na_beverage' then '4020'
        when 'liquor' then '4030' when 'beer_wine' then '4040'
        when 'other' then '4090' end;
  end if;

  if v_largest_pool_comp_cat is not null then
    update public.daily_sales ds
    set comps = ds.comps + (v_unalloc_comp - v_sum_pool_comp)
    from public.gl_accounts ga
    where ga.id = ds.gl_account_id
      and ds.restaurant_id = p_restaurant_id
      and ds.sales_date = v_sales_date
      and ga.code = case v_largest_pool_comp_cat
        when 'food' then '4010' when 'na_beverage' then '4020'
        when 'liquor' then '4030' when 'beer_wine' then '4040'
        when 'other' then '4090' end;
  end if;

  -- Every line was explicit, but the day total disagrees with their sum --
  -- previously silent, and it means one of the two numbers is wrong.
  if v_pool_gross_disc = 0 and abs(v_unalloc_disc) > 0.01 then
    v_warnings := v_warnings || format(
      'Day discount total is %s but the category lines sum to %s; the difference was not posted.',
      to_char(v_day_discounts, 'FM999999990.00'),
      to_char(v_explicit_discounts, 'FM999999990.00')
    );
  end if;
  if v_pool_gross_comp = 0 and abs(v_unalloc_comp) > 0.01 then
    v_warnings := v_warnings || format(
      'Day comp total is %s but the category lines sum to %s; the difference was not posted.',
      to_char(v_day_comps, 'FM999999990.00'),
      to_char(v_explicit_comps, 'FM999999990.00')
    );
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

  if jsonb_typeof(p_payload->'items') = 'array' then
    for v_item in select * from jsonb_array_elements(p_payload->'items')
    loop
      v_item_name := nullif(trim(v_item->>'item_name'), '');
      if v_item_name is null then
        raise exception 'an item row is missing item_name';
      end if;

      v_category := v_item->>'category';
      if v_category is null or v_category not in ('food', 'liquor', 'beer_wine', 'na_beverage', 'other') then
        raise exception 'item % has unknown category %', v_item_name, coalesce(v_category, '(null)');
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
      then (select array_agg(value) from jsonb_array_elements_text(p_payload->'source_files') as value)
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

  if v_items_written > 0 then
    for v_mismatch in
      select i.category, i.item_gross, coalesce(r.rev_gross, 0) as rev_gross
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
