-- Seed a second restaurant under Emilia's organization so the multi-unit
-- rollup view has something real to roll up. Design choices, and why:
--
-- - Shares the org's existing catalog (inventory_items), chart of accounts,
--   and fiscal calendar rather than duplicating them -- inventory_items,
--   gl_accounts, and fiscal_periods are all organization-scoped in this
--   schema, and a real multi-unit operator commonly does share a single
--   item master and COA across locations. Duplicating them per-restaurant
--   would also pollute the existing single-restaurant /inventory page,
--   which lists an organization's full catalog regardless of restaurant.
-- - Deliberately posts ONLY inventory_stock_ledger 'count_adjustment' and
--   'opening_balance' entries for this restaurant, no 'receipt' entries.
--   update_item_cost_from_ledger() updates inventory_items.current_unit_cost
--   globally (org-wide) on any 'receipt' with positive quantity_delta --
--   since items are shared, a receipt here at a different cost would
--   retroactively shift Emilia's already-verified numbers too. Skipping
--   receipts avoids that entirely; gl_actual_cogs()'s beginning+purchases-
--   ending formula still nets out to count_adjustment activity within the
--   period regardless, so COGS still comes out correct.
-- - Staff/schedules/compensation are restaurant-scoped already in this
--   schema, so no isolation concerns there.
do $$
declare
  v_org_id uuid := '47231723-a0d3-4547-bfa3-24bfeb84b491';
  v_r2_id uuid := 'a0000000-0000-4000-9000-000000000001';
  v_staff_foh uuid := 'a0000000-0000-4000-9000-000000000002';
  v_staff_boh uuid := 'a0000000-0000-4000-9000-000000000003';
  v_staff_mgr uuid := 'a0000000-0000-4000-9000-000000000004';
  v_template_id uuid := 'a0000000-0000-4000-9000-000000000005';
  v_gl_foh uuid;
  v_gl_boh uuid;
  v_gl_mgr uuid;
  v_week_start date;
  v_schedule_id uuid;
  v_d int;
begin
  insert into public.restaurants (id, organization_id, name, location_name)
  values (v_r2_id, v_org_id, 'Emilia', 'West Loop')
  on conflict (id) do nothing;

  -- Revenue: reuse Emilia's daily_sales pattern at ~55-70% scale with
  -- per-row jitter so it reads as a distinct, smaller sister location
  -- rather than a copy-pasted clone.
  insert into public.daily_sales (restaurant_id, sales_date, gl_account_id, gross_amount, discounts, comps)
  select
    v_r2_id,
    ds.sales_date,
    ds.gl_account_id,
    round(ds.gross_amount * f.factor, 2),
    round(ds.discounts * f.factor, 2),
    round(ds.comps * f.factor, 2)
  from public.daily_sales ds
  cross join lateral (select (0.55 + random() * 0.15)::numeric as factor) f
  where ds.restaurant_id = '00000000-0000-4000-8000-000000000001';

  -- Opening balance (comfortably covers the count-adjustment usage below,
  -- so ending on-hand stays positive) for the same 12 org items Emilia uses.
  insert into public.inventory_stock_ledger
    (restaurant_id, inventory_item_id, transaction_type, quantity_delta, unit_cost_at_transaction, occurred_at)
  values
    (v_r2_id, '30000000-0000-4000-9000-000000000001', 'opening_balance', 400, 1.90, '2026-07-05 08:00:00+00'),
    (v_r2_id, '30000000-0000-4000-9000-000000000002', 'opening_balance', 350, 1.30, '2026-07-05 08:00:00+00'),
    (v_r2_id, '30000000-0000-4000-9000-000000000003', 'opening_balance', 450, 1.00, '2026-07-05 08:00:00+00'),
    (v_r2_id, '30000000-0000-4000-9000-000000000004', 'opening_balance', 350, 3.30, '2026-07-05 08:00:00+00'),
    (v_r2_id, '30000000-0000-4000-9000-000000000005', 'opening_balance', 220, 4.60, '2026-07-05 08:00:00+00'),
    (v_r2_id, '30000000-0000-4000-9000-000000000006', 'opening_balance', 100, 9.00, '2026-07-05 08:00:00+00'),
    (v_r2_id, '30000000-0000-4000-9000-000000000007', 'opening_balance', 60,  12.75, '2026-07-05 08:00:00+00'),
    (v_r2_id, '30000000-0000-4000-9000-000000000008', 'opening_balance', 90,  9.90, '2026-07-05 08:00:00+00'),
    (v_r2_id, '30000000-0000-4000-9000-000000000009', 'opening_balance', 6000, 0.5591, '2026-07-05 08:00:00+00'),
    (v_r2_id, '30000000-0000-4000-9000-00000000000a', 'opening_balance', 3000, 0.8622, '2026-07-05 08:00:00+00'),
    (v_r2_id, '30000000-0000-4000-9000-00000000000b', 'opening_balance', 30000, 0.0907, '2026-07-05 08:00:00+00'),
    (v_r2_id, '30000000-0000-4000-9000-00000000000c', 'opening_balance', 6000, 0.3583, '2026-07-05 08:00:00+00');

  -- Usage split across three count dates spanning the seeded window --
  -- each item's total qty divided across 2026-07-19 / 2026-08-02 / 2026-08-14.
  insert into public.inventory_stock_ledger
    (restaurant_id, inventory_item_id, transaction_type, quantity_delta, unit_cost_at_transaction, occurred_at)
  select v_r2_id, item_id, 'count_adjustment', qty / 3.0, cost, d::timestamptz
  from (values
    ('30000000-0000-4000-9000-000000000001'::uuid, -1842.0, 1.90),
    ('30000000-0000-4000-9000-000000000002'::uuid, -1538.0, 1.30),
    ('30000000-0000-4000-9000-000000000003'::uuid, -2200.0, 1.00),
    ('30000000-0000-4000-9000-000000000004'::uuid, -1667.0, 3.30),
    ('30000000-0000-4000-9000-000000000005'::uuid, -978.0,  4.60),
    ('30000000-0000-4000-9000-000000000006'::uuid, -422.0,  9.00),
    ('30000000-0000-4000-9000-000000000007'::uuid, -43.5,   12.75),
    ('30000000-0000-4000-9000-000000000008'::uuid, -60.6,   9.90),
    ('30000000-0000-4000-9000-000000000009'::uuid, -2683.0, 0.5591),
    ('30000000-0000-4000-9000-00000000000a'::uuid, -1262.0, 0.8622),
    ('30000000-0000-4000-9000-00000000000b'::uuid, -13231.0,0.0907),
    ('30000000-0000-4000-9000-00000000000c'::uuid, -2694.0, 0.3583)
  ) as usage(item_id, qty, cost)
  cross join lateral (
    select unnest(array['2026-07-19', '2026-08-02', '2026-08-14']::date[]) as d
  ) dates;

  -- Staff + labor. A small crew: two hourly (FOH/BOH) working the same
  -- 7-hour shift every day for 8 weeks, plus one salaried manager.
  select id into v_gl_foh from public.gl_accounts where organization_id = v_org_id and code = '6010';
  select id into v_gl_boh from public.gl_accounts where organization_id = v_org_id and code = '6020';
  select id into v_gl_mgr from public.gl_accounts where organization_id = v_org_id and code = '6030';

  insert into public.staff (id, restaurant_id, name, roles, skill_level, active)
  values
    (v_staff_foh, v_r2_id, 'Dana Ruiz', array['server'], 3, true),
    (v_staff_boh, v_r2_id, 'Marcus Lee', array['cook'], 3, true),
    (v_staff_mgr, v_r2_id, 'Priya Nair', array['manager'], 5, true);

  insert into public.staff_compensation_history (staff_id, compensation_type, hourly_rate, gl_account_id, effective_date)
  values
    (v_staff_foh, 'hourly', 16.00, v_gl_foh, '2026-01-01'),
    (v_staff_boh, 'hourly', 19.00, v_gl_boh, '2026-01-01');

  insert into public.staff_compensation_history (staff_id, compensation_type, annual_salary, gl_account_id, effective_date)
  values
    (v_staff_mgr, 'salary', 54000.00, v_gl_mgr, '2026-01-01');

  insert into public.shift_templates (id, restaurant_id, name, start_time, end_time)
  values (v_template_id, v_r2_id, 'Full Shift', '10:00', '17:00');

  -- 8 weekly schedules (2026-06-29 through the week containing 08-30,
  -- matching the daily_sales window), every day, both hourly staff.
  for v_week_start in select generate_series('2026-06-29'::date, '2026-08-24'::date, interval '7 days')::date
  loop
    insert into public.schedules (restaurant_id, week_start)
    values (v_r2_id, v_week_start)
    returning id into v_schedule_id;

    for v_d in 0..6 loop
      insert into public.schedule_assignments (schedule_id, day, template_id, role, staff_id)
      values
        (v_schedule_id, v_d, v_template_id, 'server', v_staff_foh),
        (v_schedule_id, v_d, v_template_id, 'cook', v_staff_boh);
    end loop;
  end loop;
end $$;
