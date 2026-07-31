-- ═══════════════════════════════════════════════════════════════
-- Redact audit_log payloads on DELETE (account teardown)
-- Run in Supabase SQL Editor (project: bitfmmffnigxjjyxoxfr).
--
-- Problem: account deletion cascades from profiles → invoices / profiles, and
-- the audit triggers (audit_invoices / audit_profiles, 001_init.sql) fire on
-- those cascading DELETEs, writing a full to_jsonb(old) snapshot — client_name,
-- line items, business profile — into audit_log.detail. Those rows persist
-- after the account is gone, contradicting the privacy policy's promise to
-- remove customer records.
--
-- Fix: on DELETE, store a redaction marker instead of the row payload. The
-- structural trail is preserved for security/fraud investigation — user_id,
-- table_name, action ('DELETE'), row_id, created_at — and only the
-- personal-data payload is dropped.
--
-- INSERT and UPDATE logging is UNCHANGED: still to_jsonb(new) minus the
-- encrypted Zelle column (payment data was already excluded — 001_init.sql,
-- SECURITY.md layer 3). The audit trail for non-deletion events is unaffected.
--
-- No app path deletes an invoice or a profile except the account-deletion
-- cascade (verified), so every DELETE on these tables IS account teardown.
--
-- The lifetime of INSERT/UPDATE audit rows the account already accumulated is
-- redacted separately, by user_id, in the delete-account route — this trigger
-- only governs new DELETE events.
--
-- Idempotent: create-or-replace of one function; the existing triggers call it
-- by name and pick up the new behavior with no trigger changes. Safe to replay.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.log_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (user_id, table_name, action, row_id, detail)
  values (
    auth.uid(),
    tg_table_name,
    tg_op,
    coalesce(new.id, old.id),
    -- DELETE = account teardown: keep the event, drop the personal data.
    -- INSERT / UPDATE: unchanged — full row minus the encrypted Zelle handle.
    case
      when tg_op = 'DELETE' then jsonb_build_object('redacted', true)
      else to_jsonb(new) - 'zelle_info_enc'
    end
  );
  return coalesce(new, old);
end $$;
