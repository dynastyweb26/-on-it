-- ═══════════════════════════════════════════════════════════════════════════
-- alive layer · events
--
-- One row per thing that happened that the owner did not do themselves:
-- a client opened or signed a shared document, a payment arrived through a
-- server path, time passed a due date, a draft went stale. The chat's event
-- cards (and later the toasts) read from here, so one feed drives both.
--
-- Deliberately NOT here:
--   * anything the owner did in the app. Owner outcomes (sent, payment recorded
--     by the owner, share done, expense logged, new client, "INV ready") are
--     local assistant cards in StoredChat — not events, no toasts.
--   * recaps of any kind (locked decision).
--
-- Writes are server-side only. An owner may SELECT their rows, and may UPDATE
-- exactly three columns on them — seen_at, acted_at, acted_result — which is
-- how a card marks itself read and how an action reports its result. No other
-- column is writable by a browser.
--
-- WRITERS AND THE PARTIAL DEDUPE INDEX
-- events_user_dedupe_uidx is a PARTIAL unique index, so PostgREST's
-- `on_conflict=` / `upsert` CANNOT target it (it emits a full-constraint
-- ON CONFLICT and Postgres rejects it with "no unique or exclusion constraint
-- matching the ON CONFLICT specification"). Server writers must therefore be
-- SQL functions / routes using the inference form, with the index predicate
-- spelled out:
--
--   insert into public.events (user_id, kind, ..., dedupe_key)
--   values (...)
--   on conflict (user_id, dedupe_key) where dedupe_key is not null
--   do nothing
--   returning id;
--
-- `returning id` is empty on a repeat: that is how a writer knows it posted
-- nothing and must not notify twice.
--
-- Rollback:
--   alter publication supabase_realtime drop table public.events;
--   drop table if exists public.events;
-- (Remove it from the publication first: dropping a published table fails.)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  -- 'client' = a link holder did something; 'time' = a sweep decided it.
  -- There is no 'owner': owner outcomes never become events.
  actor text not null default 'client',
  -- An event is about a document, so it goes with it. Soft deletes
  -- (invoices.deleted_at) leave the history intact; only a real delete cascades.
  invoice_id uuid references public.invoices (id) on delete cascade,
  document_kind text,
  document_number int,
  client_name text,
  amount numeric(12,2),
  meta jsonb not null default '{}'::jsonb,
  -- One row per real-world occurrence. The writer buckets it so two views in
  -- the same hour can never post two cards.
  dedupe_key text,
  -- Owner-session state on the card. Both start null: every event arrives
  -- unseen and unacted-on.
  seen_at timestamptz,
  acted_at timestamptz,
  acted_result text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint events_kind_chk check (kind in (
    'estimate_signed',
    'estimate_viewed',
    'invoice_viewed',
    'payment_recorded',
    'paid_in_full',
    'deposit_received',
    'invoice_overdue',
    'invoice_due_soon',
    'estimate_expiring_soon',
    'estimate_stale',
    'invoice_stale',
    'pay_page_opened_unpaid',
    'draft_unsent'
  )),
  constraint events_actor_chk check (actor in ('client', 'time')),
  constraint events_document_kind_chk
    check (document_kind is null or document_kind in ('invoice', 'quote')),
  constraint events_amount_chk check (amount is null or amount > 0),
  constraint events_meta_object_chk check (jsonb_typeof(meta) = 'object'),
  constraint events_client_name_len
    check (client_name is null or char_length(client_name) <= 120),
  constraint events_dedupe_len
    check (dedupe_key is null or char_length(dedupe_key) between 4 and 200),
  constraint events_acted_result_len
    check (acted_result is null or char_length(acted_result) <= 40)
);

-- The thread query: this owner's events, newest first, keyset-paged on
-- (occurred_at, id).
create index if not exists events_user_occurred_idx
  on public.events (user_id, occurred_at desc, id desc);

-- The unseen count / catch-up query on app open.
create index if not exists events_user_unseen_idx
  on public.events (user_id, occurred_at desc)
  where seen_at is null;

-- A document's history (the card taps through to the document, not to a list).
create index if not exists events_invoice_idx
  on public.events (invoice_id, occurred_at desc);

-- Dedupe: the writer supplies kind:subject:bucket, so a repeat inside the same
-- bucket is a no-op at the database, not a client-side hope. See the ON CONFLICT
-- note at the top: writers must name the predicate.
create unique index if not exists events_user_dedupe_uidx
  on public.events (user_id, dedupe_key)
  where dedupe_key is not null;

alter table public.events enable row level security;

-- Read: own rows only. No insert/delete policy exists, so even with the default
-- grants a browser cannot create or remove an event; the service role bypasses
-- RLS for the producers.
drop policy if exists "own events" on public.events;
create policy "own events" on public.events
  for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.events from anon, authenticated;

-- The one browser write: a card marking itself seen, then recording the outcome
-- of its action. Column-level, so no other column is reachable.
grant update (seen_at, acted_at, acted_result) on public.events to authenticated;

drop policy if exists "own events update" on public.events;
create policy "own events update" on public.events
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Realtime: additive to the existing publication, and skipped cleanly on a
-- database that has no publication (a bare local Postgres).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.events;
    exception
      when duplicate_object then null;
    end;
  end if;
end
$$;
