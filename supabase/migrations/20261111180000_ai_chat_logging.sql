-- ═══════════════════════════════════════════════════════════════════════════
-- AI Smart · chat logging
--
-- Three tables, written under the user's own session (POST /api/ask logs the
-- turn; /api/ai/active feedback logs a thumb):
--
--   chat_messages — one row per AI turn: which turn of the conversation, what
--     was asked and answered (bounded text, so the owner can review a turn
--     later), which tools were called, which chat card the result used, and the
--     token counts the API already reports. The question and reply are stored
--     for the owner's own review; both are truncated by the writer, never
--     rejected by the table for length.
--
--   chat_feedback — one vote on one message: the thumb, up to six reasons from
--     a fixed list, and a note. message_id cascades from chat_messages, so a
--     message and its feedback disappear together. Unique (user_id, message_id)
--     means a vote can be changed in place but never duplicated; the owner may
--     UPDATE only thumb/reasons/note (never the message it points at) or DELETE
--     the row to clear the vote.
--
--   help_gaps — a request no tool could serve: the request text, where it came
--     from and the intent the router guessed. This is how the next tool gets
--     chosen from real questions instead of guesses.
--
-- RLS: a user may INSERT and READ their own rows; feedback can additionally be
-- UPDATEd (three columns, own message only) or DELETEd. The turn log itself has
-- no client UPDATE or DELETE: it is a record, not a scratchpad. All three
-- cascade from auth.users, so deleting the account deletes its log with it.
--
-- Additive only (three new tables, no changes to existing ones). Safe to push
-- from a feature branch: code on main does not know these tables exist.
-- Apply to the TEST project (ref aiijzulctfpzdfjqyggm) first; production goes
-- through the normal migration flow.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text not null,
  turn integer not null,
  user_text text not null,
  reply_text text,
  tools_called text[] not null default '{}',
  template_id text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  constraint chat_messages_session_len check (char_length(session_id) between 1 and 120),
  constraint chat_messages_turn_chk check (turn between 1 and 100000),
  constraint chat_messages_user_text_len check (char_length(user_text) <= 4000),
  constraint chat_messages_reply_text_len check (reply_text is null or char_length(reply_text) <= 8000),
  constraint chat_messages_template_len check (template_id is null or char_length(template_id) <= 60),
  constraint chat_messages_tokens_chk check (input_tokens >= 0 and output_tokens >= 0),
  constraint chat_messages_tools_len check (array_length(tools_called, 1) is null or array_length(tools_called, 1) <= 20)
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);
create index if not exists chat_messages_user_session_idx
  on public.chat_messages (user_id, session_id, turn);

create table if not exists public.chat_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  thumb text not null,
  reasons text[],
  note text,
  created_at timestamptz not null default now(),
  constraint chat_feedback_thumb_chk check (thumb in ('up', 'down')),
  constraint chat_feedback_reasons_chk check (
    reasons is null
    or (
      coalesce(array_length(reasons, 1), 0) <= 6
      and reasons <@ array[
        'wrong_number', 'wrong_record', 'didnt_understand',
        'couldnt_do_it', 'too_slow', 'other'
      ]::text[]
    )
  ),
  constraint chat_feedback_note_len check (note is null or char_length(note) <= 1000)
);

-- One feedback row per message: a vote is changed in place, never stacked.
create unique index if not exists chat_feedback_user_message_uidx
  on public.chat_feedback (user_id, message_id);
create index if not exists chat_feedback_user_created_idx
  on public.chat_feedback (user_id, created_at desc);
create index if not exists chat_feedback_message_idx
  on public.chat_feedback (message_id);

create table if not exists public.help_gaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  request_text text not null,
  source text not null default 'chat',
  intent text,
  created_at timestamptz not null default now(),
  constraint help_gaps_request_len check (char_length(request_text) between 1 and 500),
  constraint help_gaps_source_len check (char_length(source) between 1 and 40),
  constraint help_gaps_intent_len check (intent is null or char_length(intent) <= 60)
);

create index if not exists help_gaps_user_created_idx
  on public.help_gaps (user_id, created_at desc);

alter table public.chat_messages enable row level security;
alter table public.chat_feedback enable row level security;
alter table public.help_gaps enable row level security;

revoke all on public.chat_messages from anon, authenticated;
revoke all on public.chat_feedback from anon, authenticated;
revoke all on public.help_gaps from anon, authenticated;

grant select, insert on public.chat_messages to authenticated;
grant select, insert on public.chat_feedback to authenticated;
-- A vote may be changed or cleared, and ONLY these three columns may change:
-- message_id, user_id and created_at stay as written by the insert.
grant update (thumb, reasons, note) on public.chat_feedback to authenticated;
grant delete on public.chat_feedback to authenticated;
grant select, insert on public.help_gaps to authenticated;

drop policy if exists "own chat messages" on public.chat_messages;
create policy "own chat messages" on public.chat_messages
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "log own chat messages" on public.chat_messages;
create policy "log own chat messages" on public.chat_messages
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "own chat feedback" on public.chat_feedback;
create policy "own chat feedback" on public.chat_feedback
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "leave own chat feedback" on public.chat_feedback;
create policy "leave own chat feedback" on public.chat_feedback
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_id and m.user_id = auth.uid()
    )
  );

-- Changing a vote uses the same ownership check as leaving one: the row is the
-- caller's, and it still points at a message the caller owns.
drop policy if exists "change own chat feedback" on public.chat_feedback;
create policy "change own chat feedback" on public.chat_feedback
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "clear own chat feedback" on public.chat_feedback;
create policy "clear own chat feedback" on public.chat_feedback
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own help gaps" on public.help_gaps;
create policy "own help gaps" on public.help_gaps
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "record own help gaps" on public.help_gaps;
create policy "record own help gaps" on public.help_gaps
  for insert to authenticated
  with check (auth.uid() = user_id);

-- ── Verification — run after applying ─────────────────────────
--
-- A. RLS on, all three: expect three rows, all true.
-- select relname, relrowsecurity from pg_class
--  where relname in ('chat_messages', 'chat_feedback', 'help_gaps');
--
-- B. ACL: authenticated has select/insert everywhere, plus UPDATE of only
--    thumb/reasons/note and DELETE on chat_feedback; no anon entry.
-- select relname, relacl from pg_class
--  where relname in ('chat_messages', 'chat_feedback', 'help_gaps');
--
-- C. Cascade from the account: expect 0.
-- select count(*) from public.chat_messages where user_id = '<deleted user id>';
