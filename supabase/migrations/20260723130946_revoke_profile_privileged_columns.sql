-- P0-1 fix — stop authenticated users from self-updating privileged profile
-- columns. The "own profile" RLS policy is FOR ALL with no column protection,
-- so a user could `PATCH /rest/v1/profiles?id=eq.<self>` with
-- {"access_tier":"founder"} and bypass the entire paywall.
--
-- IMPORTANT — why this is not a plain `REVOKE UPDATE (cols)`:
-- Supabase grants TABLE-level UPDATE to `authenticated`, which covers every
-- column regardless of any column-level REVOKE. A column-level revoke alone
-- would run clean but leave the columns updatable (a false fix). The correct
-- shape is: revoke the table-level UPDATE, then grant column-level UPDATE back
-- on ONLY the non-privileged columns.
--
-- Legit writers of the privileged columns are unaffected:
--   * Stripe webhook            -> service-role client (bypasses column grants)
--   * redeem_grant/redeem_referral/next_invoice_no/set_referral_code
--                               -> SECURITY DEFINER (run as owner, bypass grants)
-- Session-client writes (Settings, onboarding, /api/zelle clear) touch only the
-- columns granted back below - audited exhaustively:
--   Settings   : business_name, website_url, slogan, cashapp_tag, paypal_me,
--                invoice_template, brand_colors, background_color, logo_url
--   Onboarding : + trade_type
--   Zelle clear: zelle_info_enc
-- Privileged (NOT granted back): access_tier, subscription_status,
--   stripe_customer_id, current_period_end, trial_ends_at, role, granted_via,
--   referred_by, referral_code, next_invoice_number.
--
-- Idempotent: revoke + grant are both safe to re-run.

-- 1. Remove blanket UPDATE (and the never-legitimate anon UPDATE entirely).
revoke update on public.profiles from anon, authenticated;

-- 2. Grant UPDATE back on only the non-privileged, user-editable columns.
--    (anon is intentionally NOT granted any UPDATE - it can't pass the
--    own-profile RLS check anyway.)
grant update (
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
  zelle_info_enc,
  updated_at
) on public.profiles to authenticated;
