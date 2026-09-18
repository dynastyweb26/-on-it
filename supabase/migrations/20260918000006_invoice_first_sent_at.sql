-- ═══════════════════════════════════════════════════════════════
-- invoices.first_sent_at — a stable "first sent" timestamp
--
-- sent_at is overwritten on every share (resend() bumps it, chat Send sets it),
-- so it means "last shared", not "first sent". Anything that reasons about how
-- long an invoice has been outstanding needs a date that does not move — today
-- the 2-day dunning filter (/api/followups: `.lt('sent_at', cutoff)`) is
-- silenced when an unpaid invoice is re-shared, because the bump pushes it back
-- out of the window. This adds a write-once first_sent_at.
--
-- Set once, never overwritten:
--   • on the draft → non-draft UPDATE transition (the normal Send path), and
--   • on an INSERT that is born non-draft (an invoice created already sent),
--     which the UPDATE trigger would miss.
-- The value is coalesce(sent_at, now()) at that moment. Once set (non-null) the
-- guard leaves it alone, and the lock trigger (20260918000007) pins it against
-- later overwrite. Backfill uses sent_at as the best available proxy for
-- existing rows ("last shared" for historical data; acceptable — see PUNCH-LIST).
--
-- Idempotent: add-column-if-not-exists, guarded backfill, create-or-replace
-- function, drop-then-create triggers.
-- ═══════════════════════════════════════════════════════════════

alter table public.invoices
  add column if not exists first_sent_at timestamptz;

-- Backfill from sent_at (best available proxy; "last shared" for existing rows).
update public.invoices
  set first_sent_at = sent_at
  where first_sent_at is null and sent_at is not null;

-- Stamp first_sent_at the first time a row is non-draft, and never again.
-- Depends on NEW only, so the one function serves both the INSERT trigger
-- (born-sent rows) and the UPDATE trigger (draft → sent transition).
create or replace function public.set_first_sent_at()
returns trigger
language plpgsql
as $$
begin
  if NEW.first_sent_at is null then
    NEW.first_sent_at := coalesce(NEW.sent_at, now());
  end if;
  return NEW;
end $$;

-- INSERT: an invoice created already non-draft is "sent" at birth.
drop trigger if exists set_first_sent_at_insert on public.invoices;
create trigger set_first_sent_at_insert
  before insert on public.invoices
  for each row
  when (new.status <> 'draft')
  execute function public.set_first_sent_at();

-- UPDATE: the normal draft → sent transition. Gated to the transition so a plain
-- non-draft update never re-enters this path (the lock trigger owns it there).
drop trigger if exists set_first_sent_at on public.invoices;
create trigger set_first_sent_at
  before update on public.invoices
  for each row
  when (old.status = 'draft' and new.status <> 'draft')
  execute function public.set_first_sent_at();
