-- ═══════════════════════════════════════════════════════════════
-- Quote numbering + document-number forgery lock.
--
-- Context: the invoices table already stores BOTH documents via the `kind`
-- column ('invoice' | 'quote', default 'invoice'). No new column is added and no
-- backfill is needed — every existing row already has a `kind`. What was wrong:
--
--   1. NUMBERING WAS SHARED. next_invoice_no() advanced a single
--      profiles.next_invoice_number that BOTH quotes and invoices drew from, so
--      a quote consumed an invoice number and left gaps in the invoice sequence.
--      Quotes had no sequence of their own.
--
--   2. THE NUMBER WAS CLIENT-SUPPLIED. The browser called next_invoice_no() and
--      then passed invoice_number into a direct REST insert. The "own invoices"
--      RLS policy checks OWNERSHIP only (auth.uid() = user_id), never the number,
--      so a raw REST call could insert or PATCH ANY invoice_number — a forgeable
--      document number. Same class of hole already fixed for profiles in
--      20260723130946_revoke_profile_privileged_columns.sql.
--
-- Fix, in one place, server-side:
--   * profiles.next_quote_number — a SECOND per-user counter, so quotes number
--     independently (displayed with a Q- prefix in the app).
--   * assign_document_number() BEFORE INSERT trigger — assigns invoice_number
--     from the counter that matches NEW.kind and OVERRIDES whatever the client
--     sent. An invoice number is therefore only ever drawn when a row with
--     kind='invoice' is actually inserted (including at quote→invoice
--     conversion), so quotes never leave gaps in the invoice sequence. The
--     client no longer sends a number and reads the assigned one back.
--   * lock_document_identity() BEFORE UPDATE trigger — pins invoice_number and
--     kind to their stored values, so a PATCH can never renumber or re-type an
--     existing document.
--
-- With the number assigned and pinned by SECURITY DEFINER triggers, the client
-- value is irrelevant on both INSERT and UPDATE — a stronger guarantee than a
-- column grant, which could only reject a bad value, not supply the right one.
--
-- Idempotent: create-or-replace functions, add-column-if-not-exists,
-- drop-then-create triggers, and a re-runnable counter rebase.
-- ═══════════════════════════════════════════════════════════════

-- ── Second per-user counter, for quotes ──────────────────────
alter table public.profiles
  add column if not exists next_quote_number int not null default 1;

-- ── Assign the document number server-side (INSERT) ──────────
-- Runs as owner (SECURITY DEFINER) so it can advance the counter regardless of
-- the caller's column grants. The UPDATE ... RETURNING takes a row lock on the
-- profiles row, serializing concurrent inserts for the same user exactly as the
-- old next_invoice_no() did — so two racing inserts still get distinct numbers.
create or replace function public.assign_document_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if NEW.kind = 'quote' then
    update profiles set next_quote_number = next_quote_number + 1
      where id = NEW.user_id
      returning next_quote_number - 1 into n;
  else
    update profiles set next_invoice_number = next_invoice_number + 1
      where id = NEW.user_id
      returning next_invoice_number - 1 into n;
  end if;
  if n is null then
    raise exception 'no profile for user %, cannot assign document number', NEW.user_id;
  end if;
  -- Authoritative: overrides any client-supplied invoice_number.
  NEW.invoice_number := n;
  return NEW;
end $$;

drop trigger if exists assign_document_number on public.invoices;
create trigger assign_document_number
  before insert on public.invoices
  for each row execute function public.assign_document_number();

-- ── Pin the document identity (UPDATE) ───────────────────────
-- Legitimate updates touch status / dates / notes — never the number or kind.
-- Silently pin both to their stored values so a crafted PATCH cannot renumber a
-- document or flip a quote into an invoice out of band (conversion is a new
-- INSERT, not an in-place kind change).
create or replace function public.lock_document_identity()
returns trigger
language plpgsql
as $$
begin
  NEW.invoice_number := OLD.invoice_number;
  NEW.kind := OLD.kind;
  return NEW;
end $$;

drop trigger if exists lock_document_identity on public.invoices;
create trigger lock_document_identity
  before update on public.invoices
  for each row execute function public.lock_document_identity();

-- ── Rebase both counters to their true next value ────────────
-- Existing next_invoice_number was inflated by quotes that borrowed from it;
-- quotes had no counter at all. Reset each to (max used number of that kind) + 1
-- so the first quote numbers cleanly and the invoice sequence has no fresh gaps.
-- (user_id, invoice_number, kind) is unique, so a quote and an invoice may share
-- a number — the two sequences are independent.
update public.profiles p set
  next_invoice_number = coalesce(
    (select max(i.invoice_number) + 1 from public.invoices i
       where i.user_id = p.id and i.kind = 'invoice'), 1),
  next_quote_number = coalesce(
    (select max(i.invoice_number) + 1 from public.invoices i
       where i.user_id = p.id and i.kind = 'quote'), 1);

-- next_invoice_no() is left defined for backward safety but is no longer called
-- by the app; numbering now flows exclusively through assign_document_number().
-- Do NOT reintroduce client-side calls to it — that would double-advance the
-- counter and leave gaps.
