import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PHASE5_TIME_EVENTS, decideSweep, eventAction, eventCard, eventDedupeKey, eventToasts,
  eventVisibleInChat, hourBucket, periodBucket, splitEventsByMessage, sweepAllowedIn,
  type EventKind, type EventRow, type SweepDoc,
} from './events';

const dollars = (n: number) => `$${n.toFixed(2)}`;
const now = new Date('2026-11-08T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400e3).toISOString();
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3600e3).toISOString();
const daysAhead = (n: number) => new Date(now.getTime() + n * 86400e3).toISOString().slice(0, 10);

const doc = (over: Partial<SweepDoc>): SweepDoc => ({
  id: 'd1', kind: 'invoice', status: 'sent', documentNumber: 29, clientName: 'Brandon',
  total: 150, amountPaid: 0, dueDate: daysAhead(10), validUntil: null,
  createdAt: daysAgo(5), sentAt: daysAgo(3),
  firstSentAt: null, updatedAt: null, approvedAt: null, deletedAt: null, converted: false,
  ...over,
});

const kindOf = (docs: SweepDoc[]) => decideSweep({ now, docs }).map((e) => e.kind);
// Every gated kind, for the planner's own tests. Production only opens
// estimate_stale (PHASE5_TIME_EVENTS).
const PHASE5_ALL = new Set<EventKind>(['invoice_stale', 'estimate_stale', 'draft_unsent']);

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
  for (const k of ['invoice_viewed', 'payment_recorded', 'paid_in_full', 'invoice_due_soon', 'invoice_stale', 'draft_unsent']) {
    assert.equal(eventAction(k), null);
  }
  // Item 19: the stale estimate offers the existing Share, never a reminder.
  assert.equal(eventAction('estimate_stale'), 'share');
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
  // Per kind, not a blanket flip: only the estimate card item 19 asked for.
  assert.deepEqual([...PHASE5_TIME_EVENTS], ['estimate_stale']);
  assert.deepEqual(kindOf([doc({ sentAt: daysAgo(20), dueDate: daysAhead(30) })]), []);
  assert.deepEqual(kindOf([doc({ kind: 'quote', sentAt: daysAgo(20), validUntil: daysAhead(30) })]), []);
  assert.deepEqual(kindOf([doc({ status: 'draft', createdAt: daysAgo(9), sentAt: null })]), []);
});

test('the planner still knows the gated kinds, with phase 5 thresholds', () => {
  // Stale = 4 days (not the 14 a draft of this file once carried)...
  const stale = decideSweep({ now, docs: [doc({ sentAt: daysAgo(5), dueDate: daysAhead(30) })], phase5: PHASE5_ALL })
    .filter((e) => e.kind === 'invoice_stale');
  assert.equal(stale.length, 1);
  assert.match(stale[0].dedupeKey, /^invoice_stale:d1:w\d+$/);
  assert.deepEqual(
    decideSweep({ now, docs: [doc({ sentAt: daysAgo(3), dueDate: daysAhead(30) })], phase5: PHASE5_ALL })
      .filter((e) => e.kind === 'invoice_stale'),
    [],
  );

  // ...and an estimate that went out five days ago is stale too.
  assert.ok(decideSweep({ now, docs: [doc({
    kind: 'quote', sentAt: daysAgo(5), firstSentAt: daysAgo(5), updatedAt: daysAgo(5), validUntil: daysAhead(30),
  })], phase5: PHASE5_ALL })
    .some((e) => e.kind === 'estimate_stale'));

  // A draft is unsent after 24 HOURS, not two days.
  assert.equal(decideSweep({ now, docs: [doc({ status: 'draft', createdAt: hoursAgo(25), sentAt: null })], phase5: PHASE5_ALL })
    .filter((e) => e.kind === 'draft_unsent').length, 1);
  assert.equal(decideSweep({ now, docs: [doc({ status: 'draft', createdAt: hoursAgo(20), sentAt: null })], phase5: PHASE5_ALL })
    .filter((e) => e.kind === 'draft_unsent').length, 0);
  assert.equal(decideSweep({ now, docs: [doc({ status: 'draft', createdAt: daysAgo(1), sentAt: null })], phase5: PHASE5_ALL })
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

// ── Item 19: estimate_stale, the one open time event ──────────────────────

const staleQuote = (over: Partial<SweepDoc> = {}) => doc({
  id: 'q1', kind: 'quote', status: 'sent', documentNumber: 49, clientName: 'Catie',
  total: 50, amountPaid: 0, dueDate: null, validUntil: null,
  createdAt: daysAgo(9), sentAt: daysAgo(4), firstSentAt: daysAgo(4), updatedAt: daysAgo(4),
  ...over,
});
const staleOnly = (docs: SweepDoc[]) => decideSweep({ now, docs }).filter((e) => e.kind === 'estimate_stale');

test('an estimate goes stale at exactly four days, not an hour sooner', () => {
  assert.deepEqual(staleOnly([staleQuote({ firstSentAt: hoursAgo(95) })]), [], '3d23h');
  assert.equal(staleOnly([staleQuote({ firstSentAt: hoursAgo(96) })]).length, 1, '4d');
});

test('a resend never restarts the stale clock, and a revision does', () => {
  // sent_at is newer than first_sent_at (a resend): still stale.
  assert.equal(staleOnly([staleQuote({ sentAt: daysAgo(1), firstSentAt: daysAgo(6), updatedAt: daysAgo(1) })]).length, 0,
    'revised a day ago is silent: the owner acted');
  assert.equal(staleOnly([staleQuote({ sentAt: daysAgo(1), firstSentAt: daysAgo(6), updatedAt: daysAgo(6) })]).length, 1,
    'a resend of an untouched estimate is still stale');
});

test('signed, converted, deleted and revised estimates are never chased', () => {
  assert.deepEqual(staleOnly([staleQuote({ status: 'approved' })]), [], 'signed');
  assert.deepEqual(staleOnly([staleQuote({ approvedAt: daysAgo(1) })]), [], 'approved_at');
  assert.deepEqual(staleOnly([staleQuote({ converted: true })]), [], 'converted');
  assert.deepEqual(staleOnly([staleQuote({ deletedAt: daysAgo(1) })]), [], 'deleted');
  assert.deepEqual(staleOnly([staleQuote({ firstSentAt: daysAgo(12), updatedAt: daysAgo(3) })]), [], 'revised 3d ago');
  assert.equal(staleOnly([staleQuote({ firstSentAt: daysAgo(12), updatedAt: daysAgo(4) })]).length, 1, 'quiet 4d');
});

test('a stale estimate posts once, ever, keyed on its threshold', () => {
  const [e] = staleOnly([staleQuote()]);
  assert.equal(e.kind, 'estimate_stale');
  assert.equal(e.dedupeKey, 'estimate_stale:q1:4d');
  assert.equal(e.meta.first_sent_at, daysAgo(4));
  assert.equal(e.meta.days_stale, 4);
  assert.equal(e.invoiceId, 'q1');
  assert.equal(e.documentKind, 'quote');
});

test('the gate is per kind: a default sweep returns estimate_stale only', () => {
  const events = decideSweep({ now, docs: [
    staleQuote(),
    doc({ id: 'i1', status: 'sent', sentAt: daysAgo(20), firstSentAt: daysAgo(20), updatedAt: daysAgo(20), dueDate: daysAhead(30) }),
    doc({ id: 'd1', status: 'draft', createdAt: daysAgo(9), sentAt: null, firstSentAt: null, updatedAt: daysAgo(9) }),
  ]});
  assert.deepEqual(events.map((e) => e.kind), ['estimate_stale']);
  assert.equal(PHASE5_TIME_EVENTS.has('invoice_stale'), false);
  assert.equal(PHASE5_TIME_EVENTS.has('draft_unsent'), false);
  assert.equal(PHASE5_TIME_EVENTS.has('estimate_stale'), true);
});

test('the stale card names the client and the days, and offers Share only', () => {
  const card = eventCard(row({
    kind: 'estimate_stale', client_name: 'Catie', document_kind: 'quote',
    document_number: 49, amount: 50, meta: { days_stale: 4 },
  }), dollars);
  assert.equal(card.title, "Catie's estimate hasn't been signed in 4 days");
  assert.equal(card.detail, 'E-0049 · $50.00');
  assert.equal(card.tone, 'neutral');
  assert.equal(eventAction('estimate_stale'), 'share');
  assert.notEqual(eventAction('estimate_stale'), 'remind');
});

test('time events never toast; client events still do', () => {
  assert.equal(eventToasts({ actor: 'time', kind: 'estimate_stale' }), false);
  assert.equal(eventToasts({ actor: 'time', kind: 'invoice_overdue' }), false);
  assert.equal(eventToasts({ actor: 'client', kind: 'estimate_signed' }), true);
  assert.equal(eventToasts({ actor: 'client', kind: 'invoice_overdue' }), true);
  // The host must apply it on BOTH paths: catch-up on open, and a live insert.
  const src = readFileSync('src/components/events/EventToastHost.tsx', 'utf8');
  assert.equal((src.match(/eventToasts\(/g) ?? []).length, 2);
});

test('the sweep runs in production only, so a preview cannot write to the shared DB', () => {
  assert.equal(sweepAllowedIn('production'), true);
  assert.equal(sweepAllowedIn('preview'), false);
  assert.equal(sweepAllowedIn('development'), false);
});

// ── Item 19's flood cap ────────────────────────────────────────────────────

const fiveStale = () => [5, 6, 7, 8, 9].map((d, i) => staleQuote({
  id: `q${i + 1}`, firstSentAt: daysAgo(d), updatedAt: daysAgo(d),
}));

test('one run posts at most three stale estimates per owner, oldest first', () => {
  // q5 (9d), q4 (8d) and q3 (7d) are the oldest; q1 (5d) and q2 (6d) wait.
  const posted = staleOnly(fiveStale()).map((e) => e.invoiceId).sort();
  assert.deepEqual(posted, ['q3', 'q4', 'q5']);
  assert.equal(staleOnly(fiveStale()).length, 3);
});

test('an estimate first sent more than thirty days ago is abandoned', () => {
  assert.deepEqual(staleOnly([staleQuote({ firstSentAt: daysAgo(31), updatedAt: daysAgo(31) })]), []);
  assert.equal(staleOnly([staleQuote({ firstSentAt: daysAgo(30), updatedAt: daysAgo(30) })]).length, 1);
});

test('the next run posts the ones the cap held back', () => {
  const docs = fiveStale();
  const first = staleOnly(docs).map((e) => e.invoiceId);
  const second = decideSweep({ now, docs, posted: new Set(first) })
    .filter((e) => e.kind === 'estimate_stale').map((e) => e.invoiceId).sort();
  assert.deepEqual(second, ['q1', 'q2']);
});

test('the cap is per owner, so a big book cannot crowd out a small one', () => {
  const docs = [
    ...[1, 2, 3, 4].map((i) => staleQuote({ id: `a${i}`, ownerId: 'u1', firstSentAt: daysAgo(4 + i), updatedAt: daysAgo(4 + i) })),
    staleQuote({ id: 'b1', ownerId: 'u2', firstSentAt: daysAgo(5), updatedAt: daysAgo(5) }),
  ];
  const got = staleOnly(docs).map((e) => e.invoiceId);
  assert.equal(got.length, 4);
  assert.ok(got.includes('b1'));
  assert.equal(got.filter((id) => id.startsWith('a')).length, 3);
});

// ── Item 25: the near-due producers ────────────────────────────────────────

const dueSoonOnly = (docs: SweepDoc[]) => decideSweep({ now, docs }).filter((e) => e.kind === 'invoice_due_soon');
const expiringOnly = (docs: SweepDoc[]) => decideSweep({ now, docs }).filter((e) => e.kind === 'estimate_expiring_soon');
const expiringQuote = (over: Partial<SweepDoc> = {}) => staleQuote({ validUntil: daysAhead(3), ...over });

test('due soon starts at three days out, and a settled or deleted invoice is skipped', () => {
  assert.equal(dueSoonOnly([doc({ id: 'i1', dueDate: daysAhead(3) })]).length, 1);
  assert.deepEqual(dueSoonOnly([doc({ id: 'i1', dueDate: daysAhead(4) })]), [], '4 days out');
  assert.deepEqual(dueSoonOnly([doc({ id: 'i1', dueDate: daysAhead(2), total: 100, amountPaid: 100 })]), [], 'paid');
  assert.deepEqual(dueSoonOnly([doc({ id: 'i1', dueDate: daysAhead(2), deletedAt: daysAgo(1) })]), [], 'deleted');
});

test('expiring soon skips a signed, converted or deleted estimate', () => {
  const [e] = expiringOnly([expiringQuote()]);
  assert.equal(e.dedupeKey, `estimate_expiring_soon:q1:${daysAhead(3)}`);
  assert.deepEqual(expiringOnly([expiringQuote({ validUntil: daysAhead(4) })]), [], '4 days out');
  assert.deepEqual(expiringOnly([expiringQuote({ approvedAt: daysAgo(1) })]), [], 'signed');
  assert.deepEqual(expiringOnly([expiringQuote({ converted: true })]), [], 'converted');
  assert.deepEqual(expiringOnly([expiringQuote({ deletedAt: daysAgo(1) })]), [], 'deleted');
});

const fourDue = () => [0, 1, 2, 3].map((n) => doc({ id: `i${n}`, ownerId: 'u1', dueDate: daysAhead(n) }));

test('one run posts at most three near-due cards per owner, soonest first', () => {
  const got = dueSoonOnly(fourDue());
  assert.equal(got.length, 3);
  assert.deepEqual(got.map((e) => e.invoiceId), ['i0', 'i1', 'i2']);
});

test('a posted near-due card frees its slot for the one the cap held back', () => {
  const docs = fourDue();
  const postedKeys = new Set(dueSoonOnly(docs).map((e) => e.dedupeKey));
  const second = decideSweep({ now, docs, postedKeys }).filter((e) => e.kind === 'invoice_due_soon');
  assert.deepEqual(second.map((e) => e.invoiceId), ['i3']);
});

test('the near-due cron step is production-only and is wired into followups', () => {
  assert.equal(sweepAllowedIn('preview'), false);
  const src = readFileSync('src/lib/events-sweep.ts', 'utf8');
  const fn = src.slice(src.indexOf('export async function runDueSoonSweep'));
  assert.match(fn, /if \(!sweepAllowedIn\(env\)\) return \{ skipped: 'not production' \}/);
  const cron = readFileSync('src/app/api/followups/route.ts', 'utf8');
  assert.match(cron, /dueSoon = await runDueSoonSweep\(\)/);
});
