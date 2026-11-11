// A payment with no invoice: the input rules, the row it writes, its key, and
// the route's access model (session + RLS, never the service role).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  UNATTACHED_PAYMENT_TITLE,
  UNATTACHED_PAYMENT_METHODS,
  isDifferentUnattachedPayment,
  isUnattachedIdempotencyConflict,
  isUnattachedMethod,
  parseUnattachedPayment,
  unattachedInsertRow,
  unattachedPaymentKey,
} from './unattached-payment';

const ROUTE = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'income', 'unattached', 'route.ts'),
  'utf8',
);

const valid = { amount: 120, method: 'zelle', received_on: '2026-11-11', title: 'Side job' };

test('saves with no invoice at all', () => {
  const parsed = parseUnattachedPayment(valid);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const row = unattachedInsertRow('user-a', parsed.value, 'income-key-1');
  // No invoice is required, referenced, or written.
  assert.equal('invoice_id' in row, false);
  assert.equal(JSON.stringify(row).includes('invoice'), false);
  assert.equal(row.deposit_id, null);
  assert.equal(row.classification, 'other_income');
  assert.equal(row.method, 'zelle');
  assert.equal(row.amount, 120);
  assert.equal(row.received_on, '2026-11-11');
  assert.equal(row.title, 'Side job');
  assert.equal(row.user_id, 'user-a');
});

test('the name is optional and a blank falls back to the neutral one', () => {
  const parsed = parseUnattachedPayment({ ...valid, title: '   ' });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.title, UNATTACHED_PAYMENT_TITLE);
  const missing = parseUnattachedPayment({ ...valid, title: undefined });
  assert.equal(missing.ok, true);
  if (missing.ok) assert.equal(missing.value.title, UNATTACHED_PAYMENT_TITLE);
});

test('amount, method and date are the only things that can refuse a save', () => {
  for (const amount of [0, -5, 'nope', 10_000_000]) {
    const out = parseUnattachedPayment({ ...valid, amount });
    assert.deepEqual(out, { ok: false, code: 'amount_invalid' }, String(amount));
  }
  assert.deepEqual(parseUnattachedPayment({ ...valid, method: 'wire' }), {
    ok: false, code: 'method_invalid',
  });
  for (const received_on of ['2026-02-30', '11/11/2026', '', undefined]) {
    const out = parseUnattachedPayment({ ...valid, received_on });
    assert.deepEqual(out, { ok: false, code: 'date_invalid' }, String(received_on));
  }
  assert.deepEqual(parseUnattachedPayment({ ...valid, title: 'x'.repeat(201) }), {
    ok: false, code: 'title_too_long',
  });
});

test('amounts are whole cents, and every card method is accepted', () => {
  const parsed = parseUnattachedPayment({ ...valid, amount: '19.999' });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.amount, 20);
  for (const method of UNATTACHED_PAYMENT_METHODS) {
    assert.equal(isUnattachedMethod(method), true, method);
  }
  assert.equal(isUnattachedMethod('wire'), false);
});

test('the idempotency key carries no invoice id', () => {
  const key = unattachedPaymentKey('fixed-uuid');
  assert.equal(key, 'income-fixed-uuid');
  assert.equal(key.includes('invoice'), false);
  assert.notEqual(unattachedPaymentKey(), unattachedPaymentKey());
});

test('a replay is the same money when the amount and the day match', () => {
  const row = { amount: 120, received_on: '2026-11-11' };
  assert.equal(
    isDifferentUnattachedPayment({ id: '1', amount: '120.00', received_on: '2026-11-11' }, row),
    false,
  );
  assert.equal(
    isDifferentUnattachedPayment({ id: '1', amount: '121.00', received_on: '2026-11-11' }, row),
    true,
  );
  assert.equal(
    isDifferentUnattachedPayment({ id: '1', amount: '120.00', received_on: '2026-11-10' }, row),
    true,
  );
});

test('only a 23505 on the other_income key index counts as a safe repeat', () => {
  const repeat = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "other_income_user_idempotency_key_uidx"',
  };
  assert.equal(isUnattachedIdempotencyConflict(repeat), true);
  assert.equal(
    isUnattachedIdempotencyConflict({
      code: '23505',
      message: 'duplicate key value violates unique constraint "invoice_payments_user_idempotency_key_uidx"',
    }),
    false,
  );
  assert.equal(isUnattachedIdempotencyConflict({ code: '23514', message: 'check' }), false);
  assert.equal(isUnattachedIdempotencyConflict(null), false);
});

test('the route runs on the session and RLS: no service role, no invoice', () => {
  assert.match(ROUTE, /createClient/);
  assert.doesNotMatch(ROUTE, /adminClient/);
  assert.doesNotMatch(ROUTE, /service_role/);
  assert.match(ROUTE, /\.from\('other_income'\)/);
  assert.doesNotMatch(ROUTE, /from\('invoice_payments'\)/);
  assert.doesNotMatch(ROUTE, /from\('invoices'\)/);
  // The session owns the row, never the body.
  assert.match(ROUTE, /unattachedInsertRow\(user\.id/);
  assert.match(ROUTE, /getUser\(\)/);
  assert.match(ROUTE, /rateLimit\('income-unattached'/);
  assert.match(ROUTE, /idempotency_key/);
});

test('a client cannot be told a write succeeded when RLS refused it', () => {
  assert.match(ROUTE, /error\.code === '42501'/);
  assert.match(ROUTE, /fail\('not_allowed', 403\)/);
});
