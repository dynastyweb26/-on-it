import { test } from 'node:test';
import assert from 'node:assert/strict';

// The dismissal store is localStorage. Tests run in Node, where it doesn't
// exist — the same "blocked storage" path the browser takes in private mode.
// A tiny in-memory stand-in lets the persistence tests run.
const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => { mem.clear(); },
  },
});

const {
  WINBACK_DAYS,
  estimateApprovedPrompt,
  firstPaymentPrompt,
  hasBeenPaid,
  markSeen,
  promptAllowedForTier,
  promptDue,
  readSeen,
  seenAt,
  usageNudge,
  winbackPrompt,
} = await import('./soft-prompts');

const U = 'user-1';
const OTHER = 'user-2';
const NOW = new Date('2026-10-25T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const freeSnap = {
  tier: 'free',
  invoiceCount: 2, invoiceLimit: 3,
  estimateCount: 2, estimateLimit: 3,
};

test('usage nudge fires one before the cap, per kind, with the count in the copy', () => {
  const inv = usageNudge('invoice', freeSnap);
  assert.equal(inv?.id, 'usage');
  assert.equal(inv?.key, 'usage:invoice');
  assert.equal(inv?.cap, 'once');
  assert.equal(inv?.action, 'wall');
  assert.equal(inv?.variant, 'invoice');
  assert.match(inv?.title ?? '', /1 free invoice left/);
  assert.match(inv?.body ?? '', /2 of 3 free invoices/);
  assert.match(inv?.reason ?? '', /2 of 3 free invoices used/);

  const est = usageNudge('estimate', freeSnap);
  assert.equal(est?.key, 'usage:estimate');
  assert.equal(est?.variant, 'estimate');
  assert.match(est?.title ?? '', /1 free estimate left/);
});

test('usage nudge stays quiet at 1 of 3, at the cap, and with no cap', () => {
  assert.equal(usageNudge('invoice', { ...freeSnap, invoiceCount: 1 }), null);
  assert.equal(usageNudge('invoice', { ...freeSnap, invoiceCount: 3 }), null);
  assert.equal(usageNudge('invoice', { ...freeSnap, invoiceLimit: null }), null);
  assert.equal(usageNudge('invoice', null), null);
  // A one-item cap has no "one before the last" moment: it is already the wall.
  assert.equal(usageNudge('invoice', { ...freeSnap, invoiceLimit: 1, invoiceCount: 0 }), null);
});

test('usage nudge tier gate: canceled sees it, every paid tier does not', () => {
  assert.ok(usageNudge('invoice', { ...freeSnap, tier: 'canceled' }));
  for (const tier of ['founder', 'trialing', 'active', 'past_due']) {
    assert.equal(usageNudge('invoice', { ...freeSnap, tier }), null);
  }
  // A missing tier is "unknown", never a paid tier.
  assert.ok(usageNudge('invoice', { ...freeSnap, tier: undefined }));
});

test('estimate-approved moment is per estimate, uses the first name, and is not a wall', () => {
  const p = estimateApprovedPrompt('Jordan Reyes', 'est-1');
  assert.equal(p.id, 'estimate-approved');
  assert.equal(p.key, 'estimate-approved:est-1');
  assert.equal(p.cap, 'once');
  assert.equal(p.action, 'convert');
  assert.equal(p.variant, 'estimate');
  assert.equal(p.title, 'Jordan approved your estimate');
  assert.match(p.body, /invoice/);
  // No client name: still a sentence, never " approved your estimate".
  assert.equal(estimateApprovedPrompt(null, 'est-2').title, 'Your estimate was approved');
  assert.equal(estimateApprovedPrompt('  ', 'est-3').title, 'Your estimate was approved');
  // A different estimate is a different moment.
  assert.notEqual(estimateApprovedPrompt('Jordan', 'est-1').key, estimateApprovedPrompt('Jordan', 'est-2').key);
});

test('first-payment prompt is once ever and opens the paywall', () => {
  const p = firstPaymentPrompt();
  assert.equal(p.id, 'first-payment');
  assert.equal(p.key, 'first-payment');
  assert.equal(p.cap, 'once');
  assert.equal(p.action, 'wall');
  assert.equal(p.variant, 'invoice');
  assert.ok(p.reason);
  mem.clear();
  assert.equal(promptDue(p, U, NOW), true);
  markSeen(U, p.key, NOW);
  assert.equal(promptDue(p, U, new Date(NOW.getTime() + 10 * 365 * DAY)), false);
});

test('first-payment fires for at least one payment row, however many there are', () => {
  assert.equal(hasBeenPaid(1), true);
  assert.equal(hasBeenPaid(2), true); // 2+ payments before the first app open still counts
  assert.equal(hasBeenPaid(40), true);
  assert.equal(hasBeenPaid(0), false);
  assert.equal(hasBeenPaid(null), false);
  assert.equal(hasBeenPaid(undefined), false);
  // And the cap is once per user, so a later payment never brings it back.
  mem.clear();
  markSeen(U, firstPaymentPrompt().key, NOW);
  assert.equal(promptDue(firstPaymentPrompt(), U, new Date(NOW.getTime() + 30 * DAY)), false);
});

test('tier gate table: upgrade prompts skip paid tiers; each special prompt has its own tier', () => {
  for (const id of ['usage', 'estimate-approved', 'first-payment'] as const) {
    assert.equal(promptAllowedForTier(id, 'free'), true);
    assert.equal(promptAllowedForTier(id, 'canceled'), true);
    for (const tier of ['founder', 'trialing', 'active', 'past_due']) {
      assert.equal(promptAllowedForTier(id, tier), false);
    }
  }
  assert.equal(promptAllowedForTier('winback', 'canceled'), true);
  assert.equal(promptAllowedForTier('winback', 'free'), false);
  // No trial prompt: a trialing customer hears from the Resend reminder email.
  assert.equal(promptAllowedForTier('winback', 'trialing'), false);
});

test('dismissals persist per user and per device, and never leak between users', () => {
  mem.clear();
  const p = usageNudge('invoice', freeSnap)!;
  assert.equal(promptDue(p, U, NOW), true);
  markSeen(U, p.key, NOW);
  assert.equal(promptDue(p, U, NOW), false);
  // Another account on the same device is unaffected.
  assert.equal(promptDue(p, OTHER, NOW), true);
  // A 'once' cap never comes back, however long you wait.
  assert.equal(promptDue(p, U, new Date(NOW.getTime() + 365 * DAY)), false);
  // And a later kind is a different key.
  assert.equal(promptDue(usageNudge('estimate', freeSnap)!, U, NOW), true);
  assert.deepEqual(readSeen(U), { 'usage:invoice': NOW.toISOString() });
  assert.equal(seenAt(U, p.key)?.toISOString(), NOW.toISOString());
});

test('blocked or corrupt storage reads as "nothing seen" and never throws', () => {
  mem.clear();
  mem.set('onit_soft_prompts_v2:broken', 'not json');
  assert.deepEqual(readSeen('broken'), {});
  mem.set('onit_soft_prompts_v2:list', '["a"]');
  assert.deepEqual(readSeen('list'), {});
  const p = usageNudge('invoice', freeSnap)!;
  assert.equal(promptDue(p, 'broken', NOW), true);
  // A non-date stamp is not a dismissal.
  mem.set('onit_soft_prompts_v2:bad-date', JSON.stringify({ [p.key]: 'yesterday' }));
  assert.equal(seenAt('bad-date', p.key), null);
  assert.equal(promptDue(p, 'bad-date', NOW), true);
});

test('win-back is copy only (no discount, no coupon) and opens the paywall', () => {
  const p = winbackPrompt();
  assert.equal(p.id, 'winback');
  assert.equal(p.cap, '14d');
  assert.equal(p.action, 'wall');
  assert.equal(p.variant, 'winback');
  assert.doesNotMatch(`${p.title} ${p.body} ${p.cta}`, /discount|coupon|% off|promo/i);
});

test('win-back 14-day cap: due again on the 14th day, not before', () => {
  mem.clear();
  const p = winbackPrompt();
  assert.equal(promptDue(p, U, NOW), true);
  markSeen(U, p.key, NOW);
  assert.equal(promptDue(p, U, new Date(NOW.getTime() + (WINBACK_DAYS - 1) * DAY)), false);
  assert.equal(promptDue(p, U, new Date(NOW.getTime() + WINBACK_DAYS * DAY)), true);
});

test('the two app banners keep their priority: win-back outranks first payment', () => {
  // /api/prompts returns eligible prompts in priority order and the client
  // shows the first one still due, so this order IS the 4 > 3 rule.
  assert.equal(winbackPrompt().id, 'winback');
  assert.equal(firstPaymentPrompt().id, 'first-payment');
  // Both stay quiet for a trialing customer — nothing upgrade-shaped there.
  for (const tier of ['trialing', 'founder', 'active', 'past_due']) {
    assert.equal(promptAllowedForTier('first-payment', tier), false);
    assert.equal(promptAllowedForTier('winback', tier), false);
  }
});
