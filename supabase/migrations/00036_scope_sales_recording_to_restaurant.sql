-- Scopes sales recording to a manager's OWN restaurant.
--
-- Bug this fixes, found while verifying 00034/00035 against the live data:
-- every capability in this schema is checked with is_same_org_restaurant(),
-- which is ORGANIZATION-scoped. That is correct for owner_admin, who
-- legitimately operates every restaurant in the org (see the portfolio
-- rollup in 00029). It is wrong for a manager, who works at exactly one
-- location -- both seeded restaurants share an organization, and a manager
-- at one could successfully write daily_sales rows for the other.
--
-- can_record_sales() stays as the "does this person record sales at all"
-- capability for UI gating. Row-level checks move to the restaurant-aware
-- can_record_sales_for(), which grants an owner_admin their whole org and a
-- manager only current_restaurant_id().

create or replace function can_record_sales_for(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select
    (public.is_owner_admin() and public.is_same_org_restaurant(target_restaurant_id))
    or (public.is_manager() and public.is_same_restaurant(target_restaurant_id));
$$;

-- daily_sales: budget managers keep org-wide reach; sales recorders are
-- narrowed to the restaurants can_record_sales_for() allows.
drop policy daily_sales_insert on daily_sales;
create policy daily_sales_insert on daily_sales
  for insert to authenticated
  with check (
    (can_manage_budget() and is_same_org_restaurant(restaurant_id))
    or can_record_sales_for(restaurant_id)
  );

drop policy daily_sales_update on daily_sales;
create policy daily_sales_update on daily_sales
  for update to authenticated
  using (
    (can_manage_budget() and is_same_org_restaurant(restaurant_id))
    or can_record_sales_for(restaurant_id)
  )
  with check (
    (can_manage_budget() and is_same_org_restaurant(restaurant_id))
    or can_record_sales_for(restaurant_id)
  );

drop policy daily_sales_delete on daily_sales;
create policy daily_sales_delete on daily_sales
  for delete to authenticated
  using (
    (can_manage_budget() and is_same_org_restaurant(restaurant_id))
    or can_record_sales_for(restaurant_id)
  );

drop policy daily_sales_select on daily_sales;
create policy daily_sales_select on daily_sales
  for select to authenticated
  using (
    (can_view_financials() and is_same_org_restaurant(restaurant_id))
    or can_record_sales_for(restaurant_id)
  );

-- Same narrowing for the capture tables added in 00035.
drop policy daily_sales_summary_select on daily_sales_summary;
create policy daily_sales_summary_select on daily_sales_summary
  for select to authenticated
  using (
    (can_view_financials() and is_same_org_restaurant(restaurant_id))
    or can_record_sales_for(restaurant_id)
  );

drop policy daily_sales_summary_write on daily_sales_summary;
create policy daily_sales_summary_write on daily_sales_summary
  for all to authenticated
  using (can_record_sales_for(restaurant_id))
  with check (can_record_sales_for(restaurant_id));

drop policy daily_sales_tenders_select on daily_sales_tenders;
create policy daily_sales_tenders_select on daily_sales_tenders
  for select to authenticated
  using (
    (can_view_financials() and is_same_org_restaurant(restaurant_id))
    or can_record_sales_for(restaurant_id)
  );

drop policy daily_sales_tenders_write on daily_sales_tenders;
create policy daily_sales_tenders_write on daily_sales_tenders
  for all to authenticated
  using (can_record_sales_for(restaurant_id))
  with check (can_record_sales_for(restaurant_id));

drop policy sales_import_mappings_select on sales_import_mappings;
create policy sales_import_mappings_select on sales_import_mappings
  for select to authenticated
  using (
    (can_view_financials() and is_same_org_restaurant(restaurant_id))
    or can_record_sales_for(restaurant_id)
  );

drop policy sales_import_mappings_write on sales_import_mappings;
create policy sales_import_mappings_write on sales_import_mappings
  for all to authenticated
  using (can_record_sales_for(restaurant_id))
  with check (can_record_sales_for(restaurant_id));

drop policy sales_imports_select on sales_imports;
create policy sales_imports_select on sales_imports
  for select to authenticated
  using (
    (can_view_financials() and is_same_org_restaurant(restaurant_id))
    or can_record_sales_for(restaurant_id)
  );

drop policy sales_imports_write on sales_imports;
create policy sales_imports_write on sales_imports
  for all to authenticated
  using (can_record_sales_for(restaurant_id))
  with check (can_record_sales_for(restaurant_id));

-- The RPC bypasses RLS (SECURITY DEFINER), so its own guard has to be
-- narrowed too -- this is the check that actually stopped the cross-
-- restaurant write in testing.
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
