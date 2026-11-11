-- ═══════════════════════════════════════════════════════════════════════════
-- AI Smart · pending actions and idempotent confirms
--
-- A write or send tool never executes inside a model turn. The turn records a
-- PROPOSAL here with a one-time confirm token; POST /api/ai/confirm executes it
-- under the caller's own session. Two tables:
--
--   tool_pending_actions — one row per proposed action. Only the SHA-256 of the
--     token is stored, so a leaked row cannot be turned into a working confirm.
--     executed_at is the one-way latch: a token works once.
--
--   tool_action_commits — one row per confirm REQUEST, keyed by the client's
--     idempotency key. A replayed key returns this recorded result and executes
--     nothing, so a double tap or a retry after a timeout writes one row.
--
-- Access: own rows only, under the user's session. Both tables cascade from
-- auth.users, so account deletion removes them with the profile.
--
-- Additive only. Safe to push from a feature branch: code on main ignores it.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.tool_pending_actions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tool text not null,
  args jsonb not null default '{}'::jsonb,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  executed_at timestamptz,
  constraint tool_pending_tool_len check (char_length(tool) between 1 and 60),
  constraint tool_pending_args_len check (char_length(args::text) <= 8000),
  constraint tool_pending_token_len check (char_length(token_hash) = 64)
);

create unique index if not exists tool_pending_user_token_uidx
  on public.tool_pending_actions (user_id, token_hash);
create index if not exists tool_pending_user_created_idx
  on public.tool_pending_actions (user_id, created_at desc);

create table if not exists public.tool_action_commits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint tool_action_key_len check (char_length(idempotency_key) between 8 and 128)
);

create unique index if not exists tool_action_commits_user_key_uidx
  on public.tool_action_commits (user_id, idempotency_key);

alter table public.tool_pending_actions enable row level security;
alter table public.tool_action_commits enable row level security;

revoke all on public.tool_pending_actions from anon, authenticated;
revoke all on public.tool_action_commits from anon, authenticated;
grant select, insert, update on public.tool_pending_actions to authenticated;
grant select, insert on public.tool_action_commits to authenticated;

drop policy if exists "own pending actions" on public.tool_pending_actions;
create policy "own pending actions" on public.tool_pending_actions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "propose own pending actions" on public.tool_pending_actions;
create policy "propose own pending actions" on public.tool_pending_actions
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Only the executed_at latch is ever writable by a browser session, and only on
-- the caller's own row. A proposal's tool/args/token cannot be edited.
drop policy if exists "confirm own pending actions" on public.tool_pending_actions;
create policy "confirm own pending actions" on public.tool_pending_actions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own tool commits" on public.tool_action_commits;
create policy "own tool commits" on public.tool_action_commits
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "record own tool commits" on public.tool_action_commits;
create policy "record own tool commits" on public.tool_action_commits
  for insert to authenticated
  with check (auth.uid() = user_id);

-- ── Verification — run after applying ─────────────────────────
--
-- A. RLS on, for both tables: expect true, true.
-- select relname, relrowsecurity from pg_class
--  where relname in ('tool_pending_actions', 'tool_action_commits');
--
-- B. ACL: authenticated must have no anon entry on either table.
-- select relname, relacl from pg_class
--  where relname in ('tool_pending_actions', 'tool_action_commits');
--
-- C. The two uniqueness guarantees exist.
-- select indexname from pg_indexes
--  where tablename in ('tool_pending_actions', 'tool_action_commits')
--  order by indexname;
