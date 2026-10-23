// The Chat payment check must pick the same queue the card promises: unpaid
// invoices sent a day ago (or past due), oldest first, never a paid/draft/void
// row, never a fully-covered balance, and never a snoozed id.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPaymentCheckSnooze,
  enabledPaymentCheckMethods,
  firstName,
  paidOnLabel,
  parsePaymentCheckSnoozes,
  paymentCheckCandidates,
  paymentCheckCount,
  paymentCheckStatus,
  remainingBalance,
  type PaymentCheckInvoice,
} from '@/lib/payment-check';

process.env.TZ = 'America/Chicago';

const now = new Date('2026-10-22T18:00:00.000Z'); // 13:00 Chicago
const today = '2026-10-22';

function inv(over: Partial<PaymentCheckInvoice> = {}): PaymentCheckInvoice {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    client_name: 'Maria Lopez',
    invoice_number: 14,
    total: 480,
    amount_paid: 0,
    status: 'sent',
    due_date: '2026-10-30',
    sent_at: '2026-10-20T18:00:00.000Z', // 2 days ago
    first_sent_at: '2026-10-20T18:00:00.000Z',
    created_at: '2026-10-19T18:00:00.000Z',
    kind: 'invoice',
    deleted_at: null,
    ...over,
  };
}

test('Get Paid methods follow display order and respect enabled state', () => {
  assert.deepEqual(
    enabledPaymentCheckMethods({
      bank_account_last4: '6789', bank_transfer_enabled: true,
      cashapp_tag: '$jess', paypal_me: 'jess', venmo_username: 'jess',
    }, true),
    ['bank', 'zelle', 'cashapp', 'paypal', 'venmo'],
  );
  // Bank is off when the switch is off; handles count only when non-blank.
  assert.deepEqual(
    enabledPaymentCheckMethods({
      bank_account_last4: '6789', bank_transfer_enabled: false,
      cashapp_tag: '   ', paypal_me: null, venmo_username: 'jess',
    }, false),
    ['venmo'],
  );
  assert.deepEqual(enabledPaymentCheckMethods(null, undefined), []);
});

test('firstName names the person and falls back safely', () => {
  assert.equal(firstName('Maria Lopez'), 'Maria');
  assert.equal(firstName('  Brightside Dental '), 'Brightside');
  assert.equal(firstName(''), 'your client');
  assert.equal(firstName(null), 'your client');
});

test('remainingBalance is the amount still owed, never negative', () => {
  assert.equal(remainingBalance({ total: 480, amount_paid: 0 }), 480);
  assert.equal(remainingBalance({ total: 480, amount_paid: 100 }), 380);
  assert.equal(remainingBalance({ total: 480, amount_paid: 480 }), 0);
  assert.equal(remainingBalance({ total: 480, amount_paid: 500 }), 0);
  assert.equal(remainingBalance({ total: null, amount_paid: null }), 0);
});

test('the queue is oldest first and excludes rows the card must never show', () => {
  const queue = paymentCheckCandidates([
    inv({ id: 'paid', status: 'paid', amount_paid: 480 }),
    inv({ id: 'draft', status: 'draft' }),
    inv({ id: 'void', status: 'void' }),
    inv({ id: 'deleted', deleted_at: '2026-10-21T00:00:00.000Z' }),
    inv({ id: 'fresh', first_sent_at: '2026-10-22T12:00:00.000Z', sent_at: '2026-10-22T12:00:00.000Z' }),
    inv({ id: 'partial', amount_paid: 80, first_sent_at: '2026-10-18T18:00:00.000Z', sent_at: '2026-10-18T18:00:00.000Z' }),
    inv({ id: 'late', status: 'overdue', due_date: '2026-10-20', first_sent_at: null, sent_at: null }),
    inv({ id: 'old', first_sent_at: '2026-10-15T18:00:00.000Z', sent_at: '2026-10-15T18:00:00.000Z' }),
  ], { now, today });

  assert.deepEqual(queue.map((i) => i.id), ['old', 'partial', 'late']);
  // The partially-paid row still shows; the amount is its balance, not total.
  assert.equal(remainingBalance(queue[1]), 400);
});

test('a snoozed invoice stays out until its timestamp passes', () => {
  const snoozedUntil = {
    one: now.getTime() + 60_000,
    expired: now.getTime() - 1,
  };
  const ids = paymentCheckCandidates([
    inv({ id: 'one' }),
    inv({ id: 'expired', first_sent_at: '2026-10-15T18:00:00.000Z', sent_at: '2026-10-15T18:00:00.000Z' }),
  ], { now, today, snoozedUntil }).map((i) => i.id);
  assert.deepEqual(ids, ['expired']);
});

test('status copy matches the card: sent days, yesterday, past due', () => {
  assert.deepEqual(paymentCheckStatus(inv(), now, today), { text: 'Sent 2 days ago', overdue: false });
  assert.deepEqual(paymentCheckStatus(inv({ first_sent_at: '2026-10-21T18:00:00.000Z', sent_at: '2026-10-21T18:00:00.000Z' }), now, today), { text: 'Sent yesterday', overdue: false });
  assert.deepEqual(paymentCheckStatus(inv({ status: 'overdue', due_date: '2026-10-19' }), now, today), { text: '3 days past due', overdue: true });
  assert.deepEqual(paymentCheckStatus(inv({ due_date: today }), now, today), { text: 'Due today', overdue: false });
});

test('paid-on labels are local calendar days', () => {
  assert.equal(paidOnLabel('2026-10-22', now), 'Today');
  assert.equal(paidOnLabel('2026-10-21', now), 'Yesterday');
  assert.equal(paidOnLabel('2026-10-20', now), 'Tue, Oct 20');
});

test('snooze parsing prunes expired and malformed entries', () => {
  const raw = JSON.stringify({ alive: now.getTime() + 1000, dead: now.getTime() - 1000, bad: 'x' });
  assert.deepEqual(parsePaymentCheckSnoozes(raw, now.getTime()), { alive: now.getTime() + 1000 });
  assert.deepEqual(parsePaymentCheckSnoozes('not json', now.getTime()), {});
  assert.deepEqual(parsePaymentCheckSnoozes('[]', now.getTime()), {});

  const map = addPaymentCheckSnooze({}, 'one', now.getTime());
  assert.equal(map.one, now.getTime() + 24 * 3600e3);
});

test('count label keeps the original total after an advance', () => {
  assert.equal(paymentCheckCount(0, 3), '1 of 3');
  assert.equal(paymentCheckCount(1, 3), '2 of 3');
  assert.equal(paymentCheckCount(3, 3), '3 of 3');
});
