import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE5_TIME_EVENTS, decideSweep, eventAction, eventCard, eventDedupeKey, eventVisibleInChat,
  hourBucket, periodBucket, splitEventsByMessage, type EventRow, type SweepDoc,
} from './events';

const dollars = (n: number) => `$${n.toFixed(2)}`;
const now = new Date('2026-11-08T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400e3).toISOString();
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3600e3).toISOString();
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

// ── Only two cards ask for a decision ──────────────────────────────────────

test('only a signed estimate and an overdue invoice carry an action', () => {
  assert.equal(eventAction('estimate_signed'), 'convert');
  assert.equal(eventAction('invoice_overdue'), 'remind');
  for (const k of ['invoice_viewed', 'payment_recorded', 'paid_in_full', 'invoice_due_soon', 'estimate_stale']) {
    assert.equal(eventAction(k), null);
  }
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

test('an estimate close to its valid-until date is expiring soon', () => {
  const events = decideSweep({ now, docs: [doc({ kind: 'quote', documentNumber: 49, validUntil: daysAhead(2), sentAt: daysAgo(2) })] });
  const expiring = events.find((e) => e.kind === 'estimate_expiring_soon');
  assert.ok(expiring);
  assert.equal(expiring?.documentKind, 'quote');
});

test('phase 5 is off: no stale or unsent-draft cards are planned', () => {
  assert.equal(PHASE5_TIME_EVENTS, false);
  assert.deepEqual(kindOf([doc({ sentAt: daysAgo(20), dueDate: daysAhead(30) })]), []);
  assert.deepEqual(kindOf([doc({ kind: 'quote', sentAt: daysAgo(20), validUntil: daysAhead(30) })]), []);
  assert.deepEqual(kindOf([doc({ status: 'draft', createdAt: daysAgo(9), sentAt: null })]), []);
});

test('the planner still knows the gated kinds, with phase 5 thresholds', () => {
  // Stale = 4 days (not the 14 a draft of this file once carried)...
  const stale = decideSweep({ now, docs: [doc({ sentAt: daysAgo(5), dueDate: daysAhead(30) })], phase5: true })
    .filter((e) => e.kind === 'invoice_stale');
  assert.equal(stale.length, 1);
  assert.match(stale[0].dedupeKey, /^invoice_stale:d1:w\d+$/);
  assert.deepEqual(
    decideSweep({ now, docs: [doc({ sentAt: daysAgo(3), dueDate: daysAhead(30) })], phase5: true })
      .filter((e) => e.kind === 'invoice_stale'),
    [],
  );

  // ...and an estimate that went out five days ago is stale too.
  assert.ok(decideSweep({ now, docs: [doc({ kind: 'quote', sentAt: daysAgo(5), validUntil: daysAhead(30) })], phase5: true })
    .some((e) => e.kind === 'estimate_stale'));

  // A draft is unsent after 24 HOURS, not two days.
  assert.equal(decideSweep({ now, docs: [doc({ status: 'draft', createdAt: hoursAgo(25), sentAt: null })], phase5: true })
    .filter((e) => e.kind === 'draft_unsent').length, 1);
  assert.equal(decideSweep({ now, docs: [doc({ status: 'draft', createdAt: hoursAgo(20), sentAt: null })], phase5: true })
    .filter((e) => e.kind === 'draft_unsent').length, 0);
  assert.equal(decideSweep({ now, docs: [doc({ status: 'draft', createdAt: daysAgo(1), sentAt: null })], phase5: true })
    .filter((e) => e.kind === 'draft_unsent').length, 1);
});

test('a sweep over a healthy book writes nothing', () => {
  assert.deepEqual(kindOf([
    doc({ id: 'a', status: 'sent', dueDate: daysAhead(12), sentAt: daysAgo(1) }),
    doc({ id: 'b', status: 'paid', amountPaid: 150, dueDate: daysAhead(-9), sentAt: daysAgo(30) }),
    doc({ id: 'c', kind: 'quote', status: 'draft', createdAt: daysAgo(1), sentAt: null }),
  ]), []);
});

// ── Interleaving ───────────────────────────────────────────────────────────

const at = (n: number) => now.getTime() + n * 60_000; // minutes from `now`
const stamp = (n: number) => new Date(at(n)).toISOString();
const ev = (id: string, n: number) => row({ id, occurred_at: stamp(n) });

test('a card sits immediately before the first message that happened after it', () => {
  const { between, trailing } = splitEventsByMessage(
    [ev('e1', 5)],
    [{ id: 'm1', at: at(0) }, { id: 'm2', at: at(10) }],
  );
  assert.deepEqual(Object.keys(between), ['m2']);
  assert.deepEqual(between.m2.map((e) => e.id), ['e1']);
  assert.deepEqual(trailing, []);
});

test('a card older than the oldest timestamped message falls to the end', () => {
  const { between, trailing } = splitEventsByMessage(
    [ev('e1', -10)],
    [{ id: 'm1', at: at(0) }, { id: 'm2', at: at(10) }],
  );
  assert.deepEqual(between, {});
  assert.deepEqual(trailing.map((e) => e.id), ['e1']);
});

test('a card newer than the last message falls to the end', () => {
  const { between, trailing } = splitEventsByMessage([ev('e1', 30)], [{ id: 'm1', at: at(0) }]);
  assert.deepEqual(between, {});
  assert.deepEqual(trailing.map((e) => e.id), ['e1']);
});

test('messages saved before `at` existed never receive a card', () => {
  const { between, trailing } = splitEventsByMessage([ev('e1', 5)], [{ id: 'old' }]);
  assert.deepEqual(between, {});
  assert.deepEqual(trailing.map((e) => e.id), ['e1']);
});

test('several cards keep their order and split across messages', () => {
  const { between, trailing } = splitEventsByMessage(
    [ev('e3', 25), ev('e1', 3), ev('e2', 15)],
    [{ id: 'm1', at: at(0) }, { id: 'm2', at: at(10) }, { id: 'm3', at: at(20) }],
  );
  assert.deepEqual(between.m2.map((e) => e.id), ['e1']);
  assert.deepEqual(between.m3.map((e) => e.id), ['e2']);
  assert.deepEqual(trailing.map((e) => e.id), ['e3']);
});

test('each card appears exactly once', () => {
  const events = [ev('a', 3), ev('b', 12), ev('c', 19), ev('d', 40)];
  const { between, trailing } = splitEventsByMessage(events, [{ id: 'm1', at: at(0) }, { id: 'm2', at: at(10) }, { id: 'm3', at: at(20) }]);
  const seen = [...Object.values(between).flat(), ...trailing].map((e) => e.id).sort();
  assert.deepEqual(seen, ['a', 'b', 'c', 'd']);
});

// ── Item 1: estimate_signed + the viewed rules ─────────────────────────────

import { VIEW_GRACE_MS, estimateSignedDedupeKey, shouldPostEstimateViewed } from './events';

test('a signed estimate never posts a viewed card', () => {
  assert.equal(shouldPostEstimateViewed({ approvedAt: hoursAgo(1), sentAt: daysAgo(2) }, now), false);
});

test('a view inside two minutes of the send is not a client view', () => {
  const justSent = new Date(now.getTime() - (VIEW_GRACE_MS - 1000)).toISOString();
  assert.equal(shouldPostEstimateViewed({ approvedAt: null, sentAt: justSent }, now), false);
});

test('a view at or past two minutes after the send posts', () => {
  const exactly = new Date(now.getTime() - VIEW_GRACE_MS).toISOString();
  assert.equal(shouldPostEstimateViewed({ approvedAt: null, sentAt: exactly }, now), true);
  assert.equal(shouldPostEstimateViewed({ approvedAt: null, sentAt: daysAgo(1) }, now), true);
});

test('an unknown send time does not block a view', () => {
  assert.equal(shouldPostEstimateViewed({ approvedAt: null, sentAt: null }, now), true);
});

test('the signed card dedupes on the estimate id alone', () => {
  assert.equal(estimateSignedDedupeKey('abc-123'), 'estimate_signed:abc-123');
});

// ── Item 2: the preview emitter ────────────────────────────────────────────

import { EVENT_KINDS, isEventKind, testEventFields } from './events';

test('every known kind has a fixture that renders a real card, flagged as a test', () => {
  for (const kind of EVENT_KINDS) {
    const f = testEventFields(kind);
    assert.equal(f.meta.test, true, kind);
    const card = eventCard({ kind, client_name: f.clientName, amount: f.amount, document_kind: f.documentKind, document_number: f.documentNumber, meta: f.meta, occurred_at: now.toISOString() }, dollars);
    assert.notEqual(card.title, 'Something happened', kind);
  }
});

test('isEventKind accepts known kinds and refuses anything else', () => {
  assert.equal(isEventKind('estimate_signed'), true);
  assert.equal(isEventKind('drop table'), false);
  assert.equal(isEventKind(''), false);
});

// ── Refresh: seen cards stay in a restored thread ──────────────────────────

import { chatStartedAtFrom } from './events';

test('a restored thread starts at its oldest message, not at page load', () => {
  const loadedAt = now.getTime();
  const start = chatStartedAtFrom([{ at: loadedAt - 3 * 3600e3 }, { at: loadedAt - 1 * 3600e3 }, {}], loadedAt);
  assert.equal(start, new Date(loadedAt - 3 * 3600e3).toISOString());
});

test('a seen card that landed during the restored thread is still shown after a refresh', () => {
  const start = chatStartedAtFrom([{ at: now.getTime() - 2 * 3600e3 }], now.getTime());
  const seen = { occurred_at: new Date(now.getTime() - 3600e3).toISOString(), seen_at: now.toISOString() };
  assert.equal(eventVisibleInChat(seen, start), true);
  // The old behaviour: the start was the mount time, which hides it.
  assert.equal(eventVisibleInChat(seen, now.toISOString()), false);
});

test('a seen card from before the thread began stays hidden; an unseen one never is', () => {
  const start = chatStartedAtFrom([{ at: now.getTime() - 3600e3 }], now.getTime());
  const old = new Date(now.getTime() - 5 * 3600e3).toISOString();
  assert.equal(eventVisibleInChat({ occurred_at: old, seen_at: old }, start), false);
  assert.equal(eventVisibleInChat({ occurred_at: old, seen_at: null }, start), true);
});

test('with no timestamped message the fallback is used', () => {
  assert.equal(chatStartedAtFrom([{}], 1000), new Date(1000).toISOString());
});
