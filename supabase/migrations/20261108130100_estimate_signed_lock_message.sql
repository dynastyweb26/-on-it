-- ═══════════════════════════════════════════════════════════════════════════
-- alive layer · phase 4A · item 18 — the signed-estimate lock message
--
-- guard_locked_estimate_edits already refuses a content write on a signed or
-- converted estimate, but its message is "A signed or converted estimate cannot
-- be changed". Edit-in-place needs the signed case to say exactly:
--
--     This estimate is signed and locked.
--
-- Body is the live function from 20261029000000_lock_terms_after_send.sql,
-- unchanged (same diff list: money, notes, billed party, client_email, title,
-- terms). The converted test is resolved once into v_converted, and only the
-- raise is split:
--
--   * signed (approved_at set)      → "This estimate is signed and locked."
--   * converted, never signed       → the existing message, untouched. Converting
--                                     is a different state with its own next step
--                                     ("Revise the invoice instead"), and item 18
--                                     names only the signed copy.
--
-- Not changed: guard_locked_estimate_attachments (its own copy, "A signed or
-- converted estimate cannot change attachments"), the 42501 errcode, the hint,
-- and every function this one does not touch. A converted-and-signed estimate
-- takes the signed branch: it is locked either way.
--
-- Rollback: re-run the create-or-replace body from
-- 20261029000000_lock_terms_after_send.sql (both raises back to the single
-- 'A signed or converted estimate cannot be changed').
--
-- Idempotent: create-or-replace; the trigger is not recreated, since the WHEN
-- clause and function name are unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.guard_locked_estimate_edits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_converted boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return NEW;
  end if;
  if OLD.kind <> 'quote' then
    return NEW;
  end if;

  -- Resolved once: a live row converted from this estimate means it is locked
  -- even if it was never signed.
  select exists (
    select 1 from public.invoices i
     where i.converted_from = OLD.id
       and i.deleted_at is null
  ) into v_converted;

  if OLD.approved_at is null and not v_converted then
    return NEW;
  end if;

  if NEW.line_items is distinct from OLD.line_items
     or NEW.subtotal is distinct from OLD.subtotal
     or NEW.tax_rate is distinct from OLD.tax_rate
     or NEW.tax_amount is distinct from OLD.tax_amount
     or NEW.total is distinct from OLD.total
     or NEW.notes is distinct from OLD.notes
     or NEW.client_name is distinct from OLD.client_name
     or NEW.client_address is distinct from OLD.client_address
     or NEW.client_phone is distinct from OLD.client_phone
     or NEW.client_email is distinct from OLD.client_email
     or NEW.title is distinct from OLD.title
     or NEW.terms is distinct from OLD.terms
  then
    -- Signed: the client's signature is on this content. Copy is fixed by
    -- item 18, so the page can show it verbatim.
    if OLD.approved_at is not null then
      raise exception 'This estimate is signed and locked.'
        using errcode = 'insufficient_privilege',
              hint = 'Create a new estimate, or revise the invoice if this one was converted.';
    end if;

    -- Converted but never signed: unchanged from today.
    raise exception 'A signed or converted estimate cannot be changed'
      using errcode = 'insufficient_privilege',
            hint = 'Create a new estimate instead of editing this one.';
  end if;
  return NEW;
end $$;

revoke execute on function public.guard_locked_estimate_edits()
  from public, anon, authenticated;

-- Verification after applying:
--   -- As the owner, on a signed estimate:
--   update public.invoices set notes = notes || 'x' where id = '<signed id>';
--   -- ERROR: This estimate is signed and locked.  (SQLSTATE 42501)
--   -- On a converted-but-unsigned estimate: the old message, unchanged.
--   -- On a sent, unsigned estimate: the update succeeds.
--   select pg_get_functiondef('public.guard_locked_estimate_edits()'::regprocedure)
--     like '%This estimate is signed and locked.%';  -- true
