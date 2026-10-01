// Builds supabase/tests/paywall_v2_validation.sql from the paywall v2
// migrations (invoice cap, expense cap, founder code), so the embedded copy
// can never drift from the real files.
//
//   node scripts/build-paywall-validation.mjs
//
// The output is ONE DO statement: it EXECUTEs the migrations, runs the cap and
// founder-code tests against throwaway users (random ids, never a real
// account), then
// RAISEs an error whose message is the test report. A single statement that
// ends in an error always rolls back completely, however the SQL Editor
// executes it — nothing is ever committed.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = [
  'supabase/migrations/20261001000001_paywall_v2_invoice_cap.sql',
  'supabase/migrations/20261001000002_paywall_v2_expense_cap.sql',
  'supabase/migrations/20261001000003_founder_code.sql',
];
const OUT = 'supabase/tests/paywall_v2_validation.sql';

const bodies = await Promise.all(MIGRATIONS.map((f) => readFile(path.join(root, f), 'utf8')));
bodies.forEach((b, i) => {
  if (b.includes(`$mig${i + 1}$`) || b.includes('$validate$')) {
    throw new Error(`${MIGRATIONS[i]} contains a reserved dollar-quote tag`);
  }
});

// The rollback file (caps → 1,000,000), applied after the cap tests to prove
// it actually lifts them.
const ROLLBACK = 'supabase/rollbacks/paywall_v2_rollback.sql';
const rollback = await readFile(path.join(root, ROLLBACK), 'utf8');
if (rollback.includes('$rollback$') || rollback.includes('$validate$')) {
  throw new Error(`${ROLLBACK} contains a reserved dollar-quote tag`);
}

// How many PASS/FAIL lines a complete run reports: one per assertion. A test
// block that dies early reports fewer, so a skipped test shows up as a count
// mismatch. UPDATE THIS when adding or removing a test.
const EXPECTED_TESTS = 22;

const tests = String.raw`
  -- ── Throwaway users (random ids: never a real account) ──────
  insert into auth.users (id, email) values
    (free_u, 'paywall-validation-free-' || free_u || '@example.invalid'),
    (founder_u, 'paywall-validation-founder-' || founder_u || '@example.invalid');
  insert into public.profiles (id, business_name, access_tier) values
    (free_u, 'Paywall validation (free)', 'free'),
    (founder_u, 'Paywall validation (founder)', 'founder');

  -- ── Free user: invoices (free limit 3) ─────────────────────
  begin
    insert into public.invoices (user_id, client_name, kind) values (free_u, 'Validation client 1', 'invoice');
    insert into public.invoices (user_id, client_name, kind) values (free_u, 'Validation client 2', 'invoice');
    insert into public.invoices (user_id, client_name, kind) values (free_u, 'Validation client 3', 'invoice');
    report := array_append(report, 'PASS  free: invoices 1-3 allowed'); passed := passed + 1;
  exception when others then
    report := array_append(report, ('FAIL  free: invoices 1-3 rejected: ' || sqlerrm)); failed := failed + 1;
  end;

  begin
    insert into public.invoices (user_id, client_name, kind) values (free_u, 'Validation client 4', 'invoice');
    report := array_append(report, 'FAIL  free: 4th invoice was ALLOWED'); failed := failed + 1;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint = 'PAYWALL_LIMIT' then
      report := array_append(report, 'PASS  free: 4th invoice rejected (PAYWALL_LIMIT)'); passed := passed + 1;
    else
      report := array_append(report, ('FAIL  free: 4th invoice rejected for the wrong reason: ' || sqlerrm)); failed := failed + 1;
    end if;
  end;

  begin
    insert into public.invoices (user_id, client_name, kind) values (free_u, 'Validation quote', 'quote');
    report := array_append(report, 'PASS  free: quote allowed past the invoice cap (quotes never count)'); passed := passed + 1;
  exception when others then
    report := array_append(report, ('FAIL  free: quote rejected: ' || sqlerrm)); failed := failed + 1;
  end;

  -- ── Free user: expenses (free limit 5; soft delete refunds nothing) ──
  begin
    insert into public.expenses (user_id, amount) values (free_u, 10);
    insert into public.expenses (user_id, amount) values (free_u, 20);
    insert into public.expenses (user_id, amount) values (free_u, 30);
    insert into public.expenses (user_id, amount) values (free_u, 40);
    insert into public.expenses (user_id, amount) values (free_u, 50) returning id into v_id;
    update public.expenses set deleted_at = now() where id = v_id;
    report := array_append(report, 'PASS  free: expenses 1-5 allowed (5th then soft-deleted)'); passed := passed + 1;
  exception when others then
    report := array_append(report, ('FAIL  free: expenses 1-5 rejected: ' || sqlerrm)); failed := failed + 1;
  end;

  begin
    insert into public.expenses (user_id, amount) values (free_u, 60);
    report := array_append(report, 'FAIL  free: 6th expense was ALLOWED (soft-deleted row must still count)'); failed := failed + 1;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint = 'PAYWALL_LIMIT_EXPENSE' then
      report := array_append(report, 'PASS  free: 6th expense rejected (PAYWALL_LIMIT_EXPENSE), soft-deleted row still counted'); passed := passed + 1;
    else
      report := array_append(report, ('FAIL  free: 6th expense rejected for the wrong reason: ' || sqlerrm)); failed := failed + 1;
    end if;
  end;

  -- ── Founder: unlimited (past both free limits) ──────────────
  begin
    insert into public.invoices (user_id, client_name, kind) values (founder_u, 'Founder client 1', 'invoice');
    insert into public.invoices (user_id, client_name, kind) values (founder_u, 'Founder client 2', 'invoice');
    insert into public.invoices (user_id, client_name, kind) values (founder_u, 'Founder client 3', 'invoice');
    insert into public.invoices (user_id, client_name, kind) values (founder_u, 'Founder client 4', 'invoice');
    report := array_append(report, 'PASS  founder: 4 invoices allowed'); passed := passed + 1;
  exception when others then
    report := array_append(report, ('FAIL  founder: invoice rejected: ' || sqlerrm)); failed := failed + 1;
  end;

  begin
    insert into public.expenses (user_id, amount) values (founder_u, 1);
    insert into public.expenses (user_id, amount) values (founder_u, 2);
    insert into public.expenses (user_id, amount) values (founder_u, 3);
    insert into public.expenses (user_id, amount) values (founder_u, 4);
    insert into public.expenses (user_id, amount) values (founder_u, 5);
    insert into public.expenses (user_id, amount) values (founder_u, 6);
    report := array_append(report, 'PASS  founder: 6 expenses allowed'); passed := passed + 1;
  exception when others then
    report := array_append(report, ('FAIL  founder: expense rejected: ' || sqlerrm)); failed := failed + 1;
  end;

  -- ── created_at can't be backdated (insert or update) ────────
  begin
    insert into public.expenses (user_id, amount, created_at) values (founder_u, 4, '2000-01-01')
      returning id, created_at into v_id, v_ts;
    if v_ts >= public.paywall_reset_at() then
      report := array_append(report, 'PASS  backdated created_at on insert is replaced by now()'); passed := passed + 1;
    else
      report := array_append(report, ('FAIL  insert kept backdated created_at ' || v_ts)); failed := failed + 1;
    end if;
    update public.expenses set created_at = '2000-01-01' where id = v_id returning created_at into v_ts;
    if v_ts >= public.paywall_reset_at() then
      report := array_append(report, 'PASS  created_at unchanged by update (expenses)'); passed := passed + 1;
    else
      report := array_append(report, ('FAIL  expense update backdated created_at to ' || v_ts)); failed := failed + 1;
    end if;
    update public.invoices set created_at = '2000-01-01'
      where id = (select id from public.invoices where user_id = founder_u limit 1)
      returning created_at into v_ts;
    if v_ts >= public.paywall_reset_at() then
      report := array_append(report, 'PASS  created_at unchanged by update (invoices)'); passed := passed + 1;
    else
      report := array_append(report, ('FAIL  invoice update backdated created_at to ' || v_ts)); failed := failed + 1;
    end if;
  exception when others then
    report := array_append(report, ('FAIL  created_at checks errored: ' || sqlerrm)); failed := failed + 1;
  end;

  -- ══ Rollback lifts the caps ═════════════════════════════════
  -- The free user is at 3 invoices + 5 expenses (one soft-deleted) here.
  execute $rollback$
__ROLLBACK_SQL__
$rollback$;

  begin
    insert into public.invoices (user_id, client_name, kind) values (free_u, 'Validation client 4 (after rollback)', 'invoice');
    report := array_append(report, 'PASS  rollback: free user''s 4th invoice now allowed'); passed := passed + 1;
  exception when others then
    report := array_append(report, ('FAIL  rollback: 4th invoice still rejected: ' || sqlerrm)); failed := failed + 1;
  end;

  begin
    insert into public.expenses (user_id, amount) values (free_u, 60);
    report := array_append(report, 'PASS  rollback: free user''s 6th expense now allowed'); passed := passed + 1;
  exception when others then
    report := array_append(report, ('FAIL  rollback: 6th expense still rejected: ' || sqlerrm)); failed := failed + 1;
  end;

  -- ══ Founder code (20261001000003) ═══════════════════════════
  insert into auth.users (id, email) values
    (code_u1, 'paywall-validation-code1-' || code_u1 || '@example.invalid'),
    (code_u2, 'paywall-validation-code2-' || code_u2 || '@example.invalid'),
    (code_u3, 'paywall-validation-code3-' || code_u3 || '@example.invalid');
  insert into public.profiles (id, business_name, access_tier) values
    (code_u1, 'Paywall validation (code 1)', 'free'),
    (code_u2, 'Paywall validation (code 2)', 'free'),
    (code_u3, 'Paywall validation (code 3)', 'canceled');

  -- Exact match grants founder.
  v_status := public.redeem_grant_for(code_u1, 'JesusisKing');
  select access_tier, granted_via into v_tier, v_text from public.profiles where id = code_u1;
  if v_status = 'ok' and v_tier = 'founder' and v_text = 'JesusisKing' then
    report := array_append(report, 'PASS  code: exact "JesusisKing" redeemed, tier founder'); passed := passed + 1;
  else
    report := array_append(report, format('FAIL  code: exact match -> %s, tier %s, via %s', v_status, v_tier, v_text)); failed := failed + 1;
  end if;

  -- Wrong case is rejected (and costs nothing).
  v_status := public.redeem_grant_for(code_u2, 'jesusisking');
  select access_tier into v_tier from public.profiles where id = code_u2;
  if v_status = 'invalid' and v_tier = 'free' then
    report := array_append(report, 'PASS  code: "jesusisking" (wrong case) rejected'); passed := passed + 1;
  else
    report := array_append(report, format('FAIL  code: wrong case -> %s, tier %s', v_status, v_tier)); failed := failed + 1;
  end if;

  -- An existing founder is refused (doesn't burn a use).
  select use_count into v_count from public.access_grants where token = 'JesusisKing';
  v_status := public.redeem_grant_for(founder_u, 'JesusisKing');
  if v_status = 'already_founder'
     and (select use_count from public.access_grants where token = 'JesusisKing') = v_count then
    report := array_append(report, 'PASS  code: existing founder refused, no use spent'); passed := passed + 1;
  else
    report := array_append(report, ('FAIL  code: existing founder -> ' || v_status)); failed := failed + 1;
  end if;

  -- Repeat redemption by the same user is rejected even if they lost founder.
  update public.profiles set access_tier = 'free' where id = code_u1;
  v_status := public.redeem_grant_for(code_u1, 'JesusisKing');
  if v_status = 'already_redeemed' then
    report := array_append(report, 'PASS  code: repeat redemption by the same user rejected'); passed := passed + 1;
  else
    report := array_append(report, ('FAIL  code: repeat redemption -> ' || v_status)); failed := failed + 1;
  end if;

  -- Cap: a throwaway code with max_uses = 1.
  insert into public.access_grants (token, label, access_tier, max_uses)
    values ('ValidationCap1', 'validation cap test', 'founder', 1);
  v_status := public.redeem_grant_for(code_u2, 'ValidationCap1');
  v_text := public.redeem_grant_for(code_u3, 'ValidationCap1');
  select use_count into v_count from public.access_grants where token = 'ValidationCap1';
  if v_status = 'ok' and v_text = 'invalid' and v_count = 1 then
    report := array_append(report, 'PASS  code: cap enforced (1st of max_uses=1 ok, 2nd rejected, use_count 1)'); passed := passed + 1;
  else
    report := array_append(report, format('FAIL  code: cap -> first %s, second %s, use_count %s', v_status, v_text, v_count)); failed := failed + 1;
  end if;

  -- ── As a real client (role authenticated, a session for code_u3) ──
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', code_u3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    begin
      perform public.redeem_grant_for(code_u3, 'JesusisKing');
      report := array_append(report, 'FAIL  client: redeem_grant_for is EXECUTABLE by authenticated'); failed := failed + 1;
    exception when insufficient_privilege then
      report := array_append(report, 'PASS  client: redeem_grant_for not executable'); passed := passed + 1;
    end;

    begin
      perform public.redeem_grant('JesusisKing');
      report := array_append(report, 'FAIL  client: redeem_grant is EXECUTABLE by authenticated'); failed := failed + 1;
    exception when insufficient_privilege then
      report := array_append(report, 'PASS  client: redeem_grant (old RPC) not executable'); passed := passed + 1;
    end;

    begin
      select count(*) into v_count from public.access_grants;
      if v_count = 0 then
        report := array_append(report, 'PASS  client: access_grants returns no rows (codes and counts hidden)'); passed := passed + 1;
      else
        report := array_append(report, ('FAIL  client: can read ' || v_count || ' access_grants rows')); failed := failed + 1;
      end if;
    exception when insufficient_privilege then
      report := array_append(report, 'PASS  client: access_grants not readable'); passed := passed + 1;
    end;

    begin
      update public.access_grants set max_uses = 1000000;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then
        report := array_append(report, 'PASS  client: access_grants can''t be changed (0 rows updated)'); passed := passed + 1;
      else
        report := array_append(report, ('FAIL  client: updated ' || v_rows || ' access_grants rows')); failed := failed + 1;
      end if;
    exception when insufficient_privilege then
      report := array_append(report, 'PASS  client: access_grants can''t be changed'); passed := passed + 1;
    end;

    begin
      select count(*) into v_count from public.grant_redemptions;
      report := array_append(report, ('FAIL  client: grant_redemptions is readable (' || v_count || ' rows)')); failed := failed + 1;
    exception when insufficient_privilege then
      report := array_append(report, 'PASS  client: grant_redemptions not readable'); passed := passed + 1;
    end;

    execute 'reset role';
  exception when others then
    execute 'reset role';
    report := array_append(report, ('FAIL  client checks errored: ' || sqlerrm)); failed := failed + 1;
  end;
`;

const out = `-- ═══════════════════════════════════════════════════════════════
-- Paywall v2 validation (caps + founder code) — run in the Supabase SQL Editor.
-- NOTHING PERSISTS.
--
-- GENERATED by scripts/build-paywall-validation.mjs from:
${MIGRATIONS.map((m) => `--   ${m}`).join('\n')}
--   supabase/rollbacks/paywall_v2_rollback.sql (applied after the cap tests)
-- Regenerate after changing any of them.
--
-- How it stays safe: this whole file is ONE DO statement. It applies the
-- migrations, tests them against throwaway users (random ids, emails
-- @example.invalid — never a real account), and then deliberately raises an
-- error. A statement that errors is rolled back completely, so the migrations,
-- the users and every test row disappear, however the editor runs it.
--
-- Expected output: an ERROR whose message starts "PAYWALL VALIDATION" and
-- lists one PASS/FAIL line per test. That error is the report, not a problem.
-- It briefly takes the same table locks as the real push; run it at a quiet
-- moment.
-- ═══════════════════════════════════════════════════════════════

do $validate$
declare
  free_u    uuid := gen_random_uuid();
  founder_u uuid := gen_random_uuid();
  report    text[] := '{}';
  passed    int := 0;
  failed    int := 0;
  code_u1   uuid := gen_random_uuid();
  code_u2   uuid := gen_random_uuid();
  code_u3   uuid := gen_random_uuid();
  v_hint    text;
  v_id      uuid;
  v_ts      timestamptz;
  v_status  text;
  v_text    text;
  v_tier    text;
  v_count   int;
  v_rows    int;
begin
  -- ── The migrations, exactly as they will be pushed ─────────
${bodies.map((b, i) => `  execute $mig${i + 1}$\n${b}\n$mig${i + 1}$;`).join('\n\n')}
${tests.replace('__ROLLBACK_SQL__', () => rollback)}
  -- ── Report, then roll everything back ───────────────────────
  -- The count lines make a silently skipped test visible: a block that dies
  -- early reports fewer lines than expected.
  raise exception '%', format(
    E'PAYWALL VALIDATION: %s passed, %s failed, %s expected%s (everything rolled back)\\n%s\\nTOTAL: PASS %s / FAIL %s / expected %s%s',
    passed, failed, ${EXPECTED_TESTS},
    case when passed + failed <> ${EXPECTED_TESTS} then ' — COUNT MISMATCH' else '' end,
    array_to_string(report, E'\\n'),
    passed, failed, ${EXPECTED_TESTS},
    case when passed + failed <> ${EXPECTED_TESTS} then ' — COUNT MISMATCH: a test did not report' else '' end);
end
$validate$;
`;

// Guard: text[] || 'literal' makes Postgres parse the literal as an ARRAY
// (22P02 malformed array literal). Report lines must use array_append().
if (out.includes('report := report ||')) {
  throw new Error("generated script uses 'report := report ||' — use array_append(report, ...)");
}

await writeFile(path.join(root, OUT), out);
console.log(`wrote ${OUT}`);
