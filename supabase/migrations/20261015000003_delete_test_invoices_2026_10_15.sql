-- One-off data cleanup: hard-delete 19 test invoices created 2026-10-15
-- (18 in the Cyril test session, 1 in the founder account). Founder-approved
-- in chat on 2026-10-15. Pinned to exact ids, and guarded so it can never
-- touch a paid invoice or anything created before that day if replayed.
--
-- Effects (verified read-only before writing):
--   invoice_payments  : 0 rows (would cascade)
--   expenses.invoice_id: 0 rows (would set null)
--   vault_documents   : 19 rows (the generated PDFs) -> deleted here too,
--                       otherwise they'd linger in Vault with no invoice
--   converted_from children outside this set: 0
--   audit_invoices trigger fires on DELETE and redacts payloads (expected)

create temporary table _test_invoice_ids (id uuid primary key);

insert into _test_invoice_ids (id)
select i.id
from public.invoices i
where i.id in (
  '2409a984-21e1-4c04-a53a-e1668c72aaee', '4c4940fc-5cca-437d-a84f-81ed0fe9f5eb',
  'b38e3bfa-0af2-41ef-85b6-e1eea11c303c', 'ed27d607-0f5b-48a0-a4c8-92c5be719832',
  'cbe25679-cb66-43c1-9e13-37634afe7dd8', '0e128a97-1fd7-40bc-ba51-c3c5e298538b',
  '100996a3-fe83-442f-95e0-2ba95a57af09', 'b0ab752a-f286-4eb8-9c1e-cd9c3a52e4e3',
  'c043693f-05e2-442c-b08c-88a627a42d3a', '29195e20-7009-45d5-98bd-66b2dfb547fb',
  '2cc9dbde-b18e-4cad-8b66-fa64977c4e21', 'e5c5a7c9-aa2c-4965-9631-a5c23395e6c5',
  '91c74b9c-b72f-4f2c-b991-71dd970f677b', '92921e98-7478-44fc-bd1d-8105a676fa1b',
  '182e723c-7489-47a9-b338-885118ee03c1', 'fa465c44-b6c6-421b-a5a2-ed22f2824c32',
  '7d5c0376-8b80-4e83-a71d-bd4e99831e26', '565c6ee0-b010-4d9d-a28d-2251dc606aab',
  'ab52387d-cbad-4f9a-a0f0-88c70f93ec45'
)
  and i.created_at >= timestamptz '2026-10-15 00:00:00 America/Chicago'
  and i.created_at <  timestamptz '2026-10-16 00:00:00 America/Chicago'
  and i.paid_at is null
  and coalesce(i.amount_paid, 0) = 0
  and not exists (select 1 from public.invoice_payments p where p.invoice_id = i.id);

delete from public.vault_documents
where invoice_id in (select id from _test_invoice_ids);

delete from public.invoices
where id in (select id from _test_invoice_ids);

drop table _test_invoice_ids;
