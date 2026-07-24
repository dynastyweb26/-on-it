-- ═══════════════════════════════════════════════════════════════
-- Phase A — expense / receipt capture.
--
-- NOT a create-table: public.expenses already exists (001_init.sql) and holds
-- live rows written by three call sites (chat, dashboard quick-add, dashboard
-- stats). This migration EXTENDS it for receipt capture rather than replacing
-- it, so nothing that reads it today breaks and Net Spend totals stay whole.
--
-- Reconciliation decisions (founder-approved):
--   * spent_on stays the date column (spec's `occurred_on`) — renaming a live
--     column would break the dashboard stats query and the quick-add form.
--   * receipt_url is added alongside the legacy receipt_path. New rows use
--     receipt_url (a storage path in the NEW 'receipts' bucket); receipt_path
--     is left untouched for any legacy row pointing into 'vault'.
--   * description becomes NULLABLE — a receipt-only expense has a vendor and
--     an amount, not a typed description.
--   * category gains the canonical 10-value CHECK. Existing free-text values
--     (AI-chosen, plus the dashboard's 'Gas'/'Materials'/… chips) are mapped
--     BEFORE the constraint is added, otherwise the ALTER fails on live data.
--     phone and insurance are their OWN categories, not folded into
--     subscriptions/other — both are core contractor deductions and the Phase B
--     tax summary cannot un-flatten them later.
--
-- Verified against the remote DB before writing this: public.expenses is
-- EMPTY (0 rows), so the backfill below is a no-op today. It stays anyway —
-- it's what makes this migration safe to replay onto a database that does
-- have rows, and safe to re-run.
--
-- Idempotent: every add/create is guarded, matching the 001 convention.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. New columns ───────────────────────────────────────────
alter table public.expenses
  add column if not exists vendor text,
  add column if not exists note text,
  add column if not exists receipt_url text,
  add column if not exists receipt_hash text,
  add column if not exists updated_at timestamptz not null default now();

-- Length caps as the final backstop (SECURITY.md — every text column).
-- Guarded so a re-run doesn't error on an already-present constraint.
do $$ begin
  alter table public.expenses add constraint expenses_vendor_len
    check (vendor is null or char_length(vendor) <= 120);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.expenses add constraint expenses_note_len
    check (note is null or char_length(note) <= 500);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.expenses add constraint expenses_receipt_url_len
    check (receipt_url is null or char_length(receipt_url) <= 500);
exception when duplicate_object then null; end $$;

-- SHA-256 hex of the ORIGINAL picked file, computed client-side. Fixed 64
-- lowercase hex chars — anything else is a client bug or a forged value.
do $$ begin
  alter table public.expenses add constraint expenses_receipt_hash_fmt
    check (receipt_hash is null or receipt_hash ~ '^[0-9a-f]{64}$');
exception when duplicate_object then null; end $$;

-- ── 2. description: required → optional ──────────────────────
-- A receipt-only expense (vendor + amount + date) has nothing to put here.
alter table public.expenses alter column description drop not null;

-- The 001 CHECK enforced `between 1 and 300`, which has to tolerate NULL now.
-- Restate it rather than leave a constraint that rejects every receipt row.
alter table public.expenses drop constraint if exists expenses_description_check;
do $$ begin
  alter table public.expenses add constraint expenses_description_len
    check (description is null or char_length(description) between 1 and 300);
exception when duplicate_object then null; end $$;

-- ── 3. category: free text → canonical 10 ────────────────────
-- Map what's already in the table. Anything unrecognised (and NULL) lands on
-- 'other' — never dropped, never silently wrong about which bucket it's in.
update public.expenses set category = case
  when category is null                                    then 'other'
  when lower(category) in ('food','fuel','supplies','tools','travel',
                           'maintenance','subscriptions','phone',
                           'insurance','other')            then lower(category)
  when lower(category) in ('gas','gasoline','diesel')      then 'fuel'
  when lower(category) in ('materials','material','parts',
                           'paint','hardware')             then 'supplies'
  when lower(category) in ('tool','equipment')             then 'tools'
  when lower(category) in ('meals','meal','lunch')         then 'food'
  -- 'phone' maps to itself above; only true subscriptions land here.
  when lower(category) in ('software','internet')          then 'subscriptions'
  when lower(category) in ('mobile','cell','cell phone')   then 'phone'
  when lower(category) in ('liability','premium','premiums')
                                                           then 'insurance'
  when lower(category) in ('mileage','lodging','hotel')    then 'travel'
  when lower(category) in ('repair','repairs','service')   then 'maintenance'
  else 'other'
end
where category is null
   or category not in ('food','fuel','supplies','tools','travel',
                       'maintenance','subscriptions','phone',
                       'insurance','other');

alter table public.expenses alter column category set default 'other';
alter table public.expenses alter column category set not null;

-- Replace the old `char_length(category) <= 60` check with the value check.
alter table public.expenses drop constraint if exists expenses_category_check;
do $$ begin
  alter table public.expenses add constraint expenses_category_valid
    check (category in ('food','fuel','supplies','tools','travel',
                        'maintenance','subscriptions','phone',
                        'insurance','other'));
exception when duplicate_object then null; end $$;

-- ── 4. Dedup index ───────────────────────────────────────────
-- One receipt image per user, ever. Partial so the (many) manually-entered
-- expenses with no receipt don't all collide with each other on NULL.
-- This is the hard backstop; the client checks first so the user gets a plain
-- "you already logged this one" instead of a constraint error.
create unique index if not exists expenses_user_receipt_hash_idx
  on public.expenses (user_id, receipt_hash)
  where receipt_hash is not null;

create index if not exists expenses_user_receipt_idx
  on public.expenses (user_id, spent_on desc)
  where receipt_url is not null;

-- ── 5. updated_at maintenance (matches profiles/invoices) ────
create or replace trigger touch_expenses before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ── 6. RLS ───────────────────────────────────────────────────
-- Already enabled in 001 with an owner-scoped FOR ALL policy ("own expenses").
-- Restated here so this migration is self-describing and a replay onto a fresh
-- database still lands owner-only access over the new columns.
alter table public.expenses enable row level security;
drop policy if exists "own expenses" on public.expenses;
create policy "own expenses" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 7. 'receipts' storage bucket ─────────────────────────────
-- Private, owner-scoped on foldername[1] = auth.uid() — the exact vault
-- pattern from 001_init.sql. Objects live at `${user_id}/${hash}.jpg`.
-- No UPDATE policy, same as vault: uploads must not rely on upsert.
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
  on conflict do nothing;

drop policy if exists "receipts owner read" on storage.objects;
create policy "receipts owner read" on storage.objects for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "receipts owner write" on storage.objects;
create policy "receipts owner write" on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "receipts owner delete" on storage.objects;
create policy "receipts owner delete" on storage.objects for delete
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
