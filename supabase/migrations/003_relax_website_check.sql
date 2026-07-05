-- ═══════════════════════════════════════════════════════════════
-- 003 — Relax profiles.website_url constraint
-- Users type bare domains like "vtcprojects.com" — that IS the
-- desired display format on invoices. Only cap the length.
-- Run in Supabase SQL Editor (project: bitfmmffnigxjjyxoxfr).
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  drop constraint profiles_website_url_check;

alter table public.profiles
  add constraint profiles_website_url_check
  check (website_url is null or char_length(website_url) <= 200);
