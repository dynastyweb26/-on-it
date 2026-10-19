-- ═══════════════════════════════════════════════════════════════
-- Invoice/quote attachments (images, max 6 per document).
--
-- Storage: a private 'invoice-attachments' bucket, owner-scoped on
-- foldername[1] = auth.uid() — the exact pattern of the 'receipts' bucket
-- (20260724002308_expenses.sql). Objects live at
--   ${user_id}/${invoice_id}/${uuid}.jpg
-- Metadata and ordering live in public.invoice_attachments; position is
-- constrained to 0..5 so the 6-image cap also holds at the DB layer.
--
-- Images reach the PDF client-side (the PDF is built with html2canvas →
-- jsPDF in the browser), read back with short-lived signed URLs, so no
-- public read and no RPC change are needed. The PDF is the only surface
-- that renders them (pay page unchanged).
--
-- Idempotent: every create is guarded, policies are drop-then-create.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Metadata table ─────────────────────────────────────────
create table if not exists public.invoice_attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  storage_path text not null check (char_length(storage_path) between 1 and 400),
  position     int  not null check (position between 0 and 5),
  created_at   timestamptz not null default now(),
  unique (invoice_id, position)
);

create index if not exists invoice_attachments_invoice_idx
  on public.invoice_attachments (invoice_id, position);

-- ── 2. RLS: owner-only ────────────────────────────────────────
alter table public.invoice_attachments enable row level security;

drop policy if exists "own invoice attachments" on public.invoice_attachments;
create policy "own invoice attachments" on public.invoice_attachments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 3. Private 'invoice-attachments' bucket ───────────────────
-- No UPDATE policy (same as vault/receipts): uploads must not rely on upsert.
insert into storage.buckets (id, name, public)
values ('invoice-attachments', 'invoice-attachments', false)
on conflict do nothing;

drop policy if exists "invoice attachments owner read" on storage.objects;
create policy "invoice attachments owner read" on storage.objects for select
  using (bucket_id = 'invoice-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "invoice attachments owner write" on storage.objects;
create policy "invoice attachments owner write" on storage.objects for insert
  with check (bucket_id = 'invoice-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "invoice attachments owner delete" on storage.objects;
create policy "invoice attachments owner delete" on storage.objects for delete
  using (bucket_id = 'invoice-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
