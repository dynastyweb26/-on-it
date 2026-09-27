-- ═══════════════════════════════════════════════════════════════
-- Privilege check — run in the Supabase SQL Editor before deploying ANY
-- branch that touches the database (see CLAUDE.md "Pre-deploy checklist").
--
-- Why: RLS limits WHICH ROWS a role can touch; table/column privileges limit
-- WHAT it can write. A stray `grant ... on public.profiles` (the 2026-09
-- regression was a manual SQL Editor grant, grantor postgres) silently
-- re-opens privileged columns (access_tier, stripe_*) even though every
-- migration is correct. Migrations can't catch that — only this check can.
--
-- Expected results are noted on each query. Anything else: stop, don't deploy.
-- When a migration adds a profiles column, add it to the privileged or safe
-- list below in the same commit.
-- ═══════════════════════════════════════════════════════════════

-- A. Table-level write privileges on profiles.
--    Expect: every column false for both roles.
--    (has_table_privilege for UPDATE/INSERT is true if ANY column is granted,
--    so UPDATE/INSERT are checked per-column in B, not here.)
select r.role,
  has_table_privilege(r.role, 'public.profiles', 'DELETE')     as tbl_delete,
  has_table_privilege(r.role, 'public.profiles', 'TRUNCATE')   as tbl_truncate,
  has_table_privilege(r.role, 'public.profiles', 'REFERENCES') as tbl_references,
  has_table_privilege(r.role, 'public.profiles', 'TRIGGER')    as tbl_trigger,
  has_table_privilege(r.role, 'public.profiles', 'MAINTAIN')   as tbl_maintain
from (values ('anon'), ('authenticated')) r(role);

-- B. Per-column UPDATE / INSERT on profiles for authenticated.
--    Expect:
--      privileged = true            → can_update false, can_insert false
--      privileged = false           → can_update true
--      onboarding columns only      → can_insert true
--        (id, business_name, trade_type, website_url, slogan, logo_url,
--         brand_colors, background_color, invoice_template)
--    A new column that's on neither list shows as privileged = false with
--    can_update false — decide which list it belongs on.
select c.column_name,
  c.column_name in ('access_tier','subscription_status','stripe_customer_id',
    'current_period_end','trial_ends_at','trial_reminder_sent_at','role',
    'granted_via','referred_by','referral_code','next_invoice_number',
    'stripe_account_id','stripe_charges_enabled','stripe_details_submitted',
    'stripe_payouts_enabled','created_at') as privileged,
  has_column_privilege('authenticated', 'public.profiles', c.column_name, 'UPDATE') as can_update,
  has_column_privilege('authenticated', 'public.profiles', c.column_name, 'INSERT') as can_insert
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'profiles'
order by privileged desc, c.column_name;

-- C. The raw table ACL on profiles.
--    Expect: authenticated and anon carry only 'r' (SELECT) at table level,
--    e.g. authenticated=r/postgres. Any of a/w/d/D/x/t/m for them = a table-
--    level write grant came back; the text after '/' names the grantor.
select relacl from pg_class where oid = 'public.profiles'::regclass;

-- D. Every public table: which write privileges anon/authenticated hold at
--    TABLE level. Not all are wrong (RLS-protected owner tables like invoices
--    legitimately keep insert/update), but TRUNCATE bypasses RLS entirely and
--    should never appear. Review any row with truncate = true.
select c.relname as table_name, r.role,
  has_table_privilege(r.role, c.oid, 'INSERT')   as ins,
  has_table_privilege(r.role, c.oid, 'UPDATE')   as upd,
  has_table_privilege(r.role, c.oid, 'DELETE')   as del,
  has_table_privilege(r.role, c.oid, 'TRUNCATE') as truncate
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated')) r(role)
where n.nspname = 'public' and c.relkind = 'r'
order by truncate desc, c.relname, r.role;

-- ═══ invoice_payments (Stripe-sourced rows locked — 20260926000000) ═══
-- The lock on Stripe-sourced ledger rows is RLS, not column grants:
-- authenticated keeps table-level INSERT/UPDATE/DELETE on invoice_payments
-- (owner-scoped by policy), and the policies refuse any row whose
-- stripe_checkout_session_id (or legacy stripe_event_id) is set.

-- E. Policies. Expect exactly these four, and NO FOR ALL "own invoice payments":
--      own invoice payments select  SELECT  qual: (auth.uid() = user_id)
--      own invoice payments insert  INSERT  with_check: uid = user_id AND
--        stripe_checkout_session_id IS NULL AND stripe_event_id IS NULL AND
--        EXISTS (own invoice)
--      own invoice payments update  UPDATE  qual: uid = user_id AND both NULL;
--        with_check: same + EXISTS (own invoice)
--      own invoice payments delete  DELETE  qual: uid = user_id AND both NULL
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'invoice_payments'
order by policyname;

-- F. The column + its constraints. Expect a UNIQUE key on
--    stripe_checkout_session_id (the webhook's ON CONFLICT target) and
--    invoice_payments_stripe_session_chk (cs_ shape, <= 255 chars).
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.invoice_payments'::regclass
  and pg_get_constraintdef(oid) ilike '%stripe_checkout_session_id%';

-- G. Stripe-sourced rows are only ever written by the service role, so every
--    one must belong to the invoice's owner. Expect 0.
select count(*) as mismatched_stripe_rows
from public.invoice_payments p
join public.invoices i on i.id = p.invoice_id
where p.stripe_checkout_session_id is not null
  and p.user_id <> i.user_id;
