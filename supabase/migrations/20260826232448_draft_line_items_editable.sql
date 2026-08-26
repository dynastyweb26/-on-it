-- ═══════════════════════════════════════════════════════════════
-- Draft line items are editable; sent documents stay locked.
--
-- 20260826190105 added lock_line_items, a BEFORE UPDATE trigger that pins
-- line_items to its stored value on every update. That was too broad: the
-- lock exists to (1) keep original_description from being rewritten after the
-- fact and (2) stop a SENT invoice's content changing silently. Neither applies
-- while the document is still a draft — a draft is meant to be corrected before
-- it goes out, and the detail page now needs to write edited line items back.
--
-- Carve-out: when the EXISTING row is a draft (OLD.status = 'draft'), let the
-- update's line_items through. For any other status, pin as before. Keyed on
-- OLD.status (the stored status), so:
--   * draft → the edit is allowed;
--   * the draft→sent transition still passes (that update carries no line_items,
--     so NEW.line_items already equals OLD.line_items — nothing changes);
--   * once stored as sent/paid/overdue/void, OLD.status is no longer 'draft'
--     and line_items is immutable again, original_description included.
--
-- Replaces the function in place (same trigger); no schema change, no backfill.
-- Idempotent: create-or-replace.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.lock_line_items()
returns trigger
language plpgsql
as $$
begin
  -- Editable while a draft; pinned once the document leaves draft.
  if OLD.status = 'draft' then
    return NEW;
  end if;
  NEW.line_items := OLD.line_items;
  return NEW;
end $$;

-- Trigger unchanged (still from 20260826190105); only the function body moved.
