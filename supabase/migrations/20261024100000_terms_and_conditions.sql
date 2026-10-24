-- ═══════════════════════════════════════════════════════════════
-- Terms and conditions, written once, printed on every estimate and invoice.
--
-- ADDITIVE ONLY (nullable columns, checks on those new columns, one new
-- function). Safe to push from a feature branch: the code on main ignores
-- columns it does not know about.
--
--   profiles.terms                      the owner's current terms (<= 3000 chars)
--   profiles.terms_prompt_count         times the "add your terms" tip was shown
--                                       (NULL = never; the app stops at 2)
--   profiles.terms_prompt_dismissed_at  last "Not now" (stored here, not in the
--                                       browser, so it holds across devices)
--   invoices.terms                      snapshot taken at first send, so editing
--                                       Settings later never rewrites a sent
--                                       document. Written only by the send routes
--                                       (service role) on the draft -> sent step.
--
-- profiles columns follow the business_phone pattern: authenticated holds
-- column-level UPDATE only, no INSERT (onboarding does not set them).
--
-- get_public_invoice_terms is a NEW service-role RPC, separate from
-- get_public_invoice() so that function's signature stays untouched (changing
-- it would be a drop + create, a main-only migration). The pay page calls both.
-- It returns the snapshot only for a non-draft, non-deleted invoice (never a
-- quote: estimates have their own loader), so a draft's terms are never public.
-- SECURITY DEFINER, search_path '', EXECUTE for service_role only.
-- Verify after applying: npm run db:privcheck - the AX rows must PASS.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists terms text,
  add column if not exists terms_prompt_count smallint,
  add column if not exists terms_prompt_dismissed_at timestamptz;

alter table public.profiles drop constraint if exists profiles_terms_len_chk;
alter table public.profiles add constraint profiles_terms_len_chk
  check (terms is null or char_length(terms) <= 3000);

alter table public.profiles drop constraint if exists profiles_terms_prompt_count_chk;
alter table public.profiles add constraint profiles_terms_prompt_count_chk
  check (terms_prompt_count is null or terms_prompt_count between 0 and 10);

comment on column public.profiles.terms is
  'Terms and conditions printed on every estimate and invoice. Snapshotted onto invoices.terms at first send.';
comment on column public.profiles.terms_prompt_count is
  'How many times the add-your-terms tip card was shown; NULL = never.';
comment on column public.profiles.terms_prompt_dismissed_at is
  'When the owner last tapped Not now on the add-your-terms tip card.';

grant update (terms) on public.profiles to authenticated;
grant update (terms_prompt_count) on public.profiles to authenticated;
grant update (terms_prompt_dismissed_at) on public.profiles to authenticated;

alter table public.invoices
  add column if not exists terms text;

alter table public.invoices drop constraint if exists invoices_terms_len_chk;
alter table public.invoices add constraint invoices_terms_len_chk
  check (terms is null or char_length(terms) <= 3000);

comment on column public.invoices.terms is
  'Terms and conditions as they were when this document was first sent. Written by the send routes (service role).';

create or replace function public.get_public_invoice_terms(p_token text)
returns table (terms text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.terms
  from public.invoices i
  where i.public_token = p_token
    and i.kind = 'invoice'
    and i.status is distinct from 'draft'
    and i.deleted_at is null
    and i.terms is not null;
$$;

revoke execute on function public.get_public_invoice_terms(text)
  from public, anon, authenticated;
grant execute on function public.get_public_invoice_terms(text)
  to service_role;

-- ── Verification - run after applying ─────────────────────────
-- select table_name, column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and ((table_name = 'profiles' and column_name in ('terms', 'terms_prompt_count', 'terms_prompt_dismissed_at'))
--     or (table_name = 'invoices' and column_name = 'terms'));
-- Expect 4 rows, all nullable. Then: npm run db:privcheck.
