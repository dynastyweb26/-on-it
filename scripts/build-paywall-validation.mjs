// Builds supabase/tests/paywall_v2_validation.sql from the two paywall v2
// cap migrations, so the embedded copy can never drift from the real files.
//
//   node scripts/build-paywall-validation.mjs
//
// The output is ONE DO statement: it EXECUTEs both migrations, runs the cap
// tests against two throwaway users (random ids, never a real account), then
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
];
const OUT = 'supabase/tests/paywall_v2_validation.sql';

const bodies = await Promise.all(MIGRATIONS.map((f) => readFile(path.join(root, f), 'utf8')));
bodies.forEach((b, i) => {
  if (b.includes(`$mig${i + 1}$`) || b.includes('$validate$')) {
    throw new Error(`${MIGRATIONS[i]} contains a reserved dollar-quote tag`);
  }
});

const tests = String.raw`
  -- ── Throwaway users (random ids: never a real account) ──────
  insert into auth.users (id, email) values
    (free_u, 'paywall-validation-free-' || free_u || '@example.invalid'),
    (founder_u, 'paywall-validation-founder-' || founder_u || '@example.invalid');
  insert into public.profiles (id, business_name, access_tier) values
    (free_u, 'Paywall validation (free)', 'free'),
    (founder_u, 'Paywall validation (founder)', 'founder');

  -- ── Free user: invoices ─────────────────────────────────────
  begin
    insert into public.invoices (user_id, client_name, kind) values (free_u, 'Validation client 1', 'invoice');
    insert into public.invoices (user_id, client_name, kind) values (free_u, 'Validation client 2', 'invoice');
    report := report || 'PASS  free: invoices 1 and 2 allowed'; passed := passed + 1;
  exception when others then
    report := report || ('FAIL  free: invoices 1-2 rejected: ' || sqlerrm); failed := failed + 1;
  end;

  begin
    insert into public.invoices (user_id, client_name, kind) values (free_u, 'Validation client 3', 'invoice');
    report := report || 'FAIL  free: 3rd invoice was ALLOWED'; failed := failed + 1;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint = 'PAYWALL_LIMIT' then
      report := report || 'PASS  free: 3rd invoice rejected (PAYWALL_LIMIT)'; passed := passed + 1;
    else
      report := report || ('FAIL  free: 3rd invoice rejected for the wrong reason: ' || sqlerrm); failed := failed + 1;
    end if;
  end;

  begin
    insert into public.invoices (user_id, client_name, kind) values (free_u, 'Validation quote', 'quote');
    report := report || 'PASS  free: quote allowed past the invoice cap (quotes never count)'; passed := passed + 1;
  exception when others then
    report := report || ('FAIL  free: quote rejected: ' || sqlerrm); failed := failed + 1;
  end;

  -- ── Free user: expenses (and soft delete refunds nothing) ───
  begin
    insert into public.expenses (user_id, amount) values (free_u, 10);
    insert into public.expenses (user_id, amount) values (free_u, 20) returning id into v_id;
    update public.expenses set deleted_at = now() where id = v_id;
    report := report || 'PASS  free: expenses 1 and 2 allowed (2nd then soft-deleted)'; passed := passed + 1;
  exception when others then
    report := report || ('FAIL  free: expenses 1-2 rejected: ' || sqlerrm); failed := failed + 1;
  end;

  begin
    insert into public.expenses (user_id, amount) values (free_u, 30);
    report := report || 'FAIL  free: 3rd expense was ALLOWED (soft-deleted row must still count)'; failed := failed + 1;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint = 'PAYWALL_LIMIT_EXPENSE' then
      report := report || 'PASS  free: 3rd expense rejected (PAYWALL_LIMIT_EXPENSE), soft-deleted row still counted'; passed := passed + 1;
    else
      report := report || ('FAIL  free: 3rd expense rejected for the wrong reason: ' || sqlerrm); failed := failed + 1;
    end if;
  end;

  -- ── Founder: unlimited ──────────────────────────────────────
  begin
    insert into public.invoices (user_id, client_name, kind) values (founder_u, 'Founder client 1', 'invoice');
    insert into public.invoices (user_id, client_name, kind) values (founder_u, 'Founder client 2', 'invoice');
    insert into public.invoices (user_id, client_name, kind) values (founder_u, 'Founder client 3', 'invoice');
    report := report || 'PASS  founder: 3 invoices allowed'; passed := passed + 1;
  exception when others then
    report := report || ('FAIL  founder: invoice rejected: ' || sqlerrm); failed := failed + 1;
  end;

  begin
    insert into public.expenses (user_id, amount) values (founder_u, 1);
    insert into public.expenses (user_id, amount) values (founder_u, 2);
    insert into public.expenses (user_id, amount) values (founder_u, 3);
    report := report || 'PASS  founder: 3 expenses allowed'; passed := passed + 1;
  exception when others then
    report := report || ('FAIL  founder: expense rejected: ' || sqlerrm); failed := failed + 1;
  end;

  -- ── created_at can't be backdated (insert or update) ────────
  begin
    insert into public.expenses (user_id, amount, created_at) values (founder_u, 4, '2000-01-01')
      returning id, created_at into v_id, v_ts;
    if v_ts >= public.paywall_reset_at() then
      report := report || 'PASS  backdated created_at on insert is replaced by now()'; passed := passed + 1;
    else
      report := report || ('FAIL  insert kept backdated created_at ' || v_ts); failed := failed + 1;
    end if;
    update public.expenses set created_at = '2000-01-01' where id = v_id returning created_at into v_ts;
    if v_ts >= public.paywall_reset_at() then
      report := report || 'PASS  created_at unchanged by update (expenses)'; passed := passed + 1;
    else
      report := report || ('FAIL  expense update backdated created_at to ' || v_ts); failed := failed + 1;
    end if;
    update public.invoices set created_at = '2000-01-01'
      where id = (select id from public.invoices where user_id = founder_u limit 1)
      returning created_at into v_ts;
    if v_ts >= public.paywall_reset_at() then
      report := report || 'PASS  created_at unchanged by update (invoices)'; passed := passed + 1;
    else
      report := report || ('FAIL  invoice update backdated created_at to ' || v_ts); failed := failed + 1;
    end if;
  exception when others then
    report := report || ('FAIL  created_at checks errored: ' || sqlerrm); failed := failed + 1;
  end;
`;

const out = `-- ═══════════════════════════════════════════════════════════════
-- Paywall v2 cap validation — run in the Supabase SQL Editor. NOTHING PERSISTS.
--
-- GENERATED by scripts/build-paywall-validation.mjs from:
${MIGRATIONS.map((m) => `--   ${m}`).join('\n')}
-- Regenerate after changing either migration.
--
-- How it stays safe: this whole file is ONE DO statement. It applies both
-- migrations, tests them against two throwaway users (random ids, emails
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
  v_hint    text;
  v_id      uuid;
  v_ts      timestamptz;
begin
  -- ── The two migrations, exactly as they will be pushed ──────
${bodies.map((b, i) => `  execute $mig${i + 1}$\n${b}\n$mig${i + 1}$;`).join('\n\n')}
${tests}
  -- ── Report, then roll everything back ───────────────────────
  raise exception '%', format(E'PAYWALL VALIDATION: %s passed, %s failed (everything rolled back)\\n%s',
    passed, failed, array_to_string(report, E'\\n'));
end
$validate$;
`;

await writeFile(path.join(root, OUT), out);
console.log(`wrote ${OUT}`);
