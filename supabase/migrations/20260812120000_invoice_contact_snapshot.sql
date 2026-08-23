-- ═══════════════════════════════════════════════════════════════
-- Invoice contact snapshot
--
-- Snapshot the client's address/phone onto the INVOICE row at finalize
-- time, instead of joining the clients table at render. An invoice is a
-- record of what was actually sent — updating a client's address later
-- must NOT retroactively rewrite the contact printed on past invoices.
--
-- Caps mirror the clients table (address <= 300, phone <= 30) so the SQL
-- CHECK stays the final length backstop (see SECURITY.md). RLS is already
-- enforced by the existing owner-only row policies on invoices; new
-- columns need no additional policy.
-- ═══════════════════════════════════════════════════════════════

alter table public.invoices
  add column if not exists client_address text
    check (client_address is null or char_length(client_address) <= 300),
  add column if not exists client_phone text
    check (client_phone is null or char_length(client_phone) <= 30);
