-- ═══════════════════════════════════════════════════════════════
-- Weekly / monthly recaps: "Your week in review".
--
--   1. public.recaps — one snapshot per owner per period, written by the daily
--      /api/followups cron (service role) on the owner's local Monday (the
--      previous Mon–Sun) or local 1st (the previous calendar month). The
--      numbers follow the Books summary rules (cash-basis income from the
--      invoice_payments ledger on invoices only; non-deleted expenses by
--      spent_on). An empty period (no income, no expenses) gets no row.
--      Clients may only read their own rows and stamp seen_at when the
--      in-app sheet closes: SELECT + column-level UPDATE (seen_at) to
--      authenticated, owner-only policies, no INSERT / DELETE / TRUNCATE.
--   2. profiles.recap_push — "Send me my weekly and monthly recap". A user
--      preference: SAFE column, UPDATE granted to authenticated (the Settings
--      toggle lands after the paywall merges). Default on. Not insertable.
--   3. notification_log.event_type gains 'recap'. Dedupe key
--      'recap:<kind>:<user_id>:<period_start>' — one push per period, ever.
--   4. TRUNCATE revoked on the new table (matches 20260930000005; the default
--      privileges already drop it, this is belt and braces).
--
-- Sorts after the paywall's 20261001000001–000003 and touches none of their
-- objects. Idempotent: if-not-exists, drop-then-create, revokes/grants.
-- Verify after applying: npm run db:privcheck — sections B, D, and P.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── recaps ────────────────────────────────────────────────────
create table if not exists public.recaps (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  kind                 text not null,
  period_start         date not null,          -- inclusive, owner's local dates
  period_end           date not null,          -- inclusive
  income               numeric(12,2) not null default 0,
  expenses             numeric(12,2) not null default 0,
  net                  numeric(12,2) not null default 0,
  payments_count       integer not null default 0,
  expenses_count       integer not null default 0,
  top_category         text,
  top_category_amount  numeric(12,2),
  top_vendor           text,
  created_at           timestamptz not null default now(),
  seen_at              timestamptz,
  constraint recaps_period_key unique (user_id, kind, period_start),
  constraint recaps_kind_chk check (kind in ('week', 'month')),
  constraint recaps_range_chk check (period_end >= period_start),
  constraint recaps_counts_chk check (payments_count >= 0 and expenses_count >= 0),
  constraint recaps_text_len_chk check (
    (top_category is null or char_length(top_category) <= 60)
    and (top_vendor is null or char_length(top_vendor) <= 120))
);

-- The in-app sheet's query: an owner's newest recaps.
create index if not exists recaps_user_created_idx
  on public.recaps (user_id, created_at desc);

alter table public.recaps enable row level security;

drop policy if exists "own recaps select" on public.recaps;
create policy "own recaps select" on public.recaps
  for select using (auth.uid() = user_id);

drop policy if exists "own recaps update" on public.recaps;
create policy "own recaps update" on public.recaps
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No INSERT / DELETE policy and no such privilege: the cron writes with the
-- service role. UPDATE is column-level on seen_at only.
revoke all on public.recaps from anon, authenticated;
grant select on public.recaps to authenticated;
grant update (seen_at) on public.recaps to authenticated;

-- 2 ── profiles.recap_push ──────────────────────────────────────
alter table public.profiles
  add column if not exists recap_push boolean not null default true;

-- Column-level only: 20260925000001 keeps profiles at no table-level writes.
grant update (recap_push) on public.profiles to authenticated;

-- 3 ── notification_log: allow the new event type ───────────────
-- Full list, superseding 20260930000004's (which added draft_unsent).
alter table public.notification_log drop constraint if exists notification_log_type_chk;
alter table public.notification_log add constraint notification_log_type_chk
  check (event_type in ('payment_received', 'connect_problem', 'invoice_viewed', 'draft_unsent', 'recap', 'test'));

-- 4 ── TRUNCATE (20260930000005) ────────────────────────────────
revoke truncate on public.recaps from anon, authenticated;
