-- ═══════════════════════════════════════════════════════════════
-- Invoice render snapshot
--
-- Snapshot the RENDER INPUTS (template, theme colors, business identity,
-- payment handles) onto the INVOICE row at finalize time, instead of
-- reading them live from profiles at render. Same class of problem — and
-- same fix — as 20260812120000 (invoice_contact_snapshot): an invoice is a
-- record of what was actually sent, so changing the invoice style, brand
-- colors, business name, logo, tagline, website, or a payment handle in
-- Settings later must NOT retroactively rewrite past invoices.
--
-- Scope decisions (see the fix branch):
--   • RAW inputs are stored (brand_colors + background_color), not a derived
--     theme — buildTheme() runs at render, so a future algorithm change
--     doesn't leave old invoices frozen against an old computation.
--   • Zelle is deliberately NOT snapshotted: it lives encrypted in one place
--     (profiles.zelle_info_enc) and is read live at render. Copying it onto
--     every invoice row would spread the ciphertext/plaintext. Accepted drift.
--   • logo_url stores the URL only. Truly freezing the asset (copying the
--     file so a later replace/remove can't 404 the old invoice) is correct
--     but out of scope — known limitation.
--
-- Backfill: NONE. Existing rows stay NULL and the app falls back to the live
-- profile per-field when a snapshot value is null (option b). Backfilling from
-- the current profile would fabricate history for invoices sent before a change.
--
-- All columns nullable. CHECKs mirror the CURRENT profiles constraints exactly
-- (incl. 003's length-only website cap) so any valid profile value snapshots
-- without rejection, while keeping length as the final backstop (SECURITY.md).
--
-- Grants: unlike profiles (20260723130946, which revoked table-level UPDATE and
-- grants it back per-column), invoices has NO per-column UPDATE revoke — the
-- app already updates invoices as the authenticated owner (status, due_date,
-- line_items) under the "own invoices" RLS policy. Table-level grants therefore
-- cover these new columns; no per-column grant-back is needed.
--
-- Idempotent: add-column-if-not-exists (inline CHECKs come with a fresh add).
-- ═══════════════════════════════════════════════════════════════

alter table public.invoices
  add column if not exists template text
    check (template is null or template in ('classic','sidebar','industrial','friendly')),
  add column if not exists brand_colors text[],
  add column if not exists background_color text,
  add column if not exists business_name text
    check (business_name is null or char_length(business_name) between 1 and 120),
  add column if not exists logo_url text,
  add column if not exists website_url text
    check (website_url is null or char_length(website_url) <= 200),
  add column if not exists slogan text
    check (slogan is null or char_length(slogan) <= 140),
  add column if not exists cashapp_tag text
    check (cashapp_tag is null or char_length(cashapp_tag) <= 60),
  add column if not exists paypal_me text
    check (paypal_me is null or char_length(paypal_me) <= 120),
  add column if not exists venmo_username text
    check (venmo_username is null or char_length(venmo_username) <= 60);
