-- ═══════════════════════════════════════════════════════════════
-- Feedback (FEEDBACK-SPEC.md §2): the "Tell us about On It" submissions.
--
-- feedback: written ONLY by the service role (POST /api/feedback, which also
-- emails the founder). Clients may read their own rows (Chat uses that to stop
-- asking once a user has submitted); no client INSERT/UPDATE/DELETE.
-- Supabase grants ALL on new public tables to anon/authenticated by default,
-- so revoke at table level and grant SELECT back to authenticated only.
--
-- status is changed by hand (Supabase table editor) in v1.
-- user_id cascades, so deleting the account deletes its feedback.
--
-- Additive only. Idempotent.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tag text not null,
  message text not null,
  rating smallint,
  source text not null default 'settings',
  screen text,
  app_version text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  constraint feedback_tag_chk check (tag in ('idea', 'problem', 'love')),
  constraint feedback_message_len check (char_length(message) between 5 and 2000),
  constraint feedback_rating_chk check (rating is null or rating between 1 and 5),
  constraint feedback_source_chk check (source in ('settings', 'chat_prompt')),
  constraint feedback_screen_len check (screen is null or char_length(screen) <= 60),
  constraint feedback_version_len check (app_version is null or char_length(app_version) <= 40),
  constraint feedback_status_chk check (status in ('new', 'replied', 'planned', 'shipped', 'closed'))
);

create index if not exists feedback_user_created_idx
  on public.feedback (user_id, created_at desc);
create index if not exists feedback_status_created_idx
  on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;

drop policy if exists "own feedback" on public.feedback;
create policy "own feedback" on public.feedback
  for select to authenticated
  using (auth.uid() = user_id);

-- ── Verification — run after applying ─────────────────────────
--
-- A. feedback ACL: expect authenticated=r only, no anon entry.
-- select relacl from pg_class where oid = 'public.feedback'::regclass;
--
-- B. RLS on: expect true.
-- select relrowsecurity from pg_class where oid = 'public.feedback'::regclass;
