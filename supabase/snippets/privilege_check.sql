-- ═══════════════════════════════════════════════════════════════
-- Privilege check — run before deploying ANY branch that touches the
-- database (see CLAUDE.md "Database migrations").
--
--   CLI:        npm run db:privcheck   (prints PASS/FAIL, exits 1 on any FAIL)
--   SQL Editor: paste this whole file and run it — it is ONE query, so the
--               editor shows every check in a single result table.
--
-- Why: RLS limits WHICH ROWS a role can touch; table/column privileges limit
-- WHAT it can write. A stray `grant ... on public.profiles` (the 2026-09
-- regression was a manual SQL Editor grant, grantor postgres) silently
-- re-opens privileged columns (access_tier, stripe_*) even though every
-- migration is correct. Migrations can't catch that — only this check can.
--
-- Each row: check id, PASS/FAIL, what is expected, and what was found. Any
-- FAIL: stop, don't deploy. SKIP = that section's migration isn't recorded as
-- pushed yet (supabase_migrations.schema_migrations), so its objects aren't
-- expected to exist. Read-only (SELECTs only).
--
-- Maintenance: when a migration adds a profiles column, add it to the
-- privileged list (B) or — if users may write it — grant it and, if onboarding
-- inserts it, add it to the onboarding list, in the same commit. When a
-- migration adds a security-relevant object, add a row here.
-- ═══════════════════════════════════════════════════════════════

with
-- Profiles columns that users must never write (B).
privileged(col) as (values
  ('access_tier'), ('subscription_status'), ('stripe_customer_id'),
  ('current_period_end'), ('trial_ends_at'), ('trial_reminder_sent_at'), ('role'),
  ('granted_via'), ('referred_by'), ('referral_code'), ('next_invoice_number'), ('next_quote_number'),
  ('stripe_account_id'), ('stripe_charges_enabled'), ('stripe_details_submitted'),
  ('stripe_payouts_enabled'), ('created_at'),
  -- Bank transfer (20261015200000): written only via /api/bank service-role RPCs.
  ('bank_holder_name'), ('bank_name'), ('bank_routing'), ('bank_account_enc'),
  ('bank_account_last4'), ('bank_account_type'), ('bank_transfer_enabled'),
  -- Cancel flow (20261016200000): written only by the Stripe webhook and
  -- /api/subscription/* on the service role.
  ('cancel_at_period_end'), ('paused_until'), ('retention_offer_used_at')
),
-- Profiles columns onboarding may INSERT (B). Every other column: no INSERT.
onboarding(col) as (values
  ('id'), ('business_name'), ('trade_type'), ('website_url'), ('slogan'),
  ('logo_url'), ('brand_colors'), ('background_color'), ('invoice_template'),
  -- Team size (20261017100000): answered in onboarding, client-writable.
  ('team_size')
),
profile_cols as (
  select c.column_name as col,
    c.column_name in (select col from privileged) as is_priv,
    c.column_name in (select col from onboarding) as is_onb,
    has_column_privilege('authenticated', 'public.profiles', c.column_name, 'UPDATE') as can_update,
    has_column_privilege('authenticated', 'public.profiles', c.column_name, 'INSERT') as can_insert
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'profiles'
),
-- Migrations recorded by the CLI (db push). Rows for a migration that isn't
-- pushed yet report SKIP instead of failing on objects that don't exist.
applied(version) as (
  select version from supabase_migrations.schema_migrations
),
results(id, ok, expected, actual) as (

  -- A. No table-level DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on profiles.
  --    (UPDATE/INSERT are per-column, checked in B.)
  select 'A ' || r.role,
    not (has_table_privilege(r.role, 'public.profiles', 'DELETE')
      or has_table_privilege(r.role, 'public.profiles', 'TRUNCATE')
      or has_table_privilege(r.role, 'public.profiles', 'REFERENCES')
      or has_table_privilege(r.role, 'public.profiles', 'TRIGGER')
      or has_table_privilege(r.role, 'public.profiles', 'MAINTAIN')),
    'profiles: no table-level delete/truncate/references/trigger/maintain',
    concat_ws(' ',
      case when has_table_privilege(r.role, 'public.profiles', 'DELETE') then 'DELETE' end,
      case when has_table_privilege(r.role, 'public.profiles', 'TRUNCATE') then 'TRUNCATE' end,
      case when has_table_privilege(r.role, 'public.profiles', 'REFERENCES') then 'REFERENCES' end,
      case when has_table_privilege(r.role, 'public.profiles', 'TRIGGER') then 'TRIGGER' end,
      case when has_table_privilege(r.role, 'public.profiles', 'MAINTAIN') then 'MAINTAIN' end)
  from (values ('anon'), ('authenticated')) r(role)

  -- B. Per-column UPDATE / INSERT on profiles for authenticated.
  --    privileged → no update, no insert; everything else → update;
  --    insert only for the onboarding columns. A new column on neither list
  --    that isn't granted shows up here as a FAIL — decide which list.
  union all
  select 'B privileged', bool_and(not can_update and not can_insert),
    'privileged columns: no UPDATE, no INSERT',
    coalesce(string_agg(col, ', ') filter (where can_update or can_insert), '')
  from profile_cols where is_priv
  union all
  select 'B safe update', bool_and(can_update),
    'every non-privileged column: UPDATE',
    coalesce(string_agg(col, ', ') filter (where not can_update), '')
  from profile_cols where not is_priv
  union all
  select 'B insert', bool_and(can_insert = is_onb),
    'INSERT exactly on the onboarding columns',
    coalesce(string_agg(col || case when can_insert then '(+)' else '(-)' end, ', ')
      filter (where can_insert <> is_onb), '')
  from profile_cols

  -- C. Raw table ACL on profiles: anon/authenticated hold only SELECT at table
  --    level (column grants aren't in relacl). Anything else = a table-level
  --    write grant came back.
  union all
  select 'C profiles ACL',
    not exists (
      select 1 from pg_class c, aclexplode(c.relacl) a
      where c.oid = 'public.profiles'::regclass
        and a.grantee in ('anon'::regrole::oid, 'authenticated'::regrole::oid)
        and a.privilege_type <> 'SELECT'),
    'anon/authenticated: table-level SELECT only',
    coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type
                || ' (grantor ' || a.grantor::regrole::text || ')', ', ')
      from pg_class c, aclexplode(c.relacl) a
      where c.oid = 'public.profiles'::regclass
        and a.grantee in ('anon'::regrole::oid, 'authenticated'::regrole::oid)
        and a.privilege_type <> 'SELECT'), '')

  -- D. TRUNCATE bypasses RLS: no public table grants it to anon/authenticated.
  union all
  select 'D no TRUNCATE',
    not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) r(role)
      where n.nspname = 'public' and c.relkind = 'r'
        and has_table_privilege(r.role, c.oid, 'TRUNCATE')),
    'no public table: TRUNCATE for anon/authenticated',
    coalesce((select string_agg(c.relname || ':' || r.role, ', ')
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) r(role)
      where n.nspname = 'public' and c.relkind = 'r'
        and has_table_privilege(r.role, c.oid, 'TRUNCATE')), '')

  -- E. invoice_payments policies (20260926000000): exactly the four split
  --    policies, and the write ones refuse Stripe-sourced rows.
  union all
  select 'E invoice_payments policies',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'invoice_payments') = 4
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments'
      and policyname = 'own invoice payments select' and cmd = 'SELECT')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments'
      and policyname = 'own invoice payments insert' and cmd = 'INSERT'
      and with_check ilike '%stripe_checkout_session_id IS NULL%' and with_check ilike '%stripe_event_id IS NULL%')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments'
      and policyname = 'own invoice payments update' and cmd = 'UPDATE'
      and qual ilike '%stripe_checkout_session_id IS NULL%' and qual ilike '%stripe_event_id IS NULL%')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments'
      and policyname = 'own invoice payments delete' and cmd = 'DELETE'
      and qual ilike '%stripe_checkout_session_id IS NULL%' and qual ilike '%stripe_event_id IS NULL%'),
    'select/insert/update/delete split policies; writes refuse Stripe rows; no FOR ALL',
    (select string_agg(policyname || ':' || cmd, ', ' order by policyname)
      from pg_policies where schemaname = 'public' and tablename = 'invoice_payments')

  -- F. stripe_checkout_session_id: UNIQUE (webhook ON CONFLICT target) and the
  --    shape check.
  union all
  select 'F stripe session constraints',
    exists (select 1 from pg_constraint where conrelid = 'public.invoice_payments'::regclass
      and contype = 'u' and pg_get_constraintdef(oid) ilike '%stripe_checkout_session_id%')
    and exists (select 1 from pg_constraint where conrelid = 'public.invoice_payments'::regclass
      and conname = 'invoice_payments_stripe_session_chk'),
    'UNIQUE key + invoice_payments_stripe_session_chk',
    (select string_agg(conname, ', ') from pg_constraint
      where conrelid = 'public.invoice_payments'::regclass
        and pg_get_constraintdef(oid) ilike '%stripe_checkout_session_id%')

  -- G. Stripe-sourced rows always belong to the invoice's owner.
  union all
  select 'G stripe rows owned', count(*) = 0, '0 mismatched rows', count(*)::text
  from public.invoice_payments p join public.invoices i on i.id = p.invoice_id
  where p.stripe_checkout_session_id is not null and p.user_id <> i.user_id

  -- H + I. Public-invoice RPCs (20260926100000): service_role only, SECURITY
  --    DEFINER with an empty search_path, and the public one exposes no
  --    account id.
  union all
  select 'H ' || fn.f || ' ' || ro.r,
    not has_function_privilege(ro.r, fn.f, 'execute'),
    'not executable', case when has_function_privilege(ro.r, fn.f, 'execute') then 'EXECUTE' else '' end
  from (values ('public.get_public_invoice(text, text)'),
               ('public.get_public_invoice_checkout(text)')) fn(f)
  cross join (values ('anon'), ('authenticated')) ro(r)
  union all
  select 'I ' || p.proname,
    p.prosecdef and 'search_path=""' = any(p.proconfig)
    and (p.proname <> 'get_public_invoice'
      or (pg_get_function_result(p.oid) ilike '%card_available boolean)'
          and pg_get_function_result(p.oid) not ilike '%stripe_account_id%')),
    'SECURITY DEFINER, search_path="" (public one: ends card_available, no stripe_account_id)',
    'definer=' || p.prosecdef || ' config=' || coalesce(p.proconfig::text, 'none')
  from pg_proc p
  where p.proname in ('get_public_invoice', 'get_public_invoice_checkout')
    and p.pronamespace = 'public'::regnamespace

  -- J. push_subscriptions policies (20260929000000): exactly three, no FOR ALL.
  union all
  select 'J push_subscriptions policies',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions') = 3
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions'
      and policyname = 'own subscriptions select' and cmd = 'SELECT' and qual = '(auth.uid() = user_id)')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions'
      and policyname = 'own subscriptions insert' and cmd = 'INSERT' and with_check = '(auth.uid() = user_id)')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions'
      and policyname = 'own subscriptions delete' and cmd = 'DELETE' and qual = '(auth.uid() = user_id)'),
    'select/insert/delete owner policies only',
    (select string_agg(policyname || ':' || cmd, ', ' order by policyname)
      from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions')

  -- K. Table privileges on push_subscriptions / notification_log, and
  --    notification_log is RLS-on with zero policies (service role only).
  union all
  select 'K ' || t.tbl || ' ' || t.role,
    has_table_privilege(t.role, t.tbl, 'SELECT') = t.sel
    and has_table_privilege(t.role, t.tbl, 'INSERT') = t.ins
    and has_table_privilege(t.role, t.tbl, 'UPDATE') = false
    and has_table_privilege(t.role, t.tbl, 'DELETE') = t.del
    and has_table_privilege(t.role, t.tbl, 'TRUNCATE') = false,
    'sel=' || t.sel || ' ins=' || t.ins || ' upd=false del=' || t.del || ' trunc=false',
    'sel=' || has_table_privilege(t.role, t.tbl, 'SELECT')
      || ' ins=' || has_table_privilege(t.role, t.tbl, 'INSERT')
      || ' upd=' || has_table_privilege(t.role, t.tbl, 'UPDATE')
      || ' del=' || has_table_privilege(t.role, t.tbl, 'DELETE')
      || ' trunc=' || has_table_privilege(t.role, t.tbl, 'TRUNCATE')
  from (values
    ('public.notification_log', 'anon', false, false, false),
    ('public.notification_log', 'authenticated', false, false, false),
    ('public.push_subscriptions', 'anon', false, false, false),
    ('public.push_subscriptions', 'authenticated', true, true, true)
  ) t(tbl, role, sel, ins, del)
  union all
  select 'K notification_log RLS',
    c.relrowsecurity and (select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = 'notification_log') = 0,
    'RLS on, 0 policies',
    'rls=' || c.relrowsecurity || ' policies=' || (select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = 'notification_log')
  from pg_class c where c.oid = 'public.notification_log'::regclass

  -- L. Push phase 2 (20260930000003/000004).
  union all
  select 'L1 mark_invoice_viewed ' || ro.r,
    not has_function_privilege(ro.r, 'public.mark_invoice_viewed(text, uuid)', 'execute'),
    'not executable (returns the owner id)',
    case when has_function_privilege(ro.r, 'public.mark_invoice_viewed(text, uuid)', 'execute') then 'EXECUTE' else '' end
  from (values ('anon'), ('authenticated')) ro(r)
  union all
  select 'L2 mark_invoice_viewed',
    p.prosecdef and 'search_path=""' = any(p.proconfig)
    and pg_get_function_result(p.oid) = 'TABLE(invoice_id uuid, user_id uuid, invoice_number integer, client_name text)',
    'SECURITY DEFINER, search_path="", returns TABLE(invoice_id, user_id, invoice_number, client_name)',
    'definer=' || p.prosecdef || ' config=' || coalesce(p.proconfig::text, 'none')
      || ' result=' || pg_get_function_result(p.oid)
  from pg_proc p
  where p.proname = 'mark_invoice_viewed' and p.pronamespace = 'public'::regnamespace
  union all
  select 'L3 new columns',
    count(*) = 3 and bool_and(
      (table_name = 'invoices' and column_name = 'viewed_at' and data_type = 'timestamp with time zone' and is_nullable = 'YES')
      or (table_name = 'profiles' and column_name = 'notify_draft_nudges' and data_type = 'boolean' and is_nullable = 'NO')
      or (table_name = 'profiles' and column_name = 'timezone' and data_type = 'text' and is_nullable = 'YES')),
    'invoices.viewed_at timestamptz null; profiles.notify_draft_nudges boolean not null; profiles.timezone text null',
    string_agg(table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable, '; ')
  from information_schema.columns
  where table_schema = 'public'
    and ((table_name = 'invoices' and column_name = 'viewed_at')
      or (table_name = 'profiles' and column_name in ('timezone', 'notify_draft_nudges')))
  union all
  select 'L4 notification_log types',
    coalesce(bool_and(pg_get_constraintdef(oid) ilike all (array[
      '%payment_received%', '%connect_problem%', '%invoice_viewed%', '%draft_unsent%', '%''test''%'])), false),
    'check lists payment_received, connect_problem, invoice_viewed, draft_unsent, test',
    coalesce(string_agg(pg_get_constraintdef(oid), ' '), 'missing')
  from pg_constraint
  where conrelid = 'public.notification_log'::regclass and conname = 'notification_log_type_chk'

  -- M. reconcile_invoice_from_ledger (20260930000002).
  union all
  select 'M1 reconcile ' || ro.r,
    not has_function_privilege(ro.r, 'public.reconcile_invoice_from_ledger(uuid)', 'execute'),
    'not executable (internal helper)',
    case when has_function_privilege(ro.r, 'public.reconcile_invoice_from_ledger(uuid)', 'execute') then 'EXECUTE' else '' end
  from (values ('public'), ('anon'), ('authenticated')) ro(r)
  union all
  select 'M2 reconcile definition',
    p.prosecdef and 'search_path=""' = any(p.proconfig) and p.prosrc ilike '%v_leave%',
    'SECURITY DEFINER, search_path="", draft logic present',
    'definer=' || p.prosecdef || ' config=' || coalesce(p.proconfig::text, 'none')
      || ' draft_logic=' || (p.prosrc ilike '%v_leave%')
  from pg_proc p
  where p.proname = 'reconcile_invoice_from_ledger' and p.pronamespace = 'public'::regnamespace
  union all
  select 'M3 invoice data',
    count(*) filter (where status = 'draft' and kind = 'invoice' and deleted_at is null and amount_paid > 0) = 0
    and count(*) filter (where status = 'paid' and amount_paid < total) = 0,
    'paid_drafts_left 0, paid_but_underpaid 0',
    'paid_drafts_left=' || count(*) filter (where status = 'draft' and kind = 'invoice' and deleted_at is null and amount_paid > 0)
      || ' paid_but_underpaid=' || count(*) filter (where status = 'paid' and amount_paid < total)
  from public.invoices

  -- Z. The definition checks above (I, L2, M2) emit no row for a missing
  --    function, so their existence is checked here.
  union all
  select 'Z functions exist', count(*) = 4,
    'get_public_invoice, get_public_invoice_checkout, mark_invoice_viewed, reconcile_invoice_from_ledger',
    coalesce(string_agg(proname, ', ' order by proname), 'none')
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname in ('get_public_invoice', 'get_public_invoice_checkout',
                    'mark_invoice_viewed', 'reconcile_invoice_from_ledger')

  -- N. Paywall v2 invoice cap (20261001000001). SKIP until pushed.
  union all
  select 'N1 ' || f.name,
    case when not exists (select 1 from applied where version = '20261001000001') then null
      else coalesce((select p.prosecdef = f.definer and 'search_path=""' = any(p.proconfig)
        from pg_proc p where p.oid = to_regprocedure(f.sig)), false) end,
    case when f.definer then 'SECURITY DEFINER, search_path=""' else 'SECURITY INVOKER, search_path=""' end,
    case when not exists (select 1 from applied where version = '20261001000001') then 'not applied yet'
      else coalesce((select 'definer=' || p.prosecdef || ' config=' || coalesce(p.proconfig::text, 'none')
        from pg_proc p where p.oid = to_regprocedure(f.sig)), 'missing') end
  from (values
    ('enforce_free_invoice_limit', 'public.enforce_free_invoice_limit()', true),
    ('pin_created_at', 'public.pin_created_at()', false),
    ('paywall_reset_at', 'public.paywall_reset_at()', false)
  ) f(name, sig, definer)
  union all
  select 'N2 ' || f.sig || ' ' || ro.r,
    case when not exists (select 1 from applied where version = '20261001000001') then null
      else coalesce(not has_function_privilege(ro.r, to_regprocedure(f.sig), 'execute'), false) end,
    'not executable (trigger function)',
    case when not exists (select 1 from applied where version = '20261001000001') then 'not applied yet'
      else coalesce(case when has_function_privilege(ro.r, to_regprocedure(f.sig), 'execute')
        then 'EXECUTE' else 'no execute' end, 'missing') end
  from (values ('public.enforce_free_invoice_limit()'), ('public.pin_created_at()')) f(sig)
  cross join (values ('anon'), ('authenticated')) ro(r)
  union all
  select 'N3 invoice triggers',
    case when not exists (select 1 from applied where version = '20261001000001') then null
      else (select count(*) from pg_trigger t
        where not t.tgisinternal and t.tgrelid = 'public.invoices'::regclass
          and t.tgname in ('enforce_free_invoice_limit', 'pin_created_at')) = 2 end,
    'invoices: enforce_free_invoice_limit (before insert) + pin_created_at (before update)',
    case when not exists (select 1 from applied where version = '20261001000001') then 'not applied yet'
      else (select coalesce(string_agg(t.tgname, ', ' order by t.tgname), 'none') from pg_trigger t
        where not t.tgisinternal and t.tgrelid = 'public.invoices'::regclass
          and t.tgname in ('enforce_free_invoice_limit', 'pin_created_at')) end

  -- N4–N6. Paywall v2 expense cap (20261001000002). SKIP until pushed.
  union all
  select 'N4 enforce_free_expense_limit',
    case when not exists (select 1 from applied where version = '20261001000002') then null
      else coalesce((select p.prosecdef and 'search_path=""' = any(p.proconfig)
        from pg_proc p where p.oid = to_regprocedure('public.enforce_free_expense_limit()')), false) end,
    'SECURITY DEFINER, search_path=""',
    case when not exists (select 1 from applied where version = '20261001000002') then 'not applied yet'
      else coalesce((select 'definer=' || p.prosecdef || ' config=' || coalesce(p.proconfig::text, 'none')
        from pg_proc p where p.oid = to_regprocedure('public.enforce_free_expense_limit()')), 'missing') end
  union all
  select 'N5 enforce_free_expense_limit() ' || ro.r,
    case when not exists (select 1 from applied where version = '20261001000002') then null
      else coalesce(not has_function_privilege(ro.r, to_regprocedure('public.enforce_free_expense_limit()'), 'execute'), false) end,
    'not executable (trigger function)',
    case when not exists (select 1 from applied where version = '20261001000002') then 'not applied yet'
      else coalesce(case when has_function_privilege(ro.r, to_regprocedure('public.enforce_free_expense_limit()'), 'execute')
        then 'EXECUTE' else 'no execute' end, 'missing') end
  from (values ('anon'), ('authenticated')) ro(r)
  union all
  select 'N6 expense triggers',
    case when not exists (select 1 from applied where version = '20261001000002') then null
      else (select count(*) from pg_trigger t
        where not t.tgisinternal and t.tgrelid = 'public.expenses'::regclass
          and t.tgname in ('enforce_free_expense_limit', 'pin_created_at')) = 2 end,
    'expenses: enforce_free_expense_limit (before insert) + pin_created_at (before update)',
    case when not exists (select 1 from applied where version = '20261001000002') then 'not applied yet'
      else (select coalesce(string_agg(t.tgname, ', ' order by t.tgname), 'none') from pg_trigger t
        where not t.tgisinternal and t.tgrelid = 'public.expenses'::regclass
          and t.tgname in ('enforce_free_expense_limit', 'pin_created_at')) end

  -- O. Founder code (20261001000003). SKIP until pushed.
  union all
  select 'O1 ' || f.sig || ' ' || ro.r,
    case when not exists (select 1 from applied where version = '20261001000003') then null
      else coalesce(not has_function_privilege(ro.r, to_regprocedure(f.sig), 'execute'), false) end,
    'not executable (codes redeem only through /api/redeem)',
    case when not exists (select 1 from applied where version = '20261001000003') then 'not applied yet'
      else coalesce(case when has_function_privilege(ro.r, to_regprocedure(f.sig), 'execute')
        then 'EXECUTE' else 'no execute' end, 'missing') end
  from (values ('public.redeem_grant(text)'), ('public.redeem_grant_for(uuid, text)')) f(sig)
  cross join (values ('anon'), ('authenticated')) ro(r)
  union all
  select 'O2 redeem_grant_for',
    case when not exists (select 1 from applied where version = '20261001000003') then null
      else coalesce((select p.prosecdef and 'search_path=""' = any(p.proconfig)
        from pg_proc p where p.oid = to_regprocedure('public.redeem_grant_for(uuid, text)')), false) end,
    'SECURITY DEFINER, search_path=""',
    case when not exists (select 1 from applied where version = '20261001000003') then 'not applied yet'
      else coalesce((select 'definer=' || p.prosecdef || ' config=' || coalesce(p.proconfig::text, 'none')
        from pg_proc p where p.oid = to_regprocedure('public.redeem_grant_for(uuid, text)')), 'missing') end
  union all
  select 'O3 ' || t.tbl || ' unreadable',
    case when not exists (select 1 from applied where version = '20261001000003') then null
      else coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass(t.tbl)), false)
        and (select count(*) from pg_policies p where p.schemaname = 'public'
               and p.tablename = split_part(t.tbl, '.', 2)) = 0 end,
    'RLS on, 0 policies (clients never read codes, counts or redemptions)',
    case when not exists (select 1 from applied where version = '20261001000003') then 'not applied yet'
      else coalesce((select 'rls=' || c.relrowsecurity || ' policies=' || (select count(*) from pg_policies p
        where p.schemaname = 'public' and p.tablename = split_part(t.tbl, '.', 2))
        from pg_class c where c.oid = to_regclass(t.tbl)), 'missing') end
  from (values ('public.access_grants'), ('public.grant_redemptions')) t(tbl)
  union all
  select 'O4 grant_redemptions ' || ro.r,
    case when not exists (select 1 from applied where version = '20261001000003') then null
      else coalesce(not (has_table_privilege(ro.r, to_regclass('public.grant_redemptions'), 'SELECT')
        or has_table_privilege(ro.r, to_regclass('public.grant_redemptions'), 'INSERT')
        or has_table_privilege(ro.r, to_regclass('public.grant_redemptions'), 'UPDATE')
        or has_table_privilege(ro.r, to_regclass('public.grant_redemptions'), 'DELETE')), false) end,
    'no table privileges',
    case when not exists (select 1 from applied where version = '20261001000003') then 'not applied yet'
      else coalesce('sel=' || has_table_privilege(ro.r, to_regclass('public.grant_redemptions'), 'SELECT')
        || ' ins=' || has_table_privilege(ro.r, to_regclass('public.grant_redemptions'), 'INSERT')
        || ' upd=' || has_table_privilege(ro.r, to_regclass('public.grant_redemptions'), 'UPDATE')
        || ' del=' || has_table_privilege(ro.r, to_regclass('public.grant_redemptions'), 'DELETE'), 'missing') end
  from (values ('anon'), ('authenticated')) ro(r)
  -- P. Recaps (20261001000010; P3/P6 also 20261002000001 recap payload). SKIP until pushed.
  union all
  select 'P1 recaps RLS + policies',
    case when not exists (select 1 from applied where version = '20261001000010') then null
      else coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.recaps')), false)
        and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'recaps') = 2
        and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'recaps'
          and p.cmd = 'SELECT' and p.qual ilike '%auth.uid() = user_id%')
        and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'recaps'
          and p.cmd = 'UPDATE' and p.qual ilike '%auth.uid() = user_id%' and p.with_check ilike '%auth.uid() = user_id%') end,
    'RLS on; exactly 2 owner policies: SELECT, UPDATE (no INSERT/DELETE policy)',
    case when not exists (select 1 from applied where version = '20261001000010') then 'not applied yet'
      else coalesce((select 'rls=' || c.relrowsecurity || ' policies=' || coalesce((select string_agg(p.cmd, ',' order by p.cmd)
        from pg_policies p where p.schemaname = 'public' and p.tablename = 'recaps'), 'none')
        from pg_class c where c.oid = to_regclass('public.recaps')), 'missing') end
  union all
  select 'P2 recaps ' || t.role,
    case when not exists (select 1 from applied where version = '20261001000010') then null
      else coalesce(has_table_privilege(t.role, to_regclass('public.recaps'), 'SELECT') = t.sel
        and not has_table_privilege(t.role, to_regclass('public.recaps'), 'INSERT')
        and not has_table_privilege(t.role, to_regclass('public.recaps'), 'UPDATE')
        and not has_table_privilege(t.role, to_regclass('public.recaps'), 'DELETE')
        and not has_table_privilege(t.role, to_regclass('public.recaps'), 'TRUNCATE'), false) end,
    'sel=' || t.sel || ' ins=false upd(table)=false del=false trunc=false',
    case when not exists (select 1 from applied where version = '20261001000010') then 'not applied yet'
      else coalesce('sel=' || has_table_privilege(t.role, to_regclass('public.recaps'), 'SELECT')
        || ' ins=' || has_table_privilege(t.role, to_regclass('public.recaps'), 'INSERT')
        || ' upd(table)=' || has_table_privilege(t.role, to_regclass('public.recaps'), 'UPDATE')
        || ' del=' || has_table_privilege(t.role, to_regclass('public.recaps'), 'DELETE')
        || ' trunc=' || has_table_privilege(t.role, to_regclass('public.recaps'), 'TRUNCATE'), 'missing') end
  from (values ('anon', false), ('authenticated', true)) t(role, sel)
  union all
  select 'P3 recaps updatable columns ' || ro.r,
    case when not exists (select 1 from applied where version = '20261001000010') then null
      else coalesce(string_agg(c.column_name, ',' order by c.column_name)
        filter (where has_column_privilege(ro.r, 'public.recaps', c.column_name, 'UPDATE')), '')
        = case when ro.r <> 'authenticated' then ''
               when exists (select 1 from applied where version = '20261002000001') then 'prompted_at,seen_at'
               else 'seen_at' end end,
    case when ro.r <> 'authenticated' then 'no column UPDATE'
         when exists (select 1 from applied where version = '20261002000001') then 'UPDATE on prompted_at, seen_at only (never payload)'
         else 'UPDATE on seen_at only' end,
    case when not exists (select 1 from applied where version = '20261001000010') then 'not applied yet'
      else coalesce(string_agg(c.column_name, ',' order by c.column_name)
        filter (where has_column_privilege(ro.r, 'public.recaps', c.column_name, 'UPDATE')), 'none') end
  from (values ('anon'), ('authenticated')) ro(r)
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = 'recaps'
    and exists (select 1 from applied where version = '20261001000010')
  group by ro.r
  union all
  select 'P4 profiles.recap_push',
    case when not exists (select 1 from applied where version = '20261001000010') then null
      else coalesce((select c.data_type = 'boolean' and c.is_nullable = 'NO' and c.column_default = 'true'
          and has_column_privilege('authenticated', 'public.profiles', 'recap_push', 'UPDATE')
          and not has_column_privilege('authenticated', 'public.profiles', 'recap_push', 'INSERT')
        from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name = 'recap_push'), false) end,
    'boolean not null default true; authenticated UPDATE, no INSERT (safe column)',
    case when not exists (select 1 from applied where version = '20261001000010') then 'not applied yet'
      else coalesce((select c.data_type || ' nullable=' || c.is_nullable || ' default=' || coalesce(c.column_default, 'none')
          || ' upd=' || has_column_privilege('authenticated', 'public.profiles', 'recap_push', 'UPDATE')
          || ' ins=' || has_column_privilege('authenticated', 'public.profiles', 'recap_push', 'INSERT')
        from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name = 'recap_push'), 'missing') end
  union all
  select 'P5 notification_log recap type',
    case when not exists (select 1 from applied where version = '20261001000010') then null
      else coalesce((select pg_get_constraintdef(oid) ilike '%''recap''%' from pg_constraint
        where conrelid = 'public.notification_log'::regclass and conname = 'notification_log_type_chk'), false) end,
    'notification_log_type_chk allows recap',
    case when not exists (select 1 from applied where version = '20261001000010') then 'not applied yet'
      else coalesce((select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.notification_log'::regclass and conname = 'notification_log_type_chk'), 'missing') end
  union all
  select 'P6 recaps payload columns + constraint',
    case when not exists (select 1 from applied where version = '20261002000001') then null
      else (select count(*) from information_schema.columns c
              where c.table_schema = 'public' and c.table_name = 'recaps'
                and c.column_name in ('payload', 'payload_version', 'prompted_at')) = 3
        and coalesce((select pg_get_constraintdef(oid) ilike '%jsonb_typeof(payload)%'
                        and pg_get_constraintdef(oid) ilike '%16384%'
              from pg_constraint
              where conrelid = to_regclass('public.recaps') and conname = 'recaps_payload_chk'), false) end,
    'payload, payload_version, prompted_at exist; recaps_payload_chk (object, <= 16384 bytes)',
    case when not exists (select 1 from applied where version = '20261002000001') then 'not applied yet'
      else coalesce((select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = to_regclass('public.recaps') and conname = 'recaps_payload_chk'), 'missing') end

  -- Q. Saved clients (20261003000001). SKIP until pushed.
  union all
  select 'Q1 clients RLS + policies',
    case when not exists (select 1 from applied where version = '20261003000001') then null
      else (select c.relrowsecurity from pg_class c where c.oid = 'public.clients'::regclass)
        and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'clients') = 3
        and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'clients'
          and p.cmd = 'SELECT' and p.qual = '(auth.uid() = user_id)')
        and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'clients'
          and p.cmd = 'INSERT' and p.with_check = '(auth.uid() = user_id)')
        and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'clients'
          and p.cmd = 'UPDATE' and p.qual = '(auth.uid() = user_id)' and p.with_check = '(auth.uid() = user_id)') end,
    'RLS on; exactly 3 owner policies: SELECT, INSERT, UPDATE (no DELETE, no FOR ALL)',
    case when not exists (select 1 from applied where version = '20261003000001') then 'not applied yet'
      else (select 'rls=' || c.relrowsecurity from pg_class c where c.oid = 'public.clients'::regclass)
        || ' policies=' || coalesce((select string_agg(p.cmd, ',' order by p.cmd)
          from pg_policies p where p.schemaname = 'public' and p.tablename = 'clients'), 'none') end
  union all
  select 'Q2 clients ' || t.role,
    case when not exists (select 1 from applied where version = '20261003000001') then null
      else has_table_privilege(t.role, 'public.clients', 'SELECT') = t.rw
        and has_table_privilege(t.role, 'public.clients', 'INSERT') = t.rw
        and has_table_privilege(t.role, 'public.clients', 'UPDATE') = t.rw
        and not has_table_privilege(t.role, 'public.clients', 'DELETE')
        and not has_table_privilege(t.role, 'public.clients', 'TRUNCATE')
        and not has_table_privilege(t.role, 'public.clients', 'REFERENCES')
        and not has_table_privilege(t.role, 'public.clients', 'TRIGGER') end,
    case when t.rw then 'select/insert/update only (no delete/truncate/references/trigger)' else 'no privileges' end,
    case when not exists (select 1 from applied where version = '20261003000001') then 'not applied yet'
      else concat_ws(' ',
        case when has_table_privilege(t.role, 'public.clients', 'SELECT') then 'SELECT' end,
        case when has_table_privilege(t.role, 'public.clients', 'INSERT') then 'INSERT' end,
        case when has_table_privilege(t.role, 'public.clients', 'UPDATE') then 'UPDATE' end,
        case when has_table_privilege(t.role, 'public.clients', 'DELETE') then 'DELETE' end,
        case when has_table_privilege(t.role, 'public.clients', 'TRUNCATE') then 'TRUNCATE' end,
        case when has_table_privilege(t.role, 'public.clients', 'REFERENCES') then 'REFERENCES' end,
        case when has_table_privilege(t.role, 'public.clients', 'TRIGGER') then 'TRIGGER' end) end
  from (values ('anon', false), ('authenticated', true)) t(role, rw)
  union all
  select 'Q3 clients name_key + notes cap + canonical trigger',
    case when not exists (select 1 from applied where version = '20261003000001') then null
      else exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.tablename = 'clients'
          and i.indexname = 'clients_user_name_key_idx' and i.indexdef ilike 'create unique index%(user_id, name_key)%')
        and exists (select 1 from pg_constraint where conrelid = 'public.clients'::regclass
          and conname = 'clients_notes_chk' and pg_get_constraintdef(oid) ilike '%500%')
        and exists (select 1 from pg_trigger where tgrelid = 'public.clients'::regclass
          and tgname = 'clients_canonical_name' and not tgisinternal) end,
    'unique (user_id, name_key); clients_notes_chk <= 500; clients_canonical_name trigger',
    case when not exists (select 1 from applied where version = '20261003000001') then 'not applied yet'
      else 'index=' || exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = 'clients_user_name_key_idx')
        || ' notes_chk=' || exists (select 1 from pg_constraint where conrelid = 'public.clients'::regclass and conname = 'clients_notes_chk')
        || ' trigger=' || exists (select 1 from pg_trigger where tgrelid = 'public.clients'::regclass and tgname = 'clients_canonical_name') end
  union all
  select 'Q4 ' || f.sig,
    case when not exists (select 1 from applied where version = '20261003000001') then null
      else coalesce((select not p.prosecdef from pg_proc p where p.oid = to_regprocedure(f.sig)), false)
        and coalesce(has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE'), false)
        and not coalesce(has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE'), true) end,
    'security invoker; EXECUTE to authenticated, not anon',
    case when not exists (select 1 from applied where version = '20261003000001') then 'not applied yet'
      when to_regprocedure(f.sig) is null then 'missing'
      else 'definer=' || (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(f.sig))
        || ' auth=' || has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE')
        || ' anon=' || has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE') end
  from (values ('public.save_client(text,text,text,text,text)'), ('public.client_name_usage(text)'),
               ('public.client_summaries()')) f(sig)

  -- R. Saved products & services (20261003000002). SKIP until pushed.
  union all
  select 'R1 products RLS + policies',
    case when not exists (select 1 from applied where version = '20261003000002') then null
      else coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.products')), false)
        and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'products') = 3
        and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'products'
          and p.cmd = 'SELECT' and p.qual = '(auth.uid() = user_id)')
        and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'products'
          and p.cmd = 'INSERT' and p.with_check = '(auth.uid() = user_id)')
        and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'products'
          and p.cmd = 'UPDATE' and p.qual = '(auth.uid() = user_id)' and p.with_check = '(auth.uid() = user_id)') end,
    'RLS on; exactly 3 owner policies: SELECT, INSERT, UPDATE (no DELETE)',
    case when not exists (select 1 from applied where version = '20261003000002') then 'not applied yet'
      else coalesce((select 'rls=' || c.relrowsecurity from pg_class c where c.oid = to_regclass('public.products')), 'missing')
        || ' policies=' || coalesce((select string_agg(p.cmd, ',' order by p.cmd)
          from pg_policies p where p.schemaname = 'public' and p.tablename = 'products'), 'none') end
  union all
  select 'R2 products ' || t.role,
    case when not exists (select 1 from applied where version = '20261003000002') then null
      when to_regclass('public.products') is null then false
      else has_table_privilege(t.role, 'public.products', 'SELECT') = t.rw
        and has_table_privilege(t.role, 'public.products', 'INSERT') = t.rw
        and has_table_privilege(t.role, 'public.products', 'UPDATE') = t.rw
        and not has_table_privilege(t.role, 'public.products', 'DELETE')
        and not has_table_privilege(t.role, 'public.products', 'TRUNCATE')
        and not has_table_privilege(t.role, 'public.products', 'REFERENCES')
        and not has_table_privilege(t.role, 'public.products', 'TRIGGER') end,
    case when t.rw then 'select/insert/update only (no delete/truncate/references/trigger)' else 'no privileges' end,
    case when not exists (select 1 from applied where version = '20261003000002') then 'not applied yet'
      when to_regclass('public.products') is null then 'missing'
      else concat_ws(' ',
        case when has_table_privilege(t.role, 'public.products', 'SELECT') then 'SELECT' end,
        case when has_table_privilege(t.role, 'public.products', 'INSERT') then 'INSERT' end,
        case when has_table_privilege(t.role, 'public.products', 'UPDATE') then 'UPDATE' end,
        case when has_table_privilege(t.role, 'public.products', 'DELETE') then 'DELETE' end,
        case when has_table_privilege(t.role, 'public.products', 'TRUNCATE') then 'TRUNCATE' end,
        case when has_table_privilege(t.role, 'public.products', 'REFERENCES') then 'REFERENCES' end,
        case when has_table_privilege(t.role, 'public.products', 'TRIGGER') then 'TRIGGER' end) end
  from (values ('anon', false), ('authenticated', true)) t(role, rw)
  union all
  select 'R3 products name_key + checks',
    case when not exists (select 1 from applied where version = '20261003000002') then null
      else exists (select 1 from pg_constraint where conrelid = to_regclass('public.products')
          and conname = 'products_user_name_key' and contype = 'u')
        and (select count(*) from pg_constraint where conrelid = to_regclass('public.products')
          and conname in ('products_name_chk', 'products_unit_chk', 'products_price_chk', 'products_detail_chk', 'products_use_count_chk')) = 5 end,
    'unique (user_id, name_key); name / unit / price / detail / use_count checks',
    case when not exists (select 1 from applied where version = '20261003000002') then 'not applied yet'
      else coalesce((select string_agg(conname, ',' order by conname) from pg_constraint
        where conrelid = to_regclass('public.products') and contype in ('u', 'c')), 'missing') end
  union all
  select 'R4 public.record_product_use(jsonb)',
    case when not exists (select 1 from applied where version = '20261003000002') then null
      else coalesce((select not p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.record_product_use(jsonb)')), false)
        and coalesce(has_function_privilege('authenticated', to_regprocedure('public.record_product_use(jsonb)'), 'EXECUTE'), false)
        and not coalesce(has_function_privilege('anon', to_regprocedure('public.record_product_use(jsonb)'), 'EXECUTE'), true) end,
    'security invoker; EXECUTE to authenticated, not anon',
    case when not exists (select 1 from applied where version = '20261003000002') then 'not applied yet'
      when to_regprocedure('public.record_product_use(jsonb)') is null then 'missing'
      else 'definer=' || (select p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.record_product_use(jsonb)'))
        || ' auth=' || has_function_privilege('authenticated', to_regprocedure('public.record_product_use(jsonb)'), 'EXECUTE')
        || ' anon=' || has_function_privilege('anon', to_regprocedure('public.record_product_use(jsonb)'), 'EXECUTE') end

  -- S. Pay page line unit + detail (20261003000003). SKIP until pushed.
  --    (H and I above still cover get_public_invoice's grants and definer.)
  union all
  select 'S1 get_public_invoice line keys',
    case when not exists (select 1 from applied where version = '20261003000003') then null
      else coalesce((select p.prosrc ilike '%''unit'',%' and p.prosrc ilike '%''detail'',%'
          and p.prosrc ilike '%''description''%' and p.prosrc ilike '%''qty''%' and p.prosrc ilike '%''unit_price''%'
        from pg_proc p where p.oid = to_regprocedure('public.get_public_invoice(text, text)')), false) end,
    'line elements pass description, qty, unit_price, unit, detail',
    case when not exists (select 1 from applied where version = '20261003000003') then 'not applied yet'
      when to_regprocedure('public.get_public_invoice(text, text)') is null then 'missing'
      else concat_ws(' ',
        (select case when p.prosrc ilike '%''unit'',%' then 'unit' end from pg_proc p where p.oid = to_regprocedure('public.get_public_invoice(text, text)')),
        (select case when p.prosrc ilike '%''detail'',%' then 'detail' end from pg_proc p where p.oid = to_regprocedure('public.get_public_invoice(text, text)'))) end
  -- T. Recurring expenses (20261004000001). SKIP until pushed.
  union all
  select 'T1 recurring_expenses RLS + policies',
    case when not exists (select 1 from applied where version = '20261004000001') then null
      else coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.recurring_expenses')), false)
        and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'recurring_expenses') = 3
        and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'recurring_expenses'
          and p.cmd = 'SELECT' and p.qual = '(auth.uid() = user_id)')
        and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'recurring_expenses'
          and p.cmd = 'INSERT' and p.with_check = '(auth.uid() = user_id)')
        and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'recurring_expenses'
          and p.cmd = 'UPDATE' and p.qual = '(auth.uid() = user_id)' and p.with_check = '(auth.uid() = user_id)') end,
    'RLS on; exactly 3 owner policies: SELECT, INSERT, UPDATE (no DELETE)',
    case when not exists (select 1 from applied where version = '20261004000001') then 'not applied yet'
      else coalesce((select 'rls=' || c.relrowsecurity from pg_class c where c.oid = to_regclass('public.recurring_expenses')), 'missing')
        || ' policies=' || coalesce((select string_agg(p.cmd, ',' order by p.cmd)
          from pg_policies p where p.schemaname = 'public' and p.tablename = 'recurring_expenses'), 'none') end
  union all
  select 'T2 recurring_expenses anon',
    case when not exists (select 1 from applied where version = '20261004000001') then null
      when to_regclass('public.recurring_expenses') is null then false
      else not has_any_column_privilege('anon', 'public.recurring_expenses', 'SELECT')
        and not has_any_column_privilege('anon', 'public.recurring_expenses', 'INSERT')
        and not has_any_column_privilege('anon', 'public.recurring_expenses', 'UPDATE')
        and not has_table_privilege('anon', 'public.recurring_expenses', 'DELETE')
        and not has_table_privilege('anon', 'public.recurring_expenses', 'TRUNCATE')
        and not has_table_privilege('anon', 'public.recurring_expenses', 'REFERENCES')
        and not has_table_privilege('anon', 'public.recurring_expenses', 'TRIGGER') end,
    'no privileges',
    case when not exists (select 1 from applied where version = '20261004000001') then 'not applied yet'
      when to_regclass('public.recurring_expenses') is null then 'missing'
      else concat_ws(' ',
        case when has_any_column_privilege('anon', 'public.recurring_expenses', 'SELECT') then 'SELECT' end,
        case when has_any_column_privilege('anon', 'public.recurring_expenses', 'INSERT') then 'INSERT' end,
        case when has_any_column_privilege('anon', 'public.recurring_expenses', 'UPDATE') then 'UPDATE' end,
        case when has_table_privilege('anon', 'public.recurring_expenses', 'DELETE') then 'DELETE' end,
        case when has_table_privilege('anon', 'public.recurring_expenses', 'TRUNCATE') then 'TRUNCATE' end,
        case when has_table_privilege('anon', 'public.recurring_expenses', 'REFERENCES') then 'REFERENCES' end,
        case when has_table_privilege('anon', 'public.recurring_expenses', 'TRIGGER') then 'TRIGGER' end) end
  union all
  select 'T3 recurring_expenses authenticated',
    case when not exists (select 1 from applied where version = '20261004000001') then null
      when to_regclass('public.recurring_expenses') is null then false
      else has_table_privilege('authenticated', 'public.recurring_expenses', 'SELECT')
        and not has_table_privilege('authenticated', 'public.recurring_expenses', 'INSERT')
        and not has_table_privilege('authenticated', 'public.recurring_expenses', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.recurring_expenses', 'DELETE')
        and not has_table_privilege('authenticated', 'public.recurring_expenses', 'TRUNCATE')
        and not has_table_privilege('authenticated', 'public.recurring_expenses', 'REFERENCES')
        and not has_table_privilege('authenticated', 'public.recurring_expenses', 'TRIGGER')
        and (select bool_and(has_column_privilege('authenticated', 'public.recurring_expenses', c, 'INSERT'))
          from unnest(array['user_id', 'vendor', 'description', 'amount', 'category', 'cadence', 'anchor_day', 'next_on', 'auto_log']) c)
        and (select bool_and(has_column_privilege('authenticated', 'public.recurring_expenses', c, 'UPDATE'))
          from unnest(array['vendor', 'description', 'amount', 'category', 'cadence', 'anchor_day', 'next_on', 'auto_log', 'deleted_at']) c)
        and not (select bool_or(has_column_privilege('authenticated', 'public.recurring_expenses', c, 'INSERT')
            or has_column_privilege('authenticated', 'public.recurring_expenses', c, 'UPDATE'))
          from unnest(array['id', 'last_logged_on', 'last_skipped_on', 'last_skip_reason', 'created_at', 'updated_at']) c)
        and not has_column_privilege('authenticated', 'public.recurring_expenses', 'user_id', 'UPDATE') end,
    'select; insert/update on the user columns only — never last_*, id, user_id (update), timestamps; no delete',
    case when not exists (select 1 from applied where version = '20261004000001') then 'not applied yet'
      when to_regclass('public.recurring_expenses') is null then 'missing'
      else 'cron-only writable by authenticated: ' || coalesce((select string_agg(c, ',') from unnest(array['id', 'last_logged_on', 'last_skipped_on', 'last_skip_reason', 'created_at', 'updated_at']) c
          where has_column_privilege('authenticated', 'public.recurring_expenses', c, 'INSERT')
            or has_column_privilege('authenticated', 'public.recurring_expenses', c, 'UPDATE')), 'none')
        || '; table-level: ' || concat_ws(' ',
          case when has_table_privilege('authenticated', 'public.recurring_expenses', 'INSERT') then 'INSERT' end,
          case when has_table_privilege('authenticated', 'public.recurring_expenses', 'UPDATE') then 'UPDATE' end,
          case when has_table_privilege('authenticated', 'public.recurring_expenses', 'DELETE') then 'DELETE' end,
          case when has_table_privilege('authenticated', 'public.recurring_expenses', 'TRUNCATE') then 'TRUNCATE' end,
          case when has_table_privilege('authenticated', 'public.recurring_expenses', 'REFERENCES') then 'REFERENCES' end,
          case when has_table_privilege('authenticated', 'public.recurring_expenses', 'TRIGGER') then 'TRIGGER' end) end
  union all
  select 'T4 expenses anon',
    case when not exists (select 1 from applied where version = '20261004000001') then null
      else not has_any_column_privilege('anon', 'public.expenses', 'SELECT')
        and not has_any_column_privilege('anon', 'public.expenses', 'INSERT')
        and not has_any_column_privilege('anon', 'public.expenses', 'UPDATE')
        and not has_table_privilege('anon', 'public.expenses', 'DELETE')
        and not has_table_privilege('anon', 'public.expenses', 'TRUNCATE')
        and not has_table_privilege('anon', 'public.expenses', 'REFERENCES')
        and not has_table_privilege('anon', 'public.expenses', 'TRIGGER') end,
    'no privileges',
    case when not exists (select 1 from applied where version = '20261004000001') then 'not applied yet'
      else concat_ws(' ',
        case when has_any_column_privilege('anon', 'public.expenses', 'SELECT') then 'SELECT' end,
        case when has_any_column_privilege('anon', 'public.expenses', 'INSERT') then 'INSERT' end,
        case when has_any_column_privilege('anon', 'public.expenses', 'UPDATE') then 'UPDATE' end,
        case when has_table_privilege('anon', 'public.expenses', 'DELETE') then 'DELETE' end,
        case when has_table_privilege('anon', 'public.expenses', 'TRUNCATE') then 'TRUNCATE' end,
        case when has_table_privilege('anon', 'public.expenses', 'REFERENCES') then 'REFERENCES' end,
        case when has_table_privilege('anon', 'public.expenses', 'TRIGGER') then 'TRIGGER' end) end
  union all
  select 'T5 expenses authenticated',
    case when not exists (select 1 from applied where version = '20261004000001') then null
      when not exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'expenses' and column_name = 'recurring_id') then false
      else has_table_privilege('authenticated', 'public.expenses', 'SELECT')
        and not has_table_privilege('authenticated', 'public.expenses', 'INSERT')
        and not has_table_privilege('authenticated', 'public.expenses', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.expenses', 'DELETE')
        and not has_table_privilege('authenticated', 'public.expenses', 'TRUNCATE')
        and not has_table_privilege('authenticated', 'public.expenses', 'REFERENCES')
        and not has_table_privilege('authenticated', 'public.expenses', 'TRIGGER')
        and (select bool_and(has_column_privilege('authenticated', 'public.expenses', c, 'INSERT'))
          from unnest(array['user_id', 'description', 'amount', 'category', 'spent_on', 'vendor', 'note', 'receipt_url', 'receipt_hash']) c)
        and has_column_privilege('authenticated', 'public.expenses', 'deleted_at', 'UPDATE')
        and not (select bool_or(has_column_privilege('authenticated', 'public.expenses', c, 'INSERT')
            or has_column_privilege('authenticated', 'public.expenses', c, 'UPDATE'))
          from unnest(array['recurring_id', 'id', 'created_at']) c)
        and not has_column_privilege('authenticated', 'public.expenses', 'user_id', 'UPDATE') end,
    'select; insert on the app columns; recurring_id never client-writable; no delete',
    case when not exists (select 1 from applied where version = '20261004000001') then 'not applied yet'
      when not exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'expenses' and column_name = 'recurring_id') then 'recurring_id missing'
      else 'recurring_id insert=' || has_column_privilege('authenticated', 'public.expenses', 'recurring_id', 'INSERT')
        || ' update=' || has_column_privilege('authenticated', 'public.expenses', 'recurring_id', 'UPDATE')
        || '; table-level: ' || concat_ws(' ',
          case when has_table_privilege('authenticated', 'public.expenses', 'INSERT') then 'INSERT' end,
          case when has_table_privilege('authenticated', 'public.expenses', 'UPDATE') then 'UPDATE' end,
          case when has_table_privilege('authenticated', 'public.expenses', 'DELETE') then 'DELETE' end,
          case when has_table_privilege('authenticated', 'public.expenses', 'TRUNCATE') then 'TRUNCATE' end,
          case when has_table_privilege('authenticated', 'public.expenses', 'REFERENCES') then 'REFERENCES' end,
          case when has_table_privilege('authenticated', 'public.expenses', 'TRIGGER') then 'TRIGGER' end) end
  union all
  select 'T6 unique indexes + type check',
    case when not exists (select 1 from applied where version = '20261004000001') then null
      else coalesce((select i.indisunique and i.indpred is null from pg_index i
          where i.indexrelid = to_regclass('public.expenses_recurring_due_idx')), false)
        and coalesce((select i.indisunique from pg_index i
          where i.indexrelid = to_regclass('public.recurring_expenses_user_vendor_cadence_idx')), false)
        and coalesce((select pg_get_constraintdef(c.oid) ilike '%recurring_skipped%' from pg_constraint c
          where c.conname = 'notification_log_type_chk'), false) end,
    'expenses (recurring_id, spent_on) unique (not partial); one live item per vendor + cadence; notification type recurring_skipped',
    case when not exists (select 1 from applied where version = '20261004000001') then 'not applied yet'
      else concat_ws(' ',
        case when to_regclass('public.expenses_recurring_due_idx') is not null then 'due_idx' end,
        case when to_regclass('public.recurring_expenses_user_vendor_cadence_idx') is not null then 'vendor_idx' end,
        (select case when pg_get_constraintdef(c.oid) ilike '%recurring_skipped%' then 'type_ok' end
          from pg_constraint c where c.conname = 'notification_log_type_chk')) end
  union all
  select 'T7 public.repeat_candidate(uuid)',
    case when not exists (select 1 from applied where version = '20261004000001') then null
      else coalesce((select not p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.repeat_candidate(uuid)')), false)
        and coalesce(has_function_privilege('authenticated', to_regprocedure('public.repeat_candidate(uuid)'), 'EXECUTE'), false)
        and not coalesce(has_function_privilege('anon', to_regprocedure('public.repeat_candidate(uuid)'), 'EXECUTE'), true) end,
    'security invoker; EXECUTE to authenticated, not anon',
    case when not exists (select 1 from applied where version = '20261004000001') then 'not applied yet'
      when to_regprocedure('public.repeat_candidate(uuid)') is null then 'missing'
      else 'definer=' || (select p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.repeat_candidate(uuid)'))
        || ' auth=' || has_function_privilege('authenticated', to_regprocedure('public.repeat_candidate(uuid)'), 'EXECUTE')
        || ' anon=' || has_function_privilege('anon', to_regprocedure('public.repeat_candidate(uuid)'), 'EXECUTE') end

  -- U. Zelle encryption functions (20261015000001): EXECUTE revoked from PUBLIC,
  --    anon, authenticated; service_role only. (M1 security fix.)
  union all
  select 'U1 ' || fn.f || ' ' || ro.r,
    not has_function_privilege(ro.r, fn.f, 'execute'),
    'not executable',
    case when has_function_privilege(ro.r, fn.f, 'execute') then 'EXECUTE' else '' end
  from (values ('public.set_zelle(uuid, text, text)'),
               ('public.get_zelle(uuid, text)')) fn(f)
  cross join (values ('public'), ('anon'), ('authenticated')) ro(r)
  union all
  select 'U2 ' || fn.f || ' service_role',
    has_function_privilege('service_role', fn.f, 'execute'),
    'executable by service_role',
    case when has_function_privilege('service_role', fn.f, 'execute') then 'EXECUTE' else '' end
  from (values ('public.set_zelle(uuid, text, text)'),
               ('public.get_zelle(uuid, text)')) fn(f)

  -- V. referred_by FK on delete set null (20261015000002): confdeltype = 'n'. (M3 security fix.)
  union all
  select 'V1 profiles_referred_by_fkey on delete set null',
    coalesce((select contype = 'f' and confdeltype = 'n'
      from pg_constraint
      where conname = 'profiles_referred_by_fkey'
        and conrelid = 'public.profiles'::regclass), false),
    'FK present; confdeltype=n (SET NULL)',
    coalesce((select 'type=' || contype::text || ' deltype=' || confdeltype::text
      from pg_constraint
      where conname = 'profiles_referred_by_fkey'
        and conrelid = 'public.profiles'::regclass), 'missing')

  -- W. invoices.private_notes (20261015100000). SKIP until pushed.
  --    Owner-only text: present with its length cap, and no public RPC reads it.
  union all
  select 'W1 invoices.private_notes column',
    case when not exists (select 1 from applied where version = '20261015100000') then null
      else exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'invoices'
            and column_name = 'private_notes' and data_type = 'text' and is_nullable = 'YES')
        and exists (select 1 from pg_constraint
          where conname = 'invoices_private_notes_len' and conrelid = 'public.invoices'::regclass) end,
    'text null + invoices_private_notes_len check',
    case when not exists (select 1 from applied where version = '20261015100000') then 'not applied yet'
      else coalesce((select data_type || ' ' || is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'invoices' and column_name = 'private_notes'), 'missing')
        || case when exists (select 1 from pg_constraint
          where conname = 'invoices_private_notes_len' and conrelid = 'public.invoices'::regclass)
          then ' +check' else ' no check' end end
  union all
  select 'W2 public RPCs never read private_notes',
    case when not exists (select 1 from applied where version = '20261015100000') then null
      else count(*) filter (where p.prosrc ilike '%private_notes%') = 0 end,
    'get_public_invoice / get_public_invoice_checkout do not mention private_notes',
    case when not exists (select 1 from applied where version = '20261015100000') then 'not applied yet'
      else coalesce(string_agg(case when p.prosrc ilike '%private_notes%' then p.proname end, ', '), '') end
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('get_public_invoice', 'get_public_invoice_checkout')

  -- X. Bank transfer (20261015200000). SKIP until pushed. X4: no client role
  --    can UPDATE or INSERT any bank column (also in B). The bank columns
  --    are on the privileged list (B): written only by /api/bank through
  --    these service-role functions. X3: the encrypted account number never
  --    reaches audit_log detail.
  union all
  select 'X1 ' || fn.f || ' ' || ro.r,
    case when not exists (select 1 from applied where version = '20261015200000') then null
      else to_regprocedure(fn.f) is not null
        and not has_function_privilege(ro.r, to_regprocedure(fn.f), 'execute') end,
    'not executable',
    case when not exists (select 1 from applied where version = '20261015200000') then 'not applied yet'
      when to_regprocedure(fn.f) is null then 'missing'
      when has_function_privilege(ro.r, to_regprocedure(fn.f), 'execute') then 'EXECUTE' else '' end
  from (values ('public.set_bank_transfer(uuid, text, text, text, text, text, boolean, text)'),
               ('public.set_bank_transfer_enabled(uuid, boolean)'),
               ('public.clear_bank_transfer(uuid)')) fn(f)
  cross join (values ('public'), ('anon'), ('authenticated')) ro(r)
  union all
  select 'X2 ' || fn.f || ' service_role',
    case when not exists (select 1 from applied where version = '20261015200000') then null
      else to_regprocedure(fn.f) is not null
        and has_function_privilege('service_role', to_regprocedure(fn.f), 'execute') end,
    'executable by service_role',
    case when not exists (select 1 from applied where version = '20261015200000') then 'not applied yet'
      when to_regprocedure(fn.f) is null then 'missing'
      when has_function_privilege('service_role', to_regprocedure(fn.f), 'execute') then 'EXECUTE' else '' end
  from (values ('public.set_bank_transfer(uuid, text, text, text, text, text, boolean, text)'),
               ('public.set_bank_transfer_enabled(uuid, boolean)'),
               ('public.clear_bank_transfer(uuid)')) fn(f)
  union all
  select 'X3 log_audit drops bank_account_enc',
    case when not exists (select 1 from applied where version = '20261015200000') then null
      else coalesce((select p.prosrc ilike '%- ''bank_account_enc''%' and p.prosrc ilike '%- ''zelle_info_enc''%'
        from pg_proc p where p.oid = to_regprocedure('public.log_audit()')), false) end,
    'audit detail excludes zelle_info_enc and bank_account_enc',
    case when not exists (select 1 from applied where version = '20261015200000') then 'not applied yet'
      when (select p.prosrc ilike '%- ''bank_account_enc''%' from pg_proc p where p.oid = to_regprocedure('public.log_audit()'))
        then '' else 'bank_account_enc not excluded' end
  union all
  select 'X4 profiles.' || c.col || ' ' || ro.r,
    case when not exists (select 1 from applied where version = '20261015200000') then null
      else exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles' and column_name = c.col)
        and not has_column_privilege(ro.r, 'public.profiles', c.col, 'UPDATE')
        and not has_column_privilege(ro.r, 'public.profiles', c.col, 'INSERT') end,
    'no client UPDATE / INSERT (written only via /api/bank)',
    case when not exists (select 1 from applied where version = '20261015200000') then 'not applied yet'
      when not exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles' and column_name = c.col) then 'missing'
      else concat_ws(' ',
        case when has_column_privilege(ro.r, 'public.profiles', c.col, 'UPDATE') then 'UPDATE' end,
        case when has_column_privilege(ro.r, 'public.profiles', c.col, 'INSERT') then 'INSERT' end) end
  from (values ('bank_holder_name'), ('bank_name'), ('bank_routing'), ('bank_account_enc'),
               ('bank_account_last4'), ('bank_account_type'), ('bank_transfer_enabled')) c(col)
  cross join (values ('anon'), ('authenticated')) ro(r)

  -- Y. Pay page bank RPC (20261016000000). SKIP until pushed. Service-role
  --    only, definer with search_path '', and the bank columns reach the
  --    public pay page through this gated function alone (Y4).
  union all
  select 'Y1 get_public_invoice_bank ' || ro.r,
    case when not exists (select 1 from applied where version = '20261016000000') then null
      else to_regprocedure('public.get_public_invoice_bank(text, text)') is not null
        and not has_function_privilege(ro.r, to_regprocedure('public.get_public_invoice_bank(text, text)'), 'execute') end,
    'not executable',
    case when not exists (select 1 from applied where version = '20261016000000') then 'not applied yet'
      when to_regprocedure('public.get_public_invoice_bank(text, text)') is null then 'missing'
      when has_function_privilege(ro.r, to_regprocedure('public.get_public_invoice_bank(text, text)'), 'execute') then 'EXECUTE' else '' end
  from (values ('public'), ('anon'), ('authenticated')) ro(r)
  union all
  select 'Y2 get_public_invoice_bank service_role',
    case when not exists (select 1 from applied where version = '20261016000000') then null
      else coalesce(has_function_privilege('service_role', to_regprocedure('public.get_public_invoice_bank(text, text)'), 'execute'), false) end,
    'executable by service_role',
    case when not exists (select 1 from applied where version = '20261016000000') then 'not applied yet'
      when to_regprocedure('public.get_public_invoice_bank(text, text)') is null then 'missing'
      when has_function_privilege('service_role', to_regprocedure('public.get_public_invoice_bank(text, text)'), 'execute') then 'EXECUTE' else '' end
  union all
  select 'Y3 get_public_invoice_bank definer + search_path',
    case when not exists (select 1 from applied where version = '20261016000000') then null
      else coalesce((select p.prosecdef and p.proconfig = array['search_path=""']
        from pg_proc p where p.oid = to_regprocedure('public.get_public_invoice_bank(text, text)')), false) end,
    'prosecdef true, search_path ""',
    case when not exists (select 1 from applied where version = '20261016000000') then 'not applied yet'
      else coalesce((select 'definer=' || p.prosecdef || ' config=' || coalesce(array_to_string(p.proconfig, ','), 'none')
        from pg_proc p where p.oid = to_regprocedure('public.get_public_invoice_bank(text, text)')), 'missing') end
  union all
  select 'Y4 other public RPCs never read bank_*',
    case when not exists (select 1 from applied where version = '20261016000000') then null
      else count(*) filter (where p.prosrc ilike '%bank_%') = 0 end,
    'get_public_invoice / get_public_invoice_checkout do not mention bank_',
    case when not exists (select 1 from applied where version = '20261016000000') then 'not applied yet'
      else coalesce(string_agg(case when p.prosrc ilike '%bank_%' then p.proname end, ', '), '') end
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('get_public_invoice', 'get_public_invoice_checkout')
  union all
  -- Y5: the gate itself. A later CREATE OR REPLACE that drops any of these
  --     predicates would expose bank details on paid / void / draft / quote
  --     invoices or for a pro who turned bank transfer off.
  select 'Y5 get_public_invoice_bank gate predicates',
    case when not exists (select 1 from applied where version = '20261016000000') then null
      else coalesce((select
            p.prosrc ilike '%i.kind = ''invoice''%'
        and p.prosrc ilike '%i.status in (''sent'', ''overdue'')%'
        and p.prosrc ilike '%i.deleted_at is null%'
        and p.prosrc ilike '%coalesce(i.amount_paid, 0) < i.total%'
        and p.prosrc ilike '%p.bank_transfer_enabled is true%'
        from pg_proc p where p.oid = to_regprocedure('public.get_public_invoice_bank(text, text)')), false) end,
    'invoice only, sent/overdue, not deleted, unpaid, enabled',
    case when not exists (select 1 from applied where version = '20261016000000') then 'not applied yet'
      else coalesce((select concat_ws(' ',
            case when p.prosrc not ilike '%i.kind = ''invoice''%' then 'no-kind' end,
            case when p.prosrc not ilike '%i.status in (''sent'', ''overdue'')%' then 'no-status' end,
            case when p.prosrc not ilike '%i.deleted_at is null%' then 'no-deleted' end,
            case when p.prosrc not ilike '%coalesce(i.amount_paid, 0) < i.total%' then 'no-unpaid' end,
            case when p.prosrc not ilike '%p.bank_transfer_enabled is true%' then 'no-enabled' end)
        from pg_proc p where p.oid = to_regprocedure('public.get_public_invoice_bank(text, text)')), 'missing') end

  -- Z. Cancel flow (20261016200000). SKIP until pushed. cancel_events is
  --    written only by the service role (/api/subscription/*); clients read
  --    their own rows. The new profiles columns are on the privileged list (B).
  union all
  select 'Z1 cancel_events RLS',
    case when not exists (select 1 from applied where version = '20261016200000') then null
      else coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.cancel_events')), false) end,
    'row level security on',
    case when not exists (select 1 from applied where version = '20261016200000') then 'not applied yet'
      else coalesce((select relrowsecurity::text from pg_class where oid = to_regclass('public.cancel_events')), 'missing') end
  union all
  select 'Z2 cancel_events ' || ro.r,
    case when not exists (select 1 from applied where version = '20261016200000') then null
      else to_regclass('public.cancel_events') is not null
        and has_table_privilege(ro.r, 'public.cancel_events', 'SELECT') = (ro.r = 'authenticated')
        and not has_table_privilege(ro.r, 'public.cancel_events', 'INSERT')
        and not has_table_privilege(ro.r, 'public.cancel_events', 'UPDATE')
        and not has_table_privilege(ro.r, 'public.cancel_events', 'DELETE')
        and not has_table_privilege(ro.r, 'public.cancel_events', 'TRUNCATE')
        and not exists (select 1 from information_schema.column_privileges
          where table_schema = 'public' and table_name = 'cancel_events'
            and grantee = ro.r and privilege_type in ('INSERT', 'UPDATE')) end,
    case when ro.r = 'authenticated' then 'SELECT only' else 'nothing' end,
    case when not exists (select 1 from applied where version = '20261016200000') then 'not applied yet'
      when to_regclass('public.cancel_events') is null then 'missing'
      else concat_ws(' ',
        case when has_table_privilege(ro.r, 'public.cancel_events', 'SELECT') then 'SELECT' end,
        case when has_table_privilege(ro.r, 'public.cancel_events', 'INSERT') then 'INSERT' end,
        case when has_table_privilege(ro.r, 'public.cancel_events', 'UPDATE') then 'UPDATE' end,
        case when has_table_privilege(ro.r, 'public.cancel_events', 'DELETE') then 'DELETE' end,
        case when has_table_privilege(ro.r, 'public.cancel_events', 'TRUNCATE') then 'TRUNCATE' end) end
  from (values ('anon'), ('authenticated')) ro(r)
  union all
  select 'Z3 cancel_events policies',
    case when not exists (select 1 from applied where version = '20261016200000') then null
      else count(*) = 1 and bool_and(pol.cmd = 'SELECT' and pol.qual ilike '%auth.uid() = user_id%') end,
    'one policy: SELECT own rows',
    case when not exists (select 1 from applied where version = '20261016200000') then 'not applied yet'
      else coalesce(string_agg(pol.policyname || ':' || pol.cmd, ', '), 'none') end
  from pg_policies pol
  where pol.schemaname = 'public' and pol.tablename = 'cancel_events'
  union all
  select 'Z4 cancel_events checks',
    case when not exists (select 1 from applied where version = '20261016200000') then null
      else count(*) = 5 end,
    'kind, reason, detail length, months, platform checks',
    case when not exists (select 1 from applied where version = '20261016200000') then 'not applied yet'
      else coalesce(string_agg(conname, ', '), 'none') end
  from pg_constraint
  where conrelid = coalesce(to_regclass('public.cancel_events'), 0::oid) and contype = 'c'
    and conname in ('cancel_events_kind_chk', 'cancel_events_reason_chk', 'cancel_events_detail_len',
                    'cancel_events_months_chk', 'cancel_events_platform_chk')
  union all
  -- AA. Feedback (20261017000000). SKIP until pushed. feedback is written only by the
  --     service role (/api/feedback); clients read their own rows.
  select 'AA1 feedback RLS',
    case when not exists (select 1 from applied where version = '20261017000000') then null
      else coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.feedback')), false) end,
    'row level security on',
    case when not exists (select 1 from applied where version = '20261017000000') then 'not applied yet'
      else coalesce((select relrowsecurity::text from pg_class where oid = to_regclass('public.feedback')), 'missing') end
  union all
  select 'AA2 feedback ' || ro.r,
    case when not exists (select 1 from applied where version = '20261017000000') then null
      else to_regclass('public.feedback') is not null
        and has_table_privilege(ro.r, 'public.feedback', 'SELECT') = (ro.r = 'authenticated')
        and not has_table_privilege(ro.r, 'public.feedback', 'INSERT')
        and not has_table_privilege(ro.r, 'public.feedback', 'UPDATE')
        and not has_table_privilege(ro.r, 'public.feedback', 'DELETE')
        and not has_table_privilege(ro.r, 'public.feedback', 'TRUNCATE')
        and not exists (select 1 from information_schema.column_privileges
          where table_schema = 'public' and table_name = 'feedback'
            and grantee = ro.r and privilege_type in ('INSERT', 'UPDATE')) end,
    case when ro.r = 'authenticated' then 'SELECT only' else 'nothing' end,
    case when not exists (select 1 from applied where version = '20261017000000') then 'not applied yet'
      when to_regclass('public.feedback') is null then 'missing'
      else concat_ws(' ',
        case when has_table_privilege(ro.r, 'public.feedback', 'SELECT') then 'SELECT' end,
        case when has_table_privilege(ro.r, 'public.feedback', 'INSERT') then 'INSERT' end,
        case when has_table_privilege(ro.r, 'public.feedback', 'UPDATE') then 'UPDATE' end,
        case when has_table_privilege(ro.r, 'public.feedback', 'DELETE') then 'DELETE' end,
        case when has_table_privilege(ro.r, 'public.feedback', 'TRUNCATE') then 'TRUNCATE' end) end
  from (values ('anon'), ('authenticated')) ro(r)
  union all
  select 'AA3 feedback policies',
    case when not exists (select 1 from applied where version = '20261017000000') then null
      else count(*) = 1 and bool_and(pol.cmd = 'SELECT' and pol.qual ilike '%auth.uid() = user_id%') end,
    'one policy: SELECT own rows',
    case when not exists (select 1 from applied where version = '20261017000000') then 'not applied yet'
      else coalesce(string_agg(pol.policyname || ':' || pol.cmd, ', '), 'none') end
  from pg_policies pol
  where pol.schemaname = 'public' and pol.tablename = 'feedback'
  union all
  select 'AA4 feedback checks',
    case when not exists (select 1 from applied where version = '20261017000000') then null
      else count(*) = 7 end,
    'tag, message length, rating, source, screen, version, status checks',
    case when not exists (select 1 from applied where version = '20261017000000') then 'not applied yet'
      else coalesce(string_agg(conname, ', '), 'none') end
  from pg_constraint
  where conrelid = coalesce(to_regclass('public.feedback'), 0::oid) and contype = 'c'
    and conname in ('feedback_tag_chk', 'feedback_message_len', 'feedback_rating_chk', 'feedback_source_chk',
                    'feedback_screen_len', 'feedback_version_len', 'feedback_status_chk')

  -- AB. Payment reversals (20261018000000): users can't write reversal rows;
  --     one sign rule; (entry_type, stripe_object_id) UNIQUE; refunded_amount
  --     pinned; reversal rows owned by the invoice's owner and pointing at a
  --     payment on the same invoice; the type list kept every live value.
  union all
  select 'AB payment reversals',
    case when not exists (select 1 from applied where version = '20261018000000') then null
      else
        exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments'
          and policyname = 'own invoice payments insert'
          and with_check ilike '%entry_type = ''payment''%' and with_check ilike '%stripe_object_id IS NULL%')
        and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments'
          and policyname = 'own invoice payments update'
          and qual ilike '%entry_type = ''payment''%' and qual ilike '%stripe_object_id IS NULL%')
        and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments'
          and policyname = 'own invoice payments delete'
          and qual ilike '%entry_type = ''payment''%' and qual ilike '%stripe_object_id IS NULL%')
        and exists (select 1 from pg_constraint where conrelid = 'public.invoice_payments'::regclass
          and conname = 'invoice_payments_amount_sign_chk')
        and exists (select 1 from pg_constraint where conrelid = 'public.invoice_payments'::regclass
          and conname = 'invoice_payments_stripe_object_key' and contype = 'u')
        and exists (select 1 from pg_trigger where tgrelid = 'public.invoices'::regclass
          and tgname = 'pin_invoice_refunded_amount' and not tgisinternal)
        and exists (select 1 from pg_constraint where conrelid = 'public.notification_log'::regclass
          and conname = 'notification_log_type_chk'
          and pg_get_constraintdef(oid) ilike '%payment_disputed%'
          and pg_get_constraintdef(oid) ilike '%recurring_skipped%'
          and pg_get_constraintdef(oid) ilike '%recap%')
        -- Run-time query: the new columns don't exist before the migration, and
        -- a direct reference would break this whole file at parse time.
        and (xpath('/row/c/text()', query_to_xml(
          'select count(*) as c from public.invoice_payments r '
          'join public.invoice_payments pp on pp.id = r.reverses_payment_id '
          'join public.invoices i on i.id = r.invoice_id '
          'where r.user_id <> i.user_id or pp.invoice_id <> r.invoice_id', false, true, '')))[1]::text = '0'
      end,
    'write policies refuse reversals; sign check; unique key; refunded_amount pinned; type list keeps recap + recurring_skipped; 0 mismatched reversals',
    case when not exists (select 1 from applied where version = '20261018000000') then 'not applied yet'
      else (xpath('/row/c/text()', query_to_xml(
        'select count(*) as c from public.invoice_payments where entry_type <> ''payment''', false, true, '')))[1]::text
        || ' reversal rows' end
  union all
  -- AC. Overpayment guard (20261019000001): a manual payment may not push the
  --     non-refund ledger sum above the invoice total. Stripe and reversal rows
  --     must stay insertable; the row's own id is excluded on UPDATE; the
  --     trigger function is SECURITY DEFINER, has no search path, and is not
  --     executable by clients. SKIP until pushed.
  select 'AC overpayment guard',
    case when not exists (select 1 from applied where version = '20261019000001') then null
      else exists (
        select 1
        from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
        where t.tgrelid = 'public.invoice_payments'::regclass
          and t.tgname = 'guard_invoice_payment_overpay'
          and not t.tgisinternal
          and t.tgtype = 23
          and pg_get_triggerdef(t.oid) ilike '%BEFORE INSERT OR UPDATE OF amount, invoice_id ON public.invoice_payments%'
          and p.prosecdef
          and 'search_path=""' = any(p.proconfig)
          and p.prosrc ilike '%entry_type <> ''payment''%'
          and p.prosrc ilike '%stripe_checkout_session_id is not null%'
          and p.prosrc ilike '%reverses_payment_id is not null%'
          and p.prosrc ilike '%p.id <> new.id%'
          and p.prosrc ilike '%for update%'
          and not has_function_privilege(
            'authenticated', 'public.guard_invoice_payment_overpay()', 'EXECUTE')
      ) end,
    'manual payments: BEFORE INSERT OR UPDATE OF amount, invoice_id; non-refund ledger sum <= total; Stripe/reversals skipped; UPDATE excludes own row; locked invoice; no client EXECUTE',
    case when not exists (select 1 from applied where version = '20261019000001') then 'not applied yet'
      else coalesce((
        select t.tgname || ': ' || pg_get_triggerdef(t.oid)
        from pg_trigger t
        where t.tgrelid = 'public.invoice_payments'::regclass
          and t.tgname = 'guard_invoice_payment_overpay'
          and not t.tgisinternal
      ), 'missing') end

  -- AD. Invoice server-owned columns (20261020000000). The trigger rejects
  --     anon/authenticated changes to amount_paid/status/paid_at and the other
  --     server timestamps; service_role and the SECURITY DEFINER ledger
  --     reconcile are unaffected. SKIP until pushed.
  union all
  select 'AD pin_invoice_server_columns trigger',
    case when not exists (select 1 from applied where version = '20261020000000') then null
      else exists (
        select 1
        from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
        where t.tgrelid = 'public.invoices'::regclass
          and t.tgname = 'pin_invoice_server_columns'
          and not t.tgisinternal
          and t.tgtype = 23
          and pg_get_triggerdef(t.oid) ilike '%BEFORE INSERT OR UPDATE OF amount_paid, status, paid_at, sent_at, first_sent_at, viewed_at, last_nudge_at ON public.invoices%'
          and not p.prosecdef
          and 'search_path=""' = any(p.proconfig)
          and p.prosrc ilike '%current_user not in (''anon'', ''authenticated'')%'
          and p.prosrc ilike '%return new%'
          and (select bool_and(
                (p.prosrc ilike ('%new.' || c.col || '%'))
                and (p.prosrc ilike ('%old.' || c.col || '%')))
              from (values ('amount_paid'), ('status'), ('paid_at'), ('sent_at'),
                           ('first_sent_at'), ('viewed_at'), ('last_nudge_at')) c(col))
      ) end,
    'BEFORE INSERT OR UPDATE OF the 7 server columns; invoker; search_path=""; client-only guard; NEW+OLD per column',
    case when not exists (select 1 from applied where version = '20261020000000') then 'not applied yet'
      else coalesce((
        select t.tgname || ': ' || pg_get_triggerdef(t.oid)
        from pg_trigger t
        where t.tgrelid = 'public.invoices'::regclass
          and t.tgname = 'pin_invoice_server_columns'
          and not t.tgisinternal
      ), 'missing') end

  -- AE. The lock function is invoker-only and cannot be called directly by
  --     clients; the ledger reconcile remains a SECURITY DEFINER helper.
  union all
  select 'AE pin trigger function privileges',
    case when not exists (select 1 from applied where version = '20261020000000') then null
      else coalesce((
        select not has_function_privilege('anon', p.oid, 'execute')
          and not has_function_privilege('authenticated', p.oid, 'execute')
          and not has_function_privilege('public', p.oid, 'execute')
        from pg_proc p
        where p.oid = to_regprocedure('public.pin_invoice_server_columns()')
      ), false)
      and coalesce((
        select p.prosecdef and 'search_path=""' = any(p.proconfig)
        from pg_proc p
        where p.oid = to_regprocedure('public.reconcile_invoice_from_ledger(uuid)')
      ), false)
    end,
    'no anon/authenticated/PUBLIC EXECUTE; ledger reconcile still SECURITY DEFINER, search_path=""',
    case when not exists (select 1 from applied where version = '20261020000000') then 'not applied yet'
      else coalesce((
        select 'definer=' || p.prosecdef
          || ' config=' || coalesce(array_to_string(p.proconfig, ','), 'none')
          || ' anon=' || has_function_privilege('anon', p.oid, 'execute')::text
          || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')::text
        from pg_proc p
        where p.oid = to_regprocedure('public.pin_invoice_server_columns()')
      ), 'missing') end

  -- AF. invoice_attachments client ACL (20261020000001): anon has nothing;
  --     authenticated has SELECT/INSERT/DELETE and no UPDATE/TRUNCATE.
  --     SKIP until pushed.
  union all
  select 'AF invoice_attachments client ACL',
    case when not exists (select 1 from applied where version = '20261020000001') then null
      else to_regclass('public.invoice_attachments') is not null
        and (select bool_and(
              has_table_privilege(r.role, 'public.invoice_attachments', 'SELECT') = r.sel
              and has_table_privilege(r.role, 'public.invoice_attachments', 'INSERT') = r.ins
              and not has_table_privilege(r.role, 'public.invoice_attachments', 'UPDATE')
              and has_table_privilege(r.role, 'public.invoice_attachments', 'DELETE') = r.del
              and not has_table_privilege(r.role, 'public.invoice_attachments', 'TRUNCATE'))
            from (values ('anon', false, false, false),
                         ('authenticated', true, true, true)) r(role, sel, ins, del))
        and not exists (
          select 1 from information_schema.column_privileges cp
          where cp.table_schema = 'public'
            and cp.table_name = 'invoice_attachments'
            and cp.grantee in ('anon', 'authenticated')
            and cp.privilege_type = 'UPDATE')
    end,
    'anon none; authenticated SELECT/INSERT/DELETE; no UPDATE/TRUNCATE',
    case when not exists (select 1 from applied where version = '20261020000001') then 'not applied yet'
      when to_regclass('public.invoice_attachments') is null then 'missing'
      else coalesce((
        select string_agg(r.role || ': ' || concat_ws('/',
          case when has_table_privilege(r.role, 'public.invoice_attachments', 'SELECT') then 'SELECT' end,
          case when has_table_privilege(r.role, 'public.invoice_attachments', 'INSERT') then 'INSERT' end,
          case when has_table_privilege(r.role, 'public.invoice_attachments', 'UPDATE') then 'UPDATE' end,
          case when has_table_privilege(r.role, 'public.invoice_attachments', 'DELETE') then 'DELETE' end,
          case when has_table_privilege(r.role, 'public.invoice_attachments', 'TRUNCATE') then 'TRUNCATE' end),
          ', ' order by r.role)
        from (values ('anon'), ('authenticated')) r(role)
      ), 'none') end

  -- AG. The old FOR ALL policy is replaced by three owner-only policies, so
  --     even a future UPDATE grant cannot enable in-place row edits.
  union all
  select 'AG invoice_attachments policies',
    case when not exists (select 1 from applied where version = '20261020000001') then null
      else coalesce((select relrowsecurity from pg_class
        where oid = to_regclass('public.invoice_attachments')), false)
        and (select count(*) from pg_policies
          where schemaname = 'public' and tablename = 'invoice_attachments') = 3
        and exists (select 1 from pg_policies
          where schemaname = 'public' and tablename = 'invoice_attachments'
            and policyname = 'own invoice attachments select' and cmd = 'SELECT'
            and qual ilike '%auth.uid() = user_id%')
        and exists (select 1 from pg_policies
          where schemaname = 'public' and tablename = 'invoice_attachments'
            and policyname = 'own invoice attachments insert' and cmd = 'INSERT'
            and with_check ilike '%auth.uid() = user_id%')
        and exists (select 1 from pg_policies
          where schemaname = 'public' and tablename = 'invoice_attachments'
            and policyname = 'own invoice attachments delete' and cmd = 'DELETE'
            and qual ilike '%auth.uid() = user_id%')
        and not exists (select 1 from pg_policies
          where schemaname = 'public' and tablename = 'invoice_attachments'
            and cmd in ('UPDATE', 'ALL'))
    end,
    'RLS on; 3 owner-only policies SELECT/INSERT/DELETE; no UPDATE/FOR ALL',
    case when not exists (select 1 from applied where version = '20261020000001') then 'not applied yet'
      else coalesce((
        select string_agg(policyname || ':' || cmd, ', ' order by policyname)
        from pg_policies
        where schemaname = 'public' and tablename = 'invoice_attachments'
      ), 'missing') end

  -- AH. service_role keeps row management, the bucket stays private, and the
  --     three owner-scoped storage policies still have no UPDATE/ALL.
  union all
  select 'AH attachment service_role + storage',
    case when not exists (select 1 from applied where version = '20261020000001') then null
      else to_regclass('public.invoice_attachments') is not null
        and has_table_privilege('service_role', 'public.invoice_attachments', 'SELECT')
        and has_table_privilege('service_role', 'public.invoice_attachments', 'INSERT')
        and has_table_privilege('service_role', 'public.invoice_attachments', 'UPDATE')
        and has_table_privilege('service_role', 'public.invoice_attachments', 'DELETE')
        and exists (select 1 from storage.buckets b
          where b.id = 'invoice-attachments' and not b.public)
        and (select count(*) from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'invoice attachments%') = 3
        and exists (select 1 from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'invoice attachments%' and cmd = 'SELECT')
        and exists (select 1 from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'invoice attachments%' and cmd = 'INSERT')
        and exists (select 1 from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'invoice attachments%' and cmd = 'DELETE')
        and not exists (select 1 from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'invoice attachments%' and cmd in ('UPDATE', 'ALL'))
    end,
    'service_role SELECT/INSERT/UPDATE/DELETE; private bucket; 3 owner storage policies, no UPDATE/ALL',
    case when not exists (select 1 from applied where version = '20261020000001') then 'not applied yet'
      else concat_ws('; ',
        'bucket=' || coalesce((select case when b.public then 'public' else 'private' end
          from storage.buckets b where b.id = 'invoice-attachments'), 'missing'),
        'storage_policies=' || coalesce((select string_agg(policyname || ':' || cmd, ', ' order by policyname)
          from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'invoice attachments%'), 'none'))
      end

  -- AI. Quote signed (20261022120000). SKIP until pushed.
  --     approved_at is the manual signed stamp; the owner writes it, so the
  --     column must stay nullable and keep authenticated UPDATE.
  union all
  select 'AI quote approved_at',
    case when not exists (select 1 from applied where version = '20261022120000') then null
      else exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'invoices'
            and column_name = 'approved_at'
            and data_type = 'timestamp with time zone'
            and is_nullable = 'YES')
        and coalesce((select has_column_privilege('authenticated', 'public.invoices', a.attname, 'UPDATE')
          from pg_attribute a
          where a.attrelid = 'public.invoices'::regclass
            and a.attname = 'approved_at' and not a.attisdropped), false)
    end,
    'invoices.approved_at timestamptz null; authenticated UPDATE',
    case when not exists (select 1 from applied where version = '20261022120000') then 'not applied yet'
      else coalesce((select data_type || ' ' || is_nullable
          from information_schema.columns
          where table_schema = 'public' and table_name = 'invoices'
            and column_name = 'approved_at'), 'missing')
        || ' authenticated_update=' || coalesce((select has_column_privilege('authenticated', 'public.invoices', a.attname, 'UPDATE')
          from pg_attribute a
          where a.attrelid = 'public.invoices'::regclass
            and a.attname = 'approved_at' and not a.attisdropped), false)
    end

  -- AJ–AR. Estimates data layer (20261023100000 / 20261023100100). SKIP until pushed.
  union all
  select 'AJ estimate columns',
    case when not exists (select 1 from applied where version = '20261023100000') then null
      else exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'invoices'
            and column_name = 'valid_until' and data_type = 'date' and is_nullable = 'YES')
        and exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'invoices'
            and column_name = 'revoked_at' and data_type = 'timestamp with time zone' and is_nullable = 'YES')
    end,
    'invoices.valid_until date null; invoices.revoked_at timestamptz null',
    case when not exists (select 1 from applied where version = '20261023100000') then 'not applied yet'
      else coalesce((select string_agg(column_name || ' ' || data_type || ' ' || is_nullable, '; ' order by column_name)
        from information_schema.columns
        where table_schema = 'public' and table_name = 'invoices'
          and column_name in ('valid_until', 'revoked_at')), 'missing') end
  union all
  select 'AK estimate_signatures',
    case when not exists (select 1 from applied where version = '20261023100000') then null
      else to_regclass('public.estimate_signatures') is not null
        and coalesce((select relrowsecurity from pg_class
          where oid = to_regclass('public.estimate_signatures')), false)
        and (select count(*) from pg_policies
          where schemaname = 'public' and tablename = 'estimate_signatures') = 1
        and exists (select 1 from pg_policies
          where schemaname = 'public' and tablename = 'estimate_signatures'
            and cmd = 'SELECT' and qual ilike '%auth.uid()%')
        and has_table_privilege('authenticated', 'public.estimate_signatures', 'SELECT')
        and not has_table_privilege('authenticated', 'public.estimate_signatures', 'INSERT')
        and not has_table_privilege('authenticated', 'public.estimate_signatures', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.estimate_signatures', 'DELETE')
        and not has_table_privilege('anon', 'public.estimate_signatures', 'SELECT')
        and not has_table_privilege('anon', 'public.estimate_signatures', 'INSERT')
        and not has_table_privilege('anon', 'public.estimate_signatures', 'UPDATE')
        and not has_table_privilege('anon', 'public.estimate_signatures', 'DELETE')
    end,
    'RLS on; 1 owner SELECT policy; authenticated SELECT only; anon none',
    case when not exists (select 1 from applied where version = '20261023100000') then 'not applied yet'
      when to_regclass('public.estimate_signatures') is null then 'missing'
      else concat_ws('; ',
        'rls=' || (select relrowsecurity from pg_class where oid = to_regclass('public.estimate_signatures')),
        'policies=' || coalesce((select string_agg(policyname || ':' || cmd, ', ' order by policyname)
          from pg_policies where schemaname = 'public' and tablename = 'estimate_signatures'), 'none'),
        'auth_sel=' || has_table_privilege('authenticated', 'public.estimate_signatures', 'SELECT'),
        'auth_ins=' || has_table_privilege('authenticated', 'public.estimate_signatures', 'INSERT'),
        'auth_upd=' || has_table_privilege('authenticated', 'public.estimate_signatures', 'UPDATE'),
        'auth_del=' || has_table_privilege('authenticated', 'public.estimate_signatures', 'DELETE'),
        'anon_sel=' || has_table_privilege('anon', 'public.estimate_signatures', 'SELECT')) end
  union all
  select 'AL attachment verification',
    case when not exists (select 1 from applied where version = '20261023100000') then null
      else (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'invoice_attachments'
            and column_name in ('mime_type', 'size_bytes', 'checksum') and is_nullable = 'YES') = 3
        and exists (select 1 from pg_constraint where conrelid = 'public.invoice_attachments'::regclass
          and conname = 'invoice_attachments_mime_chk')
        and exists (select 1 from pg_constraint where conrelid = 'public.invoice_attachments'::regclass
          and conname = 'invoice_attachments_size_chk')
        and exists (select 1 from pg_constraint where conrelid = 'public.invoice_attachments'::regclass
          and conname = 'invoice_attachments_checksum_chk')
    end,
    'mime_type/size_bytes/checksum nullable + mime/size/checksum checks',
    case when not exists (select 1 from applied where version = '20261023100000') then 'not applied yet'
      else coalesce((select string_agg(column_name || ' ' || data_type || ' ' || is_nullable, '; ' order by column_name)
        from information_schema.columns
        where table_schema = 'public' and table_name = 'invoice_attachments'
          and column_name in ('mime_type', 'size_bytes', 'checksum')), 'missing')
        || ' checks=' || coalesce((select string_agg(conname, ',' order by conname)
          from pg_constraint where conrelid = 'public.invoice_attachments'::regclass
            and conname in ('invoice_attachments_mime_chk', 'invoice_attachments_size_chk', 'invoice_attachments_checksum_chk')), 'none') end
  union all
  select 'AM ' || f.sig,
    case when not exists (select 1 from applied where version = '20261023100000') then null
      when to_regprocedure(f.sig) is null then false
      else coalesce((select p.prosecdef = f.definer and 'search_path=""' = any(p.proconfig)
        from pg_proc p where p.oid = to_regprocedure(f.sig)), false)
        and not has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE')
        and not has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE')
    end,
    case when f.definer then 'SECURITY DEFINER, search_path="", not executable by anon/authenticated'
      else 'search_path="", not executable by anon/authenticated' end,
    case when not exists (select 1 from applied where version = '20261023100000') then 'not applied yet'
      when to_regprocedure(f.sig) is null then 'missing'
      else 'definer=' || (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(f.sig))
        || ' config=' || coalesce((select p.proconfig::text from pg_proc p where p.oid = to_regprocedure(f.sig)), 'none')
        || ' anon=' || has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE')
        || ' auth=' || has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE') end
  from (values
    ('public.estimate_tz(text)', false),
    ('public.estimate_expires_at(date, text)', false),
    ('public.estimate_content_hash(uuid)', true)
  ) f(sig, definer)
  union all
  select 'AN notification estimate_approved',
    case when not exists (select 1 from applied where version = '20261023100100') then null
      else coalesce((select pg_get_constraintdef(oid) ilike '%estimate_approved%'
          and pg_get_constraintdef(oid) ilike '%payment_disputed%'
          and pg_get_constraintdef(oid) ilike '%recurring_skipped%'
        from pg_constraint
        where conrelid = 'public.notification_log'::regclass and conname = 'notification_log_type_chk'), false) end,
    'type check keeps payment_disputed and adds estimate_approved',
    case when not exists (select 1 from applied where version = '20261023100100') then 'not applied yet'
      else coalesce((select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.notification_log'::regclass and conname = 'notification_log_type_chk'), 'missing') end
  union all
  select 'AO estimate pin trigger',
    case when not exists (select 1 from applied where version = '20261023100100') then null
      else exists (select 1 from pg_trigger t
        where t.tgrelid = 'public.invoices'::regclass and t.tgname = 'pin_invoice_server_columns'
          and pg_get_triggerdef(t.oid) ilike '%approved_at%'
          and pg_get_triggerdef(t.oid) ilike '%valid_until%'
          and pg_get_triggerdef(t.oid) ilike '%revoked_at%'
          and pg_get_triggerdef(t.oid) ilike '%public_token%') end,
    'pin_invoice_server_columns covers approved_at, valid_until, revoked_at, public_token',
    case when not exists (select 1 from applied where version = '20261023100100') then 'not applied yet'
      else coalesce((select pg_get_triggerdef(t.oid) from pg_trigger t
        where t.tgrelid = 'public.invoices'::regclass and t.tgname = 'pin_invoice_server_columns'), 'missing') end
  union all
  select 'AP estimate guards',
    case when not exists (select 1 from applied where version = '20261023100100') then null
      else (select count(*) from pg_trigger t
        where not t.tgisinternal and t.tgname in ('guard_locked_estimate_edits', 'guard_locked_estimate_attachments')) = 2 end,
    'guard_locked_estimate_edits + guard_locked_estimate_attachments installed',
    case when not exists (select 1 from applied where version = '20261023100100') then 'not applied yet'
      else coalesce((select string_agg(t.tgname, ', ' order by t.tgname) from pg_trigger t
        where not t.tgisinternal and t.tgname in ('guard_locked_estimate_edits', 'guard_locked_estimate_attachments')), 'none') end
  union all
  select 'AQ attachment position 0..9',
    case when not exists (select 1 from applied where version = '20261023100100') then null
      else coalesce((select pg_get_constraintdef(oid) ilike '%position >= 0%'
          and pg_get_constraintdef(oid) ilike '%position <= 9%'
        from pg_constraint
        where conrelid = 'public.invoice_attachments'::regclass and conname = 'invoice_attachments_position_check'), false) end,
    'position between 0 and 9',
    case when not exists (select 1 from applied where version = '20261023100100') then 'not applied yet'
      else coalesce((select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.invoice_attachments'::regclass and conname = 'invoice_attachments_position_check'), 'missing') end
  union all
  select 'AR ' || f.sig,
    case when not exists (select 1 from applied where version = '20261023100100') then null
      when to_regprocedure(f.sig) is null then false
      else coalesce((select p.prosecdef and 'search_path=""' = any(p.proconfig)
        from pg_proc p where p.oid = to_regprocedure(f.sig)), false)
        and not has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE')
        and not has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE')
    end,
    'SECURITY DEFINER, search_path="", not executable by anon/authenticated',
    case when not exists (select 1 from applied where version = '20261023100100') then 'not applied yet'
      when to_regprocedure(f.sig) is null then 'missing'
      else 'definer=' || (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(f.sig))
        || ' config=' || coalesce((select p.proconfig::text from pg_proc p where p.oid = to_regprocedure(f.sig)), 'none')
        || ' anon=' || has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE')
        || ' auth=' || has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE') end
  from (values
    ('public.sign_estimate(text, text, text, text, text, text, text, text, text)'),
    ('public.add_estimate_attachment(uuid, uuid, text, text, bigint, text)')
  ) f(sig)
)
select id as check_id,
  case when ok then 'PASS' when actual = 'not applied yet' then 'SKIP' else 'FAIL' end as result,
  expected,
  coalesce(nullif(actual, ''), '—') as found
from results
order by id;
