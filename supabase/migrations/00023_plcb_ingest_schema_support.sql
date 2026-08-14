-- Migration 1: schema support for vendor-import dedup
-- purchase_orders needs a way to remember "this PO already came from
-- external order #X for this vendor-import source" so re-uploading the same
-- PDF (or one of PLCB's duplicate-export filenames covering the same
-- underlying order) doesn't create a second purchase order/receipt/invoice
-- chain and double-post to the ledger.
alter table public.purchase_orders add column external_reference text;

alter table public.purchase_orders drop constraint purchase_orders_source_check;
alter table public.purchase_orders add constraint purchase_orders_source_check
  check (source = any (array['manual'::text, 'par_level_suggestion'::text, 'plcb_import'::text]));

create unique index purchase_orders_external_ref_uniq
  on public.purchase_orders (restaurant_id, source, external_reference)
  where external_reference is not null;
