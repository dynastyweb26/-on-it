import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canConfirmPayment, looksLikePayment, parseAmount, parseMethod, parsePaidOn, resolvePayment, type OpenInvoice } from './payment-intent';
import { recordPaymentOnce, type PaymentLedgerIO, type PaymentLedgerRow } from './payment-idempotency';

// ── Amounts ────────────────────────────────────────────────────────────────

test('an amount with a dollar sign', () => {
  assert.equal(parseAmount('Maria paid me $25'), 25);
  assert.equal(parseAmount('got $1,250.50 from Ruth'), 1250.5);
});

test('an amount with a word after it', () => {
  assert.equal(parseAmount('he gave me 25 bucks'), 25);
  assert.equal(parseAmount('she paid 300 dollars'), 300);
});

test('a spoken amount', () => {
  assert.equal(parseAmount('she paid twenty-five'), 25);
  assert.equal(parseAmount('Maria paid twenty five dollars'), 25);
  assert.equal(parseAmount('paid a hundred'), 100);
  assert.equal(parseAmount('got one hundred twenty bucks'), 120);
});

test('no amount is null, never zero', () => {
  assert.equal(parseAmount('Maria paid me'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('$0'), null);
});

test('an invoice number is not mistaken for a payment amount', () => {
  // The model supplies the mount; the bare number here belongs to the message,
  // so the card shows it and the owner can correct it before Confirm.
  assert.equal(parseAmount('invoice 1042 paid'), 1042);
  // ...and that is exactly why nothing is written until Confirm.
  assert.equal(canConfirmPayment(resolvePayment({
    parsed: { amount: 1042, method: 'zelle', paidOn: null, clientName: 'Maria' },
    invoices: [],
  })), false);
});

// ── Methods ────────────────────────────────────────────────────────────────

test('the four methods people name', () => {
  assert.equal(parseMethod('paid by zelle'), 'zelle');
  assert.equal(parseMethod('gave me cash'), 'other');
  assert.equal(parseMethod('paid by check'), 'other');
  assert.equal(parseMethod('put it on her card'), 'card');
  assert.equal(parseMethod('venmo'), 'venmo');
  assert.equal(parseMethod('bank transfer'), 'bank');
  assert.equal(parseMethod('she paid'), null);
});

test('cash and check record as other, like the sheet does', () => {
  // PAYMENT_METHODS no longer offers cash/check; one spelling in the ledger.
  for (const text of ['cash', 'check', 'cheque']) assert.equal(parseMethod(text), 'other');
});

// ── Dates ──────────────────────────────────────────────────────────────────

test('a stated day is used, an unstated one is left to the card', () => {
  const now = new Date(2026, 10, 8, 12, 0, 0); // local Nov 8
  assert.equal(parsePaidOn('paid me yesterday', now), '2026-11-07');
  assert.equal(parsePaidOn('paid today', now), '2026-11-08');
  assert.equal(parsePaidOn('paid me', now), null);
});

// ── Routing guard ──────────────────────────────────────────────────────────

test('a payment statement is recognised', () => {
  assert.equal(looksLikePayment('Maria paid me 25 by zelle', { amount: 25, method: 'zelle' }), true);
});

test('a job message never takes the payment path', () => {
  assert.equal(looksLikePayment('invoice Maria for 200', { amount: 200, method: null }), false);
  assert.equal(looksLikePayment('estimate for Ruth 300', { amount: 300, method: null }), false);
  assert.equal(looksLikePayment('quote the deck at 1200', { amount: 1200, method: null }), false);
});

// ── Clients and invoices ───────────────────────────────────────────────────

const inv = (over: Partial<OpenInvoice>): OpenInvoice => ({
  id: 'i1', invoiceNo: 1, clientName: 'Maria', total: 100, amountPaid: 0,
  kind: 'invoice', createdAt: '2026-10-01T00:00:00.000Z', ...over,
});

test('one matching client with one open invoice resolves it', () => {
  const r = resolvePayment({
    parsed: { amount: 25, method: 'zelle', paidOn: null, clientName: 'Maria' },
    invoices: [inv({})],
  });
  assert.equal(r.invoice?.id, 'i1');
  assert.equal(r.left, 100);
  assert.equal(r.overpay, false);
  assert.deepEqual(r.needs, []);
  assert.equal(canConfirmPayment(r), true);
});

test('two matching clients show a picker instead of picking one', () => {
  const r = resolvePayment({
    parsed: { amount: 25, method: 'zelle', paidOn: null, clientName: 'Mar' },
    invoices: [inv({ id: 'a', clientName: 'Maria' }), inv({ id: 'b', clientName: 'Marcus' })],
  });
  assert.equal(r.invoice, null);
  assert.deepEqual(r.clientChoices.sort(), ['Marcus', 'Maria']);
  assert.equal(canConfirmPayment(r), false);
});

test('a client with no open invoice asks which invoice', () => {
  const r = resolvePayment({
    parsed: { amount: 25, method: 'zelle', paidOn: null, clientName: 'Ruth' },
    invoices: [inv({ clientName: 'Ruth', amountPaid: 100 })],
  });
  assert.equal(r.invoice, null);
  assert.ok(r.needs.includes('client'));
});

test('a client with two open invoices offers both, oldest preselected', () => {
  const r = resolvePayment({
    parsed: { amount: 25, method: 'zelle', paidOn: null, clientName: 'Maria' },
    invoices: [
      inv({ id: 'new', createdAt: '2026-10-20T00:00:00.000Z' }),
      inv({ id: 'old', createdAt: '2026-09-01T00:00:00.000Z' }),
    ],
  });
  assert.deepEqual(r.invoiceChoices.map((i) => i.id), ['old', 'new']);
  assert.equal(r.invoice?.id, 'old');
  assert.equal(canConfirmPayment(r), true);
});

test('an amount over the balance blocks Confirm', () => {
  const r = resolvePayment({
    parsed: { amount: 150, method: 'zelle', paidOn: null, clientName: 'Maria' },
    invoices: [inv({ total: 100 })],
  });
  assert.equal(r.overpay, true);
  assert.equal(canConfirmPayment(r), false);
});

test('paying exactly the balance is allowed', () => {
  const r = resolvePayment({
    parsed: { amount: 100, method: 'card', paidOn: null, clientName: 'Maria' },
    invoices: [inv({ total: 100, amountPaid: 0 })],
  });
  assert.equal(r.overpay, false);
  assert.equal(canConfirmPayment(r), true);
});

test('a missing method keeps Confirm disabled', () => {
  const r = resolvePayment({
    parsed: { amount: 20, method: null, paidOn: null, clientName: 'Maria' },
    invoices: [inv({})],
  });
  assert.ok(r.needs.includes('method'));
  assert.equal(canConfirmPayment(r), false);
});

// ── Double confirm ─────────────────────────────────────────────────────────

test('confirming twice with one key writes one ledger row', async () => {
  const rows: PaymentLedgerRow[] = [];
  let inserts = 0;
  const io: PaymentLedgerIO = {
    insertOnce: async (row) => {
      inserts += 1;
      // The DB's partial unique index raises on the second insert of the key.
      if (rows.some((r) => r.user_id === row.user_id && r.idempotency_key === row.idempotency_key)) {
        return { error: { code: '23505' } };
      }
      rows.push({ ...row, id: `row-${rows.length + 1}` });
      return { error: null };
    },
    findByKey: async (userId, key) => rows.find((r) => r.user_id === userId && r.idempotency_key === key) ?? null,
  };
  const row = {
    invoice_id: 'i1', user_id: 'u1', amount: 25, method: 'zelle',
    paid_at: '2026-11-08T05:00:00.000Z', idempotency_key: 'pay-i1-key',
  };
  const first = await recordPaymentOnce(io, row);
  const second = await recordPaymentOnce(io, row);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(rows.length, 1);
  assert.equal(inserts, 2); // the second attempt is forgiven, not duplicated
  assert.equal(second.payment?.id, first.payment?.id);
});
