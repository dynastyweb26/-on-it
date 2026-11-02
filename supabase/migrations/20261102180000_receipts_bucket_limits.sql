-- The receipts bucket refuses what the server used to have to inspect.
--
-- /api/plaid/review caps a receipt at 5 MB and checks it is a JPEG, but only
-- AFTER downloading the object: an oversized or non-JPEG upload is stored first
-- and refused second, and a path that never reaches that route (the chat save,
-- a direct storage call) is capped by nothing at all. Storage enforces both at
-- upload time instead, so an object that exists in this bucket is already what
-- every reader expects.
--
-- Both writers store a recompressed image/jpeg from src/lib/receipt.ts
-- (longest edge 1600 px, ~900 KB target): ChatView saveExpense and
-- src/lib/bank-receipt.ts. The limits apply to NEW uploads only, and every
-- object already stored is image/jpeg (largest ~590 KB when this was written),
-- so nothing in the bucket becomes inconsistent with the cap.
--
-- No policy, grant or object is touched here: the bucket stays private and its
-- owner-scoped policies are unchanged.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg']
 where id = 'receipts';
