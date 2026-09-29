-- ═══════════════════════════════════════════════════════════════
-- Push notifications, phase 1 (payment received, Stripe account problem).
--
-- push_subscriptions already exists (001_init.sql:113) with a FOR ALL owner
-- policy. This migration:
--   1. adds user_agent, last_used_at, env; length caps
--   2. replaces the FOR ALL policy with owner-only SELECT / INSERT / DELETE
--      (no UPDATE: re-subscribing and device hand-over go through the
--      service-role route POST /api/push/subscribe)
--   3. adds notification_log: one row per notification actually claimed for
--      sending, UNIQUE dedupe_key, service role only (RLS on, no policies)
--
-- Idempotent: add-column-if-not-exists, drop-then-create policies/constraints.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── push_subscriptions: new columns ──────────────────────────
alter table public.push_subscriptions
  add column if not exists user_agent   text,
  add column if not exists last_used_at timestamptz,
  -- Which deployment environment created it. Preview and production share this
  -- DB; each environment sends only to its own rows, so a sandbox test never
  -- buzzes the production install and vice versa. Pre-existing rows came from
  -- production (preview had no VAPID key), hence the default.
  add column if not exists env text not null default 'production';

alter table public.push_subscriptions drop constraint if exists push_subscriptions_env_chk;
alter table public.push_subscriptions add constraint push_subscriptions_env_chk
  check (env in ('production', 'preview', 'development'));

alter table public.push_subscriptions drop constraint if exists push_subscriptions_len_chk;
alter table public.push_subscriptions add constraint push_subscriptions_len_chk
  check (char_length(endpoint) <= 2048
     and char_length(p256dh)   <= 256
     and char_length(auth)     <= 64
     and (user_agent is null or char_length(user_agent) <= 512));

create index if not exists push_subscriptions_user_env_idx
  on public.push_subscriptions (user_id, env);

-- 2 ── push_subscriptions: owner-only select / insert / delete ──
drop policy if exists "own subscriptions" on public.push_subscriptions;

drop policy if exists "own subscriptions select" on public.push_subscriptions;
create policy "own subscriptions select" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "own subscriptions insert" on public.push_subscriptions;
create policy "own subscriptions insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "own subscriptions delete" on public.push_subscriptions;
create policy "own subscriptions delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- No UPDATE policy, and no UPDATE/TRUNCATE privilege either (belt and braces:
-- with RLS on and no policy, UPDATE already matches zero rows).
revoke update, truncate, references, trigger on public.push_subscriptions from anon, authenticated;
revoke all on public.push_subscriptions from anon;

-- 3 ── notification_log: dedupe + audit, service role only ─────
create table if not exists public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- e.g. 'payment:<invoice_payments.id>', 'connect:<user>:charges_paused:<evt>'
  dedupe_key  text not null unique,
  event_type  text not null,
  -- how many subscriptions accepted it (null until the send finishes)
  delivered   int,
  created_at  timestamptz not null default now(),
  constraint notification_log_type_chk
    check (event_type in ('payment_received', 'connect_problem', 'test')),
  constraint notification_log_key_len_chk
    check (char_length(dedupe_key) <= 200)
);

create index if not exists notification_log_user_idx
  on public.notification_log (user_id, created_at desc);

alter table public.notification_log enable row level security;
-- Deliberately NO policies: anon/authenticated see and write nothing.
revoke all on public.notification_log from anon, authenticated;

-- Verify after applying: supabase/snippets/privilege_check.sql sections J and K.
