-- Enforce parent ownership on client_id / converted_from / expenses.invoice_id.
--
-- The RLS policies on invoices and expenses check only `auth.uid() = user_id`
-- on the row being written. They never check that the row a foreign key points
-- at belongs to the same user, and the FK check itself runs as the table owner
-- (it bypasses RLS). So a caller who knew another user's client or invoice UUID
-- could write it into their own row:
--   invoices.client_id       -> someone else's client
--   invoices.converted_from  -> someone else's invoice
--   expenses.invoice_id      -> someone else's invoice
-- invoice_payments already closed this for its own invoice_id
-- (20260924000000_invoice_payments_policy_ownership.sql).
--
-- This adds a BEFORE INSERT/UPDATE trigger on invoices and expenses that
-- raises when the referenced row's user_id differs from NEW.user_id.
--
--   * NULL stays allowed (client_id, converted_from and invoice_id are all
--     nullable; set null on parent delete must keep working).
--   * A parent id that does not exist is left to the FK, which raises 23503.
--   * The cross-owner error uses the same SQLSTATE (23503) and a generic
--     message, so a caller cannot tell "not yours" from "does not exist".
--   * SECURITY DEFINER is required: with the caller's RLS applied, a
--     cross-owner parent is invisible and the lookup would find nothing.
--     search_path is pinned empty and EXECUTE is revoked from clients; a
--     trigger function is invoked by the table owner, never called directly.
--   * It applies to every role, service role included. The service-role
--     writers (estimate duplicate, Plaid review, recurring cron) all write
--     same-owner parents, so they pass. It is a data-integrity invariant, not a
--     client-only restriction, so it is deliberately not skipped for them.
--   * On UPDATE it runs only when the column (or user_id) is in the SET list
--     and its value changed, so the app's ordinary draft saves, which never
--     touch these columns, pay nothing.
--
-- Not covered here (out of scope, same shape of gap): vault_documents.invoice_id
-- and invoice_attachments.invoice_id.
--
-- Additive: no existing column or constraint changes. A pre-check on prod and
-- the test branch found 0 existing cross-owner rows, so nothing is stranded.
-- Idempotent: create-or-replace function, drop-then-create triggers.

create or replace function public.enforce_parent_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_table_name = 'invoices' then
    if new.client_id is not null
       and (tg_op = 'INSERT'
            or new.client_id is distinct from old.client_id
            or new.user_id is distinct from old.user_id) then
      select c.user_id into v_owner from public.clients c where c.id = new.client_id;
      if found and v_owner is distinct from new.user_id then
        raise exception 'Referenced client not found'
          using errcode = 'foreign_key_violation';
      end if;
    end if;

    if new.converted_from is not null
       and (tg_op = 'INSERT'
            or new.converted_from is distinct from old.converted_from
            or new.user_id is distinct from old.user_id) then
      select i.user_id into v_owner from public.invoices i where i.id = new.converted_from;
      if found and v_owner is distinct from new.user_id then
        raise exception 'Referenced document not found'
          using errcode = 'foreign_key_violation';
      end if;
    end if;

  elsif tg_table_name = 'expenses' then
    if new.invoice_id is not null
       and (tg_op = 'INSERT'
            or new.invoice_id is distinct from old.invoice_id
            or new.user_id is distinct from old.user_id) then
      select i.user_id into v_owner from public.invoices i where i.id = new.invoice_id;
      if found and v_owner is distinct from new.user_id then
        raise exception 'Referenced document not found'
          using errcode = 'foreign_key_violation';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- Trigger functions are invoked by the table owner; clients never need EXECUTE.
revoke execute on function public.enforce_parent_ownership()
  from public, anon, authenticated;

drop trigger if exists enforce_parent_ownership on public.invoices;
create trigger enforce_parent_ownership
  before insert or update of client_id, converted_from, user_id on public.invoices
  for each row
  execute function public.enforce_parent_ownership();

drop trigger if exists enforce_parent_ownership on public.expenses;
create trigger enforce_parent_ownership
  before insert or update of invoice_id, user_id on public.expenses
  for each row
  execute function public.enforce_parent_ownership();
