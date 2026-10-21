-- Tighten invoice_attachments privileges and split the FOR ALL policy.
--
-- 20261018000001 created the metadata table with Supabase's default grants,
-- which left anon and authenticated holding every table privilege except
-- TRUNCATE. The app only ever:
--   * SELECTs rows (thumbnails / PDF)
--   * INSERTs a row after uploading one object
--   * DELETEs the invoice's rows and re-inserts them to renumber
-- It never UPDATEs a row. Removing UPDATE also keeps the FOR ALL policy from
-- being a future path back in if a table grant is accidentally restored.
--
-- The bucket and its storage policies are unchanged: private bucket, owner
-- read/write/delete, no UPDATE (uploads use upsert:false).
--
-- Idempotent: revoke/grant are repeatable, policies are drop-then-create.

revoke all on table public.invoice_attachments
  from public, anon, authenticated;

grant select, insert, delete on table public.invoice_attachments
  to authenticated;

-- service_role is the server-side manager (account deletion, admin tooling).
-- Keep UPDATE for it even though no current client path uses it.
grant select, insert, update, delete on table public.invoice_attachments
  to service_role;

-- Split the old FOR ALL policy so even a future UPDATE grant cannot expose
-- in-place row edits. RLS still limits every command to the owner.
drop policy if exists "own invoice attachments" on public.invoice_attachments;
drop policy if exists "own invoice attachments select" on public.invoice_attachments;
drop policy if exists "own invoice attachments insert" on public.invoice_attachments;
drop policy if exists "own invoice attachments delete" on public.invoice_attachments;

create policy "own invoice attachments select" on public.invoice_attachments
  for select using (auth.uid() = user_id);

create policy "own invoice attachments insert" on public.invoice_attachments
  for insert with check (auth.uid() = user_id);

create policy "own invoice attachments delete" on public.invoice_attachments
  for delete using (auth.uid() = user_id);

-- Verification after applying:
--
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'invoice_attachments'
-- order by grantee, privilege_type;
--   authenticated: DELETE, INSERT, SELECT (no UPDATE)
--   anon: none
--
-- select policyname, cmd from pg_policies
-- where schemaname = 'public' and tablename = 'invoice_attachments';
--   three rows: SELECT, INSERT, DELETE (no UPDATE / ALL)
--
-- The proof script is supabase/tests/invoice_attachments_grants_proofs.sql.
