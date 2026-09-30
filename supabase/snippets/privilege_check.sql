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
--    Safe (user preference) columns added by 20260930000004 — expect
--    privileged false, can_update true, can_insert false:
--      timezone, notify_draft_nudges
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

-- ═══ Public-invoice RPCs (pay page + card checkout — 20260926100000) ═══

-- H. Neither RPC is callable by anon/authenticated (expect every can_execute
--    false). get_public_invoice_checkout returns the seller's
--    stripe_account_id, so it must stay service_role only.
select fn.f as function, ro.r as role,
  has_function_privilege(ro.r, fn.f, 'execute') as can_execute
from (values ('public.get_public_invoice(text, text)'),
             ('public.get_public_invoice_checkout(text)')) fn(f)
cross join (values ('anon'), ('authenticated')) ro(r);

-- I. Both SECURITY DEFINER with an empty search_path (expect prosecdef true,
--    proconfig {search_path=""}), and the public one exposes no account id
--    (expect result to end with "card_available boolean" and contain no
--    "stripe_account_id").
select proname, prosecdef, proconfig,
  pg_get_function_result(oid) as result
from pg_proc
where proname in ('get_public_invoice', 'get_public_invoice_checkout')
  and pronamespace = 'public'::regnamespace;

-- ═══ push_subscriptions + notification_log (push phase 1 — 20260929000000) ═══

-- J. push_subscriptions policies. Expect exactly three, and NO FOR ALL
--    "own subscriptions":
--      own subscriptions delete  DELETE  qual: (auth.uid() = user_id)
--      own subscriptions insert  INSERT  with_check: (auth.uid() = user_id)
--      own subscriptions select  SELECT  qual: (auth.uid() = user_id)
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'push_subscriptions'
order by policyname;

-- K. Table privileges. Expect:
--      notification_log    anon           sel f, ins f, upd f, del f, trunc f
--      notification_log    authenticated  sel f, ins f, upd f, del f, trunc f
--      push_subscriptions  anon           sel f, ins f, upd f, del f, trunc f
--      push_subscriptions  authenticated  sel t, ins t, upd f, del t, trunc f
select c.relname as table_name, r.role,
  has_table_privilege(r.role, c.oid, 'SELECT')   as sel,
  has_table_privilege(r.role, c.oid, 'INSERT')   as ins,
  has_table_privilege(r.role, c.oid, 'UPDATE')   as upd,
  has_table_privilege(r.role, c.oid, 'DELETE')   as del,
  has_table_privilege(r.role, c.oid, 'TRUNCATE') as trunc
from pg_class c
cross join (values ('anon'), ('authenticated')) r(role)
where c.oid in ('public.push_subscriptions'::regclass, 'public.notification_log'::regclass)
order by c.relname, r.role;

--    And notification_log is RLS-on with zero policies (service role only).
--    Expect: relrowsecurity true, policies 0.
select c.relname, c.relrowsecurity,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
where c.oid = 'public.notification_log'::regclass;

-- ═══ Push phase 2 (invoice viewed + draft nudges — 20260930000003/000004) ═══

-- L1. mark_invoice_viewed is service_role only. Expect can_execute false for
--     both rows. It returns the invoice owner's id, so it must never be
--     callable by anon/authenticated.
select ro.r as role,
  has_function_privilege(ro.r, 'public.mark_invoice_viewed(text, uuid)', 'execute') as can_execute
from (values ('anon'), ('authenticated')) ro(r);

-- L2. SECURITY DEFINER with an empty search_path. Expect prosecdef true,
--     proconfig {search_path=""}, and result
--     "TABLE(invoice_id uuid, user_id uuid, invoice_number integer, client_name text)".
select proname, prosecdef, proconfig, pg_get_function_result(oid) as result
from pg_proc
where proname = 'mark_invoice_viewed' and pronamespace = 'public'::regnamespace;

-- L3. The new columns exist with the right types. Expect exactly three rows:
--       invoices  viewed_at            timestamp with time zone  YES
--       profiles  notify_draft_nudges  boolean                   NO
--       profiles  timezone             text                      YES
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'invoices' and column_name = 'viewed_at')
    or (table_name = 'profiles' and column_name in ('timezone', 'notify_draft_nudges')))
order by table_name, column_name;

-- L4. notification_log accepts the new event types. Expect the check to list
--     payment_received, connect_problem, invoice_viewed, draft_unsent, test.
--     (K above must still show notification_log with no anon/authenticated
--     privileges, and 0 policies.)
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.notification_log'::regclass
  and conname = 'notification_log_type_chk';

-- ═══ reconcile_invoice_from_ledger (draft payment status — 20260930000002) ═══

-- M1. Internal helper: no client role can call it (expect every can_execute
--     false).
select ro.r as role,
  has_function_privilege(ro.r, 'public.reconcile_invoice_from_ledger(uuid)', 'execute') as can_execute
from (values ('public'), ('anon'), ('authenticated')) ro(r);

-- M2. SECURITY DEFINER with an empty search_path (expect prosecdef true,
--     proconfig {search_path=""}).
select proname, prosecdef, proconfig
from pg_proc
where proname = 'reconcile_invoice_from_ledger'
  and pronamespace = 'public'::regnamespace;

-- M3. No live draft invoice holds payments, and no 'paid' invoice is
--     underpaid. Expect 0 / 0.
select
  count(*) filter (where status = 'draft' and kind = 'invoice' and deleted_at is null
                     and amount_paid > 0)                         as paid_drafts_left,
  count(*) filter (where status = 'paid' and amount_paid < total) as paid_but_underpaid
from public.invoices;
