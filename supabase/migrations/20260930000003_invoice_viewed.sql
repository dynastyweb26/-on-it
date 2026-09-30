-- ═══════════════════════════════════════════════════════════════
-- Push phase 2: "Ben opened INV-0067".
--
--   1. invoices.viewed_at — the first qualifying client view of a sent invoice.
--   2. mark_invoice_viewed(p_token, p_viewer) — service-role only. Called by
--      POST /api/pay/[token]/viewed, which the pay page fires from its own
--      code AFTER load (never on GET: link-preview fetchers, including the
--      iMessage preview built on the SENDER's phone, would count as views).
--      A single conditional UPDATE: only the first qualifying view stamps the
--      row and returns it; every later call returns nothing. It skips
--        * drafts / paid / void / soft-deleted rows and quotes,
--        * views within 2 minutes of sending (the owner checking their link).
--          Measured from coalesce(sent_at, first_sent_at): a draft that a
--          payment moved to 'sent' (20260930000002) has no sent_at, only the
--          first_sent_at its transition stamped; without the fallback its
--          views would never record,
--        * the owner (the route passes the signed-in viewer's id, if any).
--      A skipped view stamps nothing, so a later real client view still wins.
--      It returns the owner id to the SERVER route only (never to the page).
--   3. notification_log.event_type gains 'invoice_viewed'. The push is also
--      deduped on 'viewed:<invoice_id>', so an owner clearing viewed_at through
--      the API (invoices keeps table-level UPDATE, RLS owner-scoped) can never
--      cause a second push.
--
-- lock_sent_invoice_fields does not pin viewed_at, so the stamp is not undone
-- on a sent row; that trigger is unchanged here.
--
-- Idempotent: add-column-if-not-exists, create-or-replace, drop-then-add.
-- Verify after applying: supabase/snippets/privilege_check.sql section L.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── invoices.viewed_at ───────────────────────────────────────
alter table public.invoices add column if not exists viewed_at timestamptz;

-- 2 ── mark_invoice_viewed ──────────────────────────────────────
-- invoice_number is int (001_init.sql:62), client_name text not null (:63).
create or replace function public.mark_invoice_viewed(p_token text, p_viewer uuid)
returns table (invoice_id uuid, user_id uuid, invoice_number int, client_name text)
language sql
security definer
set search_path = ''
as $$
  update public.invoices i
     set viewed_at = now()
   where i.public_token = p_token
     and char_length(p_token) <= 32
     and i.kind = 'invoice'
     and i.status in ('sent', 'overdue')
     and i.deleted_at is null
     and i.viewed_at is null
     and coalesce(i.sent_at, i.first_sent_at) < now() - interval '2 minutes'
     and (p_viewer is null or p_viewer <> i.user_id)
  returning i.id, i.user_id, i.invoice_number, i.client_name;
$$;

revoke execute on function public.mark_invoice_viewed(text, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_invoice_viewed(text, uuid)
  to service_role;

-- 3 ── notification_log: allow the new event type ───────────────
alter table public.notification_log drop constraint if exists notification_log_type_chk;
alter table public.notification_log add constraint notification_log_type_chk
  check (event_type in ('payment_received', 'connect_problem', 'invoice_viewed', 'test'));
