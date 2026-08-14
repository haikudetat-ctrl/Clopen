-- Restaurant #2 (West Loop) had zero Controllable/Occupancy/G&A actuals
-- because gl_actual_opex() sources those lines from real invoice_lines,
-- not budget_lines -- without this, the rollup would show West Loop at an
-- unrealistic ~44% operating margin next to Emilia's ~41% despite having
-- NO rent/utilities/marketing at all. Mirrors Emilia's same 8 recurring
-- bills (same vendors, same GL accounts, same dates) scaled to ~60% of
-- Emilia's amounts, in line with the ~55-70% revenue scale used for West
-- Loop's daily_sales.
do $$
declare
  v_r2_id uuid := 'a0000000-0000-4000-9000-000000000001';
  v_unit_id uuid := '19259cfe-9c27-45e7-b7f3-6805d8268f18';
  v_inv_id uuid;
  r record;
begin
  for r in
    select * from (values
      ('RENT-JUL-WL'::text, '2026-07-01'::date, '10000000-0000-4000-9000-000000000003'::uuid, '1a5e191a-2393-4111-9aad-164592362d22'::uuid, 'July rent'::text, 2900.00::numeric),
      ('INS-JUL-WL', '2026-07-05', '10000000-0000-4000-9000-000000000006', '8c6d920f-a71c-4ede-9fb1-d4c2d1ced8b1', 'July insurance', 360.00),
      ('MKT-JUL-WL', '2026-07-10', '10000000-0000-4000-9000-000000000005', 'a7376a2a-387a-469f-aee0-aec2a1b05f9a', 'July marketing/ads', 390.00),
      ('UTIL-JUL-WL', '2026-07-15', '10000000-0000-4000-9000-000000000004', 'b0e8745a-33c3-4857-a07c-6b89dbaf736a', 'July utilities', 570.00),
      ('RENT-AUG-WL', '2026-08-01', '10000000-0000-4000-9000-000000000003', '1a5e191a-2393-4111-9aad-164592362d22', 'August rent', 2900.00),
      ('INS-AUG-WL', '2026-08-05', '10000000-0000-4000-9000-000000000006', '8c6d920f-a71c-4ede-9fb1-d4c2d1ced8b1', 'August insurance', 360.00),
      ('MKT-AUG-WL', '2026-08-10', '10000000-0000-4000-9000-000000000005', 'a7376a2a-387a-469f-aee0-aec2a1b05f9a', 'August marketing/ads', 430.00),
      ('UTIL-AUG-WL', '2026-08-15', '10000000-0000-4000-9000-000000000004', 'b0e8745a-33c3-4857-a07c-6b89dbaf736a', 'August utilities', 630.00)
    ) as t(invoice_number, invoice_date, vendor_id, gl_account_id, description, amount)
  loop
    v_inv_id := gen_random_uuid();
    insert into public.invoices (id, restaurant_id, vendor_id, invoice_number, invoice_date, subtotal, tax_amount, total_amount, status)
    values (v_inv_id, v_r2_id, r.vendor_id, r.invoice_number, r.invoice_date, r.amount, 0, r.amount, 'paid');

    insert into public.invoice_lines (invoice_id, restaurant_id, description, quantity, unit_id, unit_cost, line_total, gl_account_id)
    values (v_inv_id, v_r2_id, r.description, 1, v_unit_id, r.amount, r.amount, r.gl_account_id);
  end loop;
end $$;
