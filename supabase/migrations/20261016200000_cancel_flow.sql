-- ═══════════════════════════════════════════════════════════════
-- Cancel flow (CANCEL-FLOW-SPEC.md §4): subscription cancel/pause state on
-- profiles + a cancel_events log.
--
-- profiles: three new columns, written ONLY by the service role (Stripe
-- webhook + /api/subscription/* routes). They are privileged automatically:
-- since 20260925000001 authenticated holds no table-level UPDATE/INSERT on
-- profiles, only per-column grants, and nothing below grants these columns.
-- Verified live 2026-10-16: relacl = authenticated=r/postgres.
--
-- cancel_events: written only by the service role (the routes that also call
-- Stripe). Clients may read their own rows; no client INSERT/UPDATE/DELETE.
-- Supabase grants ALL on new public tables to anon/authenticated by default,
-- so revoke at table level and grant SELECT back to authenticated only.
--
-- cancel_events.platform: which store billed the subscription. Only 'web'
-- (Stripe) is written today; 'ios' / 'android' are reserved for the native
-- billing versions of the same flow.
--
-- Additive only. Idempotent.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists paused_until timestamptz,
  add column if not exists retention_offer_used_at timestamptz;

create table if not exists public.cancel_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  reason text,
  detail text,
  months smallint,
  platform text not null default 'web',
  created_at timestamptz not null default now(),
  constraint cancel_events_kind_chk
    check (kind in ('cancel', 'resume', 'offer_discount', 'offer_pause')),
  constraint cancel_events_reason_chk
    check (reason is null or reason in ('price', 'seasonal', 'feature', 'switching', 'other')),
  constraint cancel_events_detail_len
    check (detail is null or char_length(detail) <= 500),
  constraint cancel_events_months_chk
    check (months is null or months between 1 and 3),
  constraint cancel_events_platform_chk
    check (platform in ('web', 'ios', 'android'))
);

create index if not exists cancel_events_user_created_idx
  on public.cancel_events (user_id, created_at desc);

alter table public.cancel_events enable row level security;

revoke all on public.cancel_events from anon, authenticated;
grant select on public.cancel_events to authenticated;

drop policy if exists "own cancel events" on public.cancel_events;
create policy "own cancel events" on public.cancel_events
  for select to authenticated
  using (auth.uid() = user_id);

-- ── Verification — run after applying ─────────────────────────
--
-- A. New profile columns are NOT client-writable (expect all false):
-- select c, has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE') as can_update,
--           has_column_privilege('authenticated', 'public.profiles', c, 'INSERT') as can_insert
-- from unnest(array['cancel_at_period_end','paused_until','retention_offer_used_at']) c;
--
-- B. cancel_events ACL: expect authenticated=r only, no anon entry.
-- select relacl from pg_class where oid = 'public.cancel_events'::regclass;
--
-- C. RLS on: expect true.
-- select relrowsecurity from pg_class where oid = 'public.cancel_events'::regclass;
