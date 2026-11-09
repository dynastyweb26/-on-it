import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ClientSummary } from './clients';
import type { OpenInvoice } from './payment-intent';
import {
  PAYMENT_CLIENT_LIMIT,
  chooseInvoiceForClient,
  matchTypedClient,
  openPaymentCardTarget,
  paymentCardLoadError,
  recentPaymentClients,
} from './payment-card-picker';

const client = (name: string, lastUsed: string | null, extra: Partial<ClientSummary> = {}): ClientSummary => ({
  id: `id-${name}`, name, saved: true, doc_count: 1, invoice_count: 1, quote_count: 0, open_count: 0,
  open_balance: 0, overdue_count: 0, overdue_balance: 0, quotes_out: 0, total_paid: 0, last_used_at: lastUsed,
  ...extra,
});
const inv = (id: string, clientName: string, total: number, amountPaid: number, createdAt: string, kind: 'invoice' | 'quote' = 'invoice'): OpenInvoice =>
  ({ id, invoiceNo: 1, clientName, total, amountPaid, kind, createdAt });

// ── The dropdown list ──────────────────────────────────────────────────────

test('most recent activity first', () => {
  const out = recentPaymentClients([
    client('Old', '2026-01-01T00:00:00Z'),
    client('New', '2026-11-01T00:00:00Z'),
    client('Mid', '2026-06-01T00:00:00Z'),
  ]);
  assert.deepEqual(out.map((c) => c.name), ['New', 'Mid', 'Old']);
});

test('capped at 8, and the limit is honoured', () => {
  const rows = Array.from({ length: 20 }, (_, i) => client(`C${i}`, `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`));
  assert.equal(PAYMENT_CLIENT_LIMIT, 8);
  assert.equal(recentPaymentClients(rows).length, 8);
  assert.equal(recentPaymentClients(rows, 5).length, 5);
  assert.equal(recentPaymentClients(rows)[0].name, 'C19');
});

test('duplicate names collapse to the most recent, case and spacing ignored', () => {
  const out = recentPaymentClients([
    client('ruth  Smith', '2026-02-01T00:00:00Z', { id: 'a' }),
    client('Ruth Smith', '2026-09-01T00:00:00Z', { id: 'b' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'b');
});

test('blank names and clients never used or saved are left out', () => {
  const out = recentPaymentClients([
    client('  ', '2026-09-01T00:00:00Z'),
    client('Ghost', null, { saved: false, doc_count: 0 }),
    client('Seen', '2026-09-01T00:00:00Z', { saved: false, doc_count: 2 }),
  ]);
  assert.deepEqual(out.map((c) => c.name), ['Seen']);
});

test('a saved client with no activity sorts after active ones, A to Z', () => {
  const out = recentPaymentClients([
    client('Zed', null, { doc_count: 0 }),
    client('Amy', null, { doc_count: 0 }),
    client('Bob', '2026-03-01T00:00:00Z'),
  ]);
  assert.deepEqual(out.map((c) => c.name), ['Bob', 'Amy', 'Zed']);
});

test('an unparsable date does not break the order', () => {
  const out = recentPaymentClients([client('Bad', 'not-a-date'), client('Good', '2026-03-01T00:00:00Z')]);
  assert.deepEqual(out.map((c) => c.name), ['Good', 'Bad']);
});

test('empty input gives an empty list', () => {
  assert.deepEqual(recentPaymentClients([]), []);
});

// ── Typed name links to a saved client ─────────────────────────────────────

test('a typed name links to the saved client it spells', () => {
  const rows = [client('Ruth Smith', null), client('Maryam', null)];
  assert.equal(matchTypedClient('  ruth   smith ', rows)?.name, 'Ruth Smith');
});

test('a typed name with no exact match links to nothing', () => {
  const rows = [client('Ruth Smith', null)];
  assert.equal(matchTypedClient('Ruth', rows), null);
  assert.equal(matchTypedClient('', rows), null);
  assert.equal(matchTypedClient('   ', rows), null);
});

// ── Which invoice ──────────────────────────────────────────────────────────

test('exactly one unpaid invoice is used', () => {
  const out = chooseInvoiceForClient('Ruth', [
    inv('a', 'Ruth', 100, 0, '2026-01-01'),
    inv('b', 'Ruth', 100, 100, '2026-01-02'),
    inv('c', 'Maryam', 100, 0, '2026-01-03'),
  ]);
  assert.equal(out.kind, 'one');
  assert.equal(out.kind === 'one' && out.invoice.id, 'a');
});

test('several unpaid invoices come back oldest first for the picker', () => {
  const out = chooseInvoiceForClient('ruth', [
    inv('new', 'Ruth', 100, 0, '2026-05-01'),
    inv('old', 'Ruth', 100, 40, '2026-01-01'),
  ]);
  assert.equal(out.kind, 'many');
  assert.deepEqual(out.kind === 'many' && out.invoices.map((i) => i.id), ['old', 'new']);
});

test('no unpaid invoice is none, and so is an estimate or a blank client', () => {
  assert.equal(chooseInvoiceForClient('Ruth', [inv('a', 'Ruth', 100, 100, '2026-01-01')]).kind, 'none');
  assert.equal(chooseInvoiceForClient('Ruth', [inv('q', 'Ruth', 100, 0, '2026-01-01', 'quote')]).kind, 'none');
  assert.equal(chooseInvoiceForClient('', [inv('a', 'Ruth', 100, 0, '2026-01-01')]).kind, 'none');
  assert.equal(chooseInvoiceForClient('Nobody', []).kind, 'none');
});

// ── Failures name the real cause ───────────────────────────────────────────

test('signed out is named, even when the error looks like ours', () => {
  assert.match(paymentCardLoadError(new Error('boom'), false), /sign in/i);
  assert.match(paymentCardLoadError({ status: 401, message: 'JWT expired' }, true), /sign in/i);
});

test('a network failure is offline, not a server fault', () => {
  assert.match(paymentCardLoadError(new TypeError('Failed to fetch'), true), /offline/i);
});

test('anything else is ours, and says so', () => {
  const msg = paymentCardLoadError({ status: 500, message: 'db down' }, true);
  assert.match(msg, /couldn't load/i);
  assert.doesNotMatch(msg, /offline|sign in/i);
});

// ── Repeat taps ────────────────────────────────────────────────────────────

test('first tap adds; a tap with a card already open scrolls to it', () => {
  assert.deepEqual(openPaymentCardTarget([{ id: 'g' }], null), { action: 'add' });
  assert.deepEqual(openPaymentCardTarget([{ id: 'g' }, { id: 'p', payProposal: {} }], 'p'), { action: 'scroll', id: 'p' });
});

test('a tap in the same frame as the first one is ignored', () => {
  assert.deepEqual(openPaymentCardTarget([{ id: 'g' }], 'p'), { action: 'ignore' });
});

test('after the card is confirmed or cancelled, the next tap adds a new one', () => {
  assert.deepEqual(openPaymentCardTarget([{ id: 'g' }, { id: 'p' }], null), { action: 'add' });
});
