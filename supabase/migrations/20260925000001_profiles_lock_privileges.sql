-- ═══════════════════════════════════════════════════════════════
-- profiles: re-lock table privileges (P0-1 regression) and close INSERT/DELETE.
--
-- FOUND LIVE 2026-09-25: authenticated holds TABLE-level UPDATE on profiles
-- again (so access_tier and every stripe_* column are updatable), plus INSERT,
-- DELETE (and, by Supabase's default ALL grant, TRUNCATE/REFERENCES/TRIGGER/MAINTAIN).
-- 20260723130946 only ever revoked UPDATE. With "own profile" FOR ALL, a user
-- could DELETE their row and re-INSERT it with access_tier='founder' or
-- stripe_charges_enabled=true. No migration in this repo re-grants table
-- UPDATE; relacl shows grantor postgres, i.e. a manual SQL Editor grant.
--
-- Shape (same lesson as 20260723130946): Supabase's table-level grant covers
-- every column regardless of column-level REVOKEs, so revoke at TABLE level,
-- then grant back per-column. Revoking table UPDATE also drops the existing
-- column-level UPDATE grants, so the full safe list is re-granted here.
--
-- Legit writers after this migration:
--   * Settings save()         → UPDATE on the granted columns below
--   * Onboarding upsert       → INSERT ... ON CONFLICT (id) DO UPDATE; needs
--     (onboarding/page.tsx:94)  INSERT on its 9 payload columns and UPDATE on
--                               the same 9 (id is in the SET list — see
--                               20260724020642). There is NO signup trigger;
--                               this upsert is the only way a profile row is
--                               created, so INSERT is re-granted, column-limited.
--   * /api/zelle clear        → UPDATE zelle_info_enc
--   * Stripe webhooks, /api/connect/*, trial-reminders → service role (bypasses grants)
--   * redeem_grant / redeem_referral / next_invoice_no / set_referral_code /
--     set_zelle → SECURITY DEFINER (run as owner)
--   * Account deletion        → service role auth.admin.deleteUser, cascades
--                               auth.users → profiles. No client DELETE path
--                               exists, so DELETE is NOT re-granted.
--
-- NOT insertable or updatable by authenticated (defaults apply on INSERT):
--   access_tier, subscription_status, stripe_customer_id, current_period_end,
--   trial_ends_at, trial_reminder_sent_at, role, granted_via, referred_by,
--   referral_code, next_invoice_number, stripe_account_id,
--   stripe_charges_enabled, stripe_details_submitted, stripe_payouts_enabled,
--   created_at.
--
-- SELECT is untouched (RLS still limits it to the caller's own row).
-- Idempotent: revokes and grants are both safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- 1. Strip every write-class privilege at TABLE level. REFERENCES, TRIGGER and
--    MAINTAIN (Postgres 17: VACUUM/ANALYZE/REINDEX/REFRESH/CLUSTER/LOCK — shown
--    as 'm' in relacl on both roles) are included too: Supabase's default ALL
--    grant carries them, no client needs them, and removing them costs nothing.
revoke insert, update, delete, truncate, references, trigger, maintain
  on public.profiles from anon, authenticated;

-- 2. UPDATE back on exactly the safe list: the 12 columns from
--    20260723130946, id (20260724020642), venmo_username (20260901120000),
--    and card_payments_enabled (20260925000000).
grant update (
  id,
  business_name,
  trade_type,
  website_url,
  slogan,
  logo_url,
  brand_colors,
  background_color,
  invoice_template,
  paypal_me,
  cashapp_tag,
  venmo_username,
  zelle_info_enc,
  card_payments_enabled,
  updated_at
) on public.profiles to authenticated;

-- 3. INSERT back on only the onboarding upsert's payload columns. Every
--    privileged column is left to its default ('free', false, null, 1, …).
--    RLS WITH CHECK (auth.uid() = id) still pins the row to the caller, and
--    the primary key allows one row per user.
grant insert (
  id,
  business_name,
  trade_type,
  website_url,
  slogan,
  logo_url,
  brand_colors,
  background_color,
  invoice_template
) on public.profiles to authenticated;

-- 4. No DELETE / TRUNCATE grant back, to anyone.

-- ── Verification — run after applying ─────────────────────────
--
-- A. Table-level write privileges: expect ALL false for both roles.
-- select r.role,
--   has_table_privilege(r.role, 'public.profiles', 'UPDATE')     as tbl_update,
--   has_table_privilege(r.role, 'public.profiles', 'INSERT')     as tbl_insert,
--   has_table_privilege(r.role, 'public.profiles', 'DELETE')     as tbl_delete,
--   has_table_privilege(r.role, 'public.profiles', 'TRUNCATE')   as tbl_truncate,
--   has_table_privilege(r.role, 'public.profiles', 'REFERENCES') as tbl_references,
--   has_table_privilege(r.role, 'public.profiles', 'TRIGGER')    as tbl_trigger,
--   has_table_privilege(r.role, 'public.profiles', 'MAINTAIN')   as tbl_maintain
-- from (values ('anon'), ('authenticated')) r(role);
--
--    NOTE: has_table_privilege(..., 'UPDATE'/'INSERT') is TRUE if the role
--    has the privilege on ANY column. Use query B for the per-column truth;
--    query C for the table-level ACL itself.
--
-- B. Per-column UPDATE / INSERT for authenticated. Expect:
--    privileged = true  → can_update false, can_insert false
--    safe columns       → can_update true
--    onboarding columns → can_insert true
-- select c.column_name,
--   c.column_name in ('access_tier','subscription_status','stripe_customer_id',
--     'current_period_end','trial_ends_at','trial_reminder_sent_at','role',
--     'granted_via','referred_by','referral_code','next_invoice_number',
--     'stripe_account_id','stripe_charges_enabled','stripe_details_submitted',
--     'stripe_payouts_enabled','created_at') as privileged,
--   has_column_privilege('authenticated', 'public.profiles', c.column_name, 'UPDATE') as can_update,
--   has_column_privilege('authenticated', 'public.profiles', c.column_name, 'INSERT') as can_insert
-- from information_schema.columns c
-- where c.table_schema = 'public' and c.table_name = 'profiles'
-- order by privileged desc, c.column_name;
--
-- C. The table ACL itself: expect authenticated to show only 'r' (SELECT)
--    at table level (e.g. authenticated=r/postgres), and anon only 'r' if at all.
-- select relacl from pg_class where oid = 'public.profiles'::regclass;
