import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideSweep, eventCard, eventDedupeKey, eventVisibleInChat, hourBucket, periodBucket, type EventRow, type SweepDoc } from './events';

const dollars = (n: number) => `$${n.toFixed(2)}`;
const now = new Date('2026-11-08T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400e3).toISOString();
const daysAhead = (n: number) => new Date(now.getTime() + n * 86400e3).toISOString().slice(0, 10);

const doc = (over: Partial<SweepDoc>): SweepDoc => ({
  id: 'd1', kind: 'invoice', status: 'sent', documentNumber: 29, clientName: 'Brandon',
  total: 150, amountPaid: 0, dueDate: daysAhead(10), validUntil: null,
  createdAt: daysAgo(5), sentAt: daysAgo(3), ...over,
});

const kindOf = (docs: SweepDoc[]) => decideSweep({ now, docs }).map((e) => e.kind);

// ── Buckets and dedupe ─────────────────────────────────────────────────────

test('client actions bucket by the hour', () => {
  assert.equal(hourBucket(new Date('2026-11-08T12:34:56Z')), '2026-11-08T12');
  assert.equal(hourBucket(new Date('2026-11-08T12:59:00Z')), '2026-11-08T12');
  assert.notEqual(hourBucket(new Date('2026-11-08T13:00:00Z')), hourBucket(new Date('2026-11-08T12:00:00Z')));
});

test('time events bucket by the week', () => {
  assert.equal(periodBucket(new Date('2026-11-08T00:00:00Z')), periodBucket(new Date('2026-11-08T23:00:00Z')));
  assert.notEqual(periodBucket(new Date('2026-11-08T00:00:00Z')), periodBucket(new Date('2026-11-20T00:00:00Z')));
});

test('a dedupe key names the kind, the subject and the bucket', () => {
  assert.equal(eventDedupeKey('invoice_viewed', 'abc', '2026-11-08T12'), 'invoice_viewed:abc:2026-11-08T12');
});

// ── Chat visibility ────────────────────────────────────────────────────────

test('an unseen event is always in the thread', () => {
  assert.equal(eventVisibleInChat({ occurred_at: daysAgo(30), seen_at: null }, daysAgo(1)), true);
});

test('a seen event survives only while it is newer than the chat', () => {
  assert.equal(eventVisibleInChat({ occurred_at: daysAgo(1), seen_at: daysAgo(1) }, daysAgo(2)), true);
  assert.equal(eventVisibleInChat({ occurred_at: daysAgo(5), seen_at: daysAgo(5) }, daysAgo(2)), false);
});

// ── Card copy ──────────────────────────────────────────────────────────────

const row = (over: Partial<EventRow>): EventRow => ({
  id: 'e1', user_id: 'u1', kind: 'invoice_viewed', actor: 'client', invoice_id: 'i1',
  document_kind: 'invoice', document_number: 29, client_name: 'Brandon', amount: 150,
  meta: null, dedupe_key: null, seen_at: null, acted_at: null, acted_result: null,
  occurred_at: daysAgo(0), ...over,
});

test('a view card names the client and the document', () => {
  const card = eventCard(row({}), dollars);
  assert.equal(card.title, 'Brandon opened your invoice');
  assert.equal(card.detail, 'INV-0029 · $150.00');
  assert.equal(card.tone, 'neutral');
});

test('a signed estimate is the success tone, and never says quote on screen', () => {
  const card = eventCard(row({ kind: 'estimate_signed', document_kind: 'quote', document_number: 49, amount: 50 }), dollars);
  assert.equal(card.title, 'Brandon signed your estimate');
  assert.equal(card.detail, 'E-0049 · $50.00');
  assert.equal(card.tone, 'success');
  assert.ok(!/quote/i.test(card.title + card.detail));
});

test('an overdue card carries the days late', () => {
  const card = eventCard(row({ kind: 'invoice_overdue', meta: { days_late: 3 } }), dollars);
  assert.equal(card.title, "Brandon's invoice is overdue");
  assert.match(card.detail, /3 days late/);
  assert.equal(card.tone, 'overdue');
});

test('a payment card shows the amount and never invents a method', () => {
  const plain = eventCard(row({ kind: 'payment_recorded', amount: 25 }), dollars);
  assert.equal(plain.title, 'Brandon paid $25.00');
  assert.ok(!plain.detail.includes('Zelle'));
  const withMethod = eventCard(row({ kind: 'payment_recorded', amount: 25, meta: { method: 'Zelle' } }), dollars);
  assert.match(withMethod.detail, /Zelle/);
});

test('a missing client name never renders as blank', () => {
  assert.equal(eventCard(row({ client_name: null }), dollars).title, 'Your client opened your invoice');
});

// ── Sweep decisions ────────────────────────────────────────────────────────

test('an overdue invoice emits one overdue card keyed by its due date', () => {
  const events = decideSweep({ now, docs: [doc({ status: 'overdue', dueDate: daysAhead(-4) })] });
  const overdue = events.filter((e) => e.kind === 'invoice_overdue');
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].dedupeKey, `invoice_overdue:d1:${daysAhead(-4)}`);
  assert.equal(overdue[0].meta.days_late, 4);
});

test('an overdue invoice never also emits due-soon', () => {
  assert.ok(!kindOf([doc({ status: 'overdue', dueDate: daysAhead(1) })]).includes('invoice_due_soon'));
});

test('a due-soon invoice is emitted inside the window only', () => {
  assert.ok(kindOf([doc({ dueDate: daysAhead(2) })]).includes('invoice_due_soon'));
  assert.ok(!kindOf([doc({ dueDate: daysAhead(9) })]).includes('invoice_due_soon'));
  assert.ok(!kindOf([doc({ dueDate: daysAhead(-1) })]).includes('invoice_due_soon'));
});

test('a paid invoice is never chased', () => {
  assert.deepEqual(kindOf([doc({ status: 'overdue', amountPaid: 150 })]), []);
  assert.deepEqual(kindOf([doc({ amountPaid: 150, dueDate: daysAhead(1) })]), []);
});

test('an invoice unpaid for two weeks is stale, once a week', () => {
  const stale = decideSweep({ now, docs: [doc({ sentAt: daysAgo(20), dueDate: daysAhead(30) })] }).filter((e) => e.kind === 'invoice_stale');
  assert.equal(stale.length, 1);
  assert.match(stale[0].dedupeKey, /^invoice_stale:d1:w\d+$/);
  // ...and not before the window.
  assert.ok(!kindOf([doc({ sentAt: daysAgo(3), dueDate: daysAhead(30) })]).includes('invoice_stale'));
});

test('an estimate close to its valid-until date is expiring soon', () => {
  const events = decideSweep({ now, docs: [doc({ kind: 'quote', documentNumber: 49, validUntil: daysAhead(2), sentAt: daysAgo(2) })] });
  assert.ok(events.some((e) => e.kind === 'estimate_expiring_soon'));
  assert.equal(events.find((e) => e.kind === 'estimate_expiring_soon')?.documentKind, 'quote');
});

test('an estimate that went out two weeks ago is stale', () => {
  assert.ok(kindOf([doc({ kind: 'quote', status: 'sent', sentAt: daysAgo(20), validUntil: daysAhead(30) })]).includes('estimate_stale'));
});

test('an old draft that never went out is surfaced once', () => {
  const events = decideSweep({ now, docs: [doc({ status: 'draft', createdAt: daysAgo(3), sentAt: null })] }).filter((e) => e.kind === 'draft_unsent');
  assert.equal(events.length, 1);
  assert.equal(events[0].dedupeKey, 'draft_unsent:d1:once');
  assert.ok(!kindOf([doc({ status: 'draft', createdAt: daysAgo(1), sentAt: null })]).includes('draft_unsent'));
});

test('a sweep over a healthy book writes nothing', () => {
  assert.deepEqual(kindOf([
    doc({ id: 'a', status: 'sent', dueDate: daysAhead(12), sentAt: daysAgo(1) }),
    doc({ id: 'b', status: 'paid', amountPaid: 150, dueDate: daysAhead(-9), sentAt: daysAgo(30) }),
    doc({ id: 'c', kind: 'quote', status: 'draft', createdAt: daysAgo(1), sentAt: null }),
  ]), []);
});
