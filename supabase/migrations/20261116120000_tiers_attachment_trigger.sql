-- ═══════════════════════════════════════════════════════════════
-- Tiers phase 2, item 5a: new attachment ROWS need Plus — additive (a new
-- function and a new trigger; nothing existing is replaced).
--
-- The gate is on INSERT only, which is safe because reordering no longer
-- inserts (see reorder_invoice_attachments in 20261116120100): a reorder is an
-- UPDATE of positions, a delete still deletes, and every row already stored
-- keeps reading, printing and reordering for a lapsed user.
--
-- tiers_enforced() false → no change for anyone. True → is_plus() decides;
-- a founder and a Plus subscriber pass, everyone else is refused with
-- PLAN_ATTACHMENTS. No storage_path exception: a row is a new attachment.
--
-- Fires for every role, including the service-role confirm path
-- (add_estimate_attachment), which also checks is_plus itself and returns a
-- typed code so the route can answer plan_required rather than a 500.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.enforce_plus_attachments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tiers_enforced() or public.is_plus(NEW.user_id) then
    return NEW;
  end if;

  raise exception 'Attachments need the Plus plan'
    using errcode = 'P0001', hint = 'PLAN_ATTACHMENTS';
end $$;

drop trigger if exists enforce_plus_attachments on public.invoice_attachments;
create trigger enforce_plus_attachments
  before insert on public.invoice_attachments
  for each row execute function public.enforce_plus_attachments();

revoke execute on function public.enforce_plus_attachments() from public, anon, authenticated;
