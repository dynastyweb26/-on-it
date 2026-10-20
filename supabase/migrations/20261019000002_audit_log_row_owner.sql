-- ═══════════════════════════════════════════════════════════════
-- Attribute audit_log rows to the changed row's owner, not auth.uid()
--
-- Problem: log_audit() writes user_id = auth.uid(). Service-role writes
-- (Stripe webhooks, cron, admin routes) run with auth.uid() = null, so their
-- audit rows land with user_id = null and a full detail payload. The
-- delete-account route redacts by user_id, so those rows survive a deletion
-- with customer names, amounts, and business details intact.
--
-- Fix: fall back to the owner carried by the changed row itself.
--   invoices.user_id = owner
--   profiles.id      = auth user id (profiles has no user_id column)
-- auth.uid() still wins when an authenticated user makes the change, and the
-- UUID guards keep a stray text value from failing the insert.
--
-- Backfill: attribute the historical service-role rows from their payload,
-- then redact rows whose owner no longer exists. Measured before writing:
-- 1505 null-user rows are attributable, 20 of them belong to deleted accounts;
-- the remaining 22 are DELETE markers that are already {"redacted": true}.
--
-- Idempotent: create-or-replace of one function plus guarded updates. Safe to
-- replay. DML is scoped to audit_log rows and does not touch customer tables.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.log_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_user_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  v_user_id := coalesce(
    auth.uid(),
    case
      when v_row->>'user_id'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (v_row->>'user_id')::uuid
    end,
    case
      when tg_table_name = 'profiles'
       and v_row->>'id'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (v_row->>'id')::uuid
    end
  );

  insert into audit_log (user_id, table_name, action, row_id, detail)
  values (
    v_user_id,
    tg_table_name,
    tg_op,
    coalesce(new.id, old.id),
    -- DELETE = account teardown: keep the event, drop the personal data.
    -- INSERT / UPDATE: unchanged — full row minus the encrypted payment columns.
    case
      when tg_op = 'DELETE' then jsonb_build_object('redacted', true)
      else to_jsonb(new) - 'zelle_info_enc' - 'bank_account_enc'
    end
  );
  return coalesce(new, old);
end $$;

-- ── Backfill: attribute historical service-role rows from their payload ──
-- invoices carry the owner in detail.user_id.
update public.audit_log
set user_id = (detail->>'user_id')::uuid
where user_id is null
  and table_name <> 'profiles'
  and detail->>'user_id'
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- profiles: the row id IS the auth user id.
update public.audit_log
set user_id = (detail->>'id')::uuid
where user_id is null
  and table_name = 'profiles'
  and detail->>'id'
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ── Cleanup: rows now attributed to an account that is already gone ──
--    were never redacted. Drop the payload, keep the who/what/when trail.
--    The 22 rows with detail = {"redacted": true} and no owner stay as-is.
update public.audit_log a
set detail = jsonb_build_object('redacted', true)
where a.user_id is not null
  and a.detail is not null
  and a.detail <> jsonb_build_object('redacted', true)
  and not exists (select 1 from auth.users u where u.id = a.user_id);
