-- ═══════════════════════════════════════════════════════════════
-- 003 — Relax profiles.website_url constraint
-- Users type bare domains like "vtcprojects.com" — that IS the
-- desired display format on invoices. Only cap the length.
-- Run in Supabase SQL Editor (project: bitfmmffnigxjjyxoxfr).
-- Idempotent: drop-if-exists then re-add (this migration REPLACES the
-- 001 definition, so drop-first is the intended semantics).
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  drop constraint if exists profiles_website_url_check;

alter table public.profiles
  add constraint profiles_website_url_check
  check (website_url is null or char_length(website_url) <= 200);
