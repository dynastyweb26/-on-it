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
  ('stripe_payouts_enabled'), ('created_at')
),
-- Profiles columns onboarding may INSERT (B). Every other column: no INSERT.
onboarding(col) as (values
  ('id'), ('business_name'), ('trade_type'), ('website_url'), ('slogan'),
  ('logo_url'), ('brand_colors'), ('background_color'), ('invoice_template')
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
)
select id as check_id,
  case when ok then 'PASS' when actual = 'not applied yet' then 'SKIP' else 'FAIL' end as result,
  expected,
  coalesce(nullif(actual, ''), '—') as found
from results
order by id;
