-- ═══════════════════════════════════════════════════════════════
-- AI chat logging + feedback. ADDITIVE ONLY: three new tables, their indexes
-- and policies. Nothing existing is altered.
--
-- Why: to learn which questions the AI chat answers well, which it can't
-- answer (help gaps), and which answers people mark wrong. Written ONLY by the
-- server routes (/api/ask, /api/route, /api/ask/feedback) under the caller's
-- own session. There is no service-role writer.
--
-- What is stored: the question and the reply text, the route taken, the tool
-- NAME and the ROW COUNT it returned, the model, latency and token counts.
-- Never the rows a tool returned: no table here has a column that could hold
-- them, so a code bug can't leak them into this log.
--
-- Access model (all three tables): owner-only SELECT and INSERT.
--   chat_messages  no client UPDATE or DELETE.
--   chat_feedback  the owner may also change (UPDATE) or withdraw (DELETE)
--                  their own vote. A vote is ONE row per (user, message): a
--                  plain UNIQUE constraint, not a partial index, so a changed
--                  vote is an upsert on that constraint (a partial unique
--                  index can't be an ON CONFLICT target; that broke the
--                  payment upsert).
--   help_gaps      no client UPDATE or DELETE.
-- Feedback and gaps may only point at the caller's own assistant message; the
-- policy checks it, so a forged message_id is refused by the database too.
--
-- Account deletion needs no code change: every user_id cascades from profiles.
--
-- Idempotent. Verify after applying: npm run db:privcheck, rows BG1-BG4.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  -- Groups the turns of one conversation. No table of its own: it is a label.
  conversation_id uuid not null,
  role            text not null check (role in ('user', 'assistant')),
  text            text not null check (char_length(text) <= 4000),
  -- Which path handled the message. Null when the turn wasn't routed.
  route           text check (route is null or route in ('ask', 'build', 'unsupported')),
  -- The tool that ran and how many rows it returned. NEVER the rows.
  tool_name       text check (tool_name is null or char_length(tool_name) <= 80),
  tool_row_count  integer check (tool_row_count is null or tool_row_count >= 0),
  model           text check (model is null or char_length(model) <= 100),
  latency_ms      integer check (latency_ms is null or latency_ms >= 0),
  tokens_in       integer check (tokens_in is null or tokens_in >= 0),
  tokens_out      integer check (tokens_out is null or tokens_out >= 0),
  created_at      timestamptz not null default now()
);

create index if not exists chat_messages_user_conv_idx
  on public.chat_messages (user_id, conversation_id, created_at);
create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);

create table if not exists public.chat_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  -- Thumbs up (1) or down (-1). There is no zero: withdrawing is a DELETE.
  rating     smallint not null check (rating in (-1, 1)),
  reason     text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  -- Plain UNIQUE, on purpose: the upsert's ON CONFLICT target.
  constraint chat_feedback_user_message_key unique (user_id, message_id)
);

create index if not exists chat_feedback_message_idx
  on public.chat_feedback (message_id);

create table if not exists public.help_gaps (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  message_id    uuid not null references public.chat_messages(id) on delete cascade,
  question_text text not null check (char_length(question_text) <= 1000),
  -- 'unsupported': no tool can answer it. 'thumbs_down': answered, marked bad.
  kind          text not null check (kind in ('unsupported', 'thumbs_down')),
  created_at    timestamptz not null default now(),
  -- One gap per message and kind, so a repeated vote can't pile up rows.
  constraint help_gaps_message_kind_key unique (message_id, kind)
);

create index if not exists help_gaps_user_idx
  on public.help_gaps (user_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────
alter table public.chat_messages enable row level security;
alter table public.chat_feedback enable row level security;
alter table public.help_gaps     enable row level security;

drop policy if exists "own chat messages select" on public.chat_messages;
create policy "own chat messages select" on public.chat_messages
  for select using (auth.uid() = user_id);

drop policy if exists "own chat messages insert" on public.chat_messages;
create policy "own chat messages insert" on public.chat_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "own chat feedback select" on public.chat_feedback;
create policy "own chat feedback select" on public.chat_feedback
  for select using (auth.uid() = user_id);

-- A vote may only point at the caller's own ASSISTANT message.
drop policy if exists "own chat feedback insert" on public.chat_feedback;
create policy "own chat feedback insert" on public.chat_feedback
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_id and m.user_id = auth.uid() and m.role = 'assistant'
    )
  );

drop policy if exists "own chat feedback update" on public.chat_feedback;
create policy "own chat feedback update" on public.chat_feedback
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_id and m.user_id = auth.uid() and m.role = 'assistant'
    )
  );

drop policy if exists "own chat feedback delete" on public.chat_feedback;
create policy "own chat feedback delete" on public.chat_feedback
  for delete using (auth.uid() = user_id);

drop policy if exists "own help gaps select" on public.help_gaps;
create policy "own help gaps select" on public.help_gaps
  for select using (auth.uid() = user_id);

drop policy if exists "own help gaps insert" on public.help_gaps;
create policy "own help gaps insert" on public.help_gaps
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_id and m.user_id = auth.uid()
    )
  );

-- ── Grants: default grants revoked, then only what is needed ────
revoke all on public.chat_messages from anon, authenticated;
revoke all on public.chat_feedback from anon, authenticated;
revoke all on public.help_gaps     from anon, authenticated;

grant select, insert on public.chat_messages to authenticated;
grant select, insert, delete on public.chat_feedback to authenticated;
-- The upsert's DO UPDATE sets every column it inserted, so those need the
-- grant; the policy's WITH CHECK still pins user_id and message ownership.
-- id and created_at are never client-updatable.
grant update (user_id, message_id, rating, reason) on public.chat_feedback to authenticated;
grant select, insert on public.help_gaps to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Verification — run after applying: npm run db:privcheck
--   BG1 chat_messages    RLS on; owner select + insert only; no client write
--   BG2 chat_feedback    RLS on; owner select/insert/update/delete; UNIQUE
--                        (user_id, message_id) is a plain constraint
--   BG3 help_gaps        RLS on; owner select + insert only
--   BG4 grants           anon holds nothing; authenticated holds exactly the
--                        privileges above; no TRUNCATE
-- Boundary cases (in a transaction you roll back), as an authenticated user:
--   • insert chat_messages with another user's user_id        → refused
--   • insert chat_feedback on another user's message          → refused
--   • insert chat_feedback on your own USER-role message      → refused
--   • rating 0 or 2                                           → refused
--   • second chat_feedback for the same message               → conflict
--   • update chat_messages / delete chat_messages / help_gaps → no privilege
-- ═══════════════════════════════════════════════════════════════
