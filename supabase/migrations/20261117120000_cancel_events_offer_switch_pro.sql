-- ═══════════════════════════════════════════════════════════════
-- Tiers batch 2 — the "switch to Pro" retention offer on cancel_events.
--
-- CHANGING, not additive: this replaces an existing CHECK constraint on an
-- existing column (cancel_events.kind). Per CLAUDE.md "Database migrations"
-- it may only be pushed from `main` after the merge — dry run → full SQL →
-- the founder's explicit yes → db push → privilege check. It is NOT applied.
--
-- One new kind, 'offer_switch_pro': a Plus user who picks "Too expensive" on
-- the cancel screen and takes the switch to Pro (TIERS-SPEC, cancel table;
-- design/tiers 07A). Switching counts as the offer taken, so the same route
-- that logs a discount or a pause logs this one — one 12-month window for all
-- three. Existing rows are unaffected: every kind already stored is still
-- allowed, so the ADD CONSTRAINT validates without touching data.
--
-- No column, table, policy or grant changes. No app privilege changes; the
-- table-level ACL from 20261016200000 still applies (clients SELECT only).
-- ═══════════════════════════════════════════════════════════════

alter table public.cancel_events drop constraint if exists cancel_events_kind_chk;
alter table public.cancel_events add constraint cancel_events_kind_chk
  check (kind in ('cancel','resume','offer_discount','offer_pause','offer_switch_pro'));

-- ── Verification — run after applying ─────────────────────────
--
-- A. The new kind is allowed and the old ones still are (expect one row):
-- select pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.cancel_events'::regclass
--   and conname = 'cancel_events_kind_chk';
--
-- B. Nothing changed for clients: authenticated=r/postgres, no anon entry.
-- select relacl from pg_class where oid = 'public.cancel_events'::regclass;
