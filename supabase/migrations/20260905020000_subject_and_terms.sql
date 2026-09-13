-- ═══════════════════════════════════════════════════════════════
-- Document subject, rate_basis_label, and terms columns
-- ═══════════════════════════════════════════════════════════════

alter table public.invoices
  add column if not exists subject text,
  add column if not exists rate_basis_label text,
  add column if not exists terms text check (terms is null or char_length(terms) <= 400);
