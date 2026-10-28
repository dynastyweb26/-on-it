// The send route's decision table. These tests pin the two rules that matter:
// only a draft becomes sent, and a resend never regresses paid/overdue or
// re-snapshots. Non-owner, deleted and void rows are refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInvoiceSend } from './invoice-send';

const U = '1f58b401-e1b1-41e9-b11f-df5530872007';
const OTHER = '2a58b401-e1b1-41e9-b11f-df5530872008';
const NOW = '2026-10-20T12:00:00.000Z';

const profile = {
  invoice_template: 'classic',
  brand_colors: ['#111111'],
  background_color: '#ffffff',
  business_name: 'Acme',
  logo_url: 'https://example.com/logo.png',
  website_url: 'https://example.com',
  slogan: 'We fix things',
  cashapp_tag: '$acme',
  paypal_me: '@acme',
  venmo_username: '@acme',
};

const invoice = (status: string | null) => ({
  id: 'inv-1',
  user_id: U,
  status,
  deleted_at: null,
});

test('draft becomes sent and captures the render snapshot', () => {
  const plan = planInvoiceSend(invoice('draft'), U, profile, NOW);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.firstSend, true);
  assert.deepEqual(plan.patch, {
    status: 'sent',
    sent_at: NOW,
    template: 'classic',
    brand_colors: ['#111111'],
    background_color: '#ffffff',
    color_roles_explicit: false,
    business_name: 'Acme',
    logo_url: 'https://example.com/logo.png',
    website_url: 'https://example.com',
    slogan: 'We fix things',
    cashapp_tag: '$acme',
    paypal_me: '@acme',
    venmo_username: '@acme',
  });
});

test('legacy null status is treated as a first send', () => {
  const plan = planInvoiceSend(invoice(null), U, profile, NOW);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.firstSend, true);
  assert.equal(plan.patch.status, 'sent');
});

test('resending a sent invoice only bumps sent_at', () => {
  const plan = planInvoiceSend(invoice('sent'), U, profile, NOW);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.firstSend, false);
  assert.deepEqual(plan.patch, { sent_at: NOW });
  assert.equal('status' in plan.patch, false);
  assert.equal('template' in plan.patch, false);
});

test('resending a paid invoice never regresses it to sent', () => {
  const plan = planInvoiceSend(invoice('paid'), U, profile, NOW);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.firstSend, false);
  assert.deepEqual(plan.patch, { sent_at: NOW });
  assert.equal('status' in plan.patch, false);
});

test('resending an overdue invoice keeps it overdue', () => {
  const plan = planInvoiceSend(invoice('overdue'), U, profile, NOW);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.patch, { sent_at: NOW });
  assert.equal('status' in plan.patch, false);
});

test('a non-owner is refused', () => {
  const plan = planInvoiceSend(invoice('draft'), OTHER, profile, NOW);
  assert.deepEqual(plan, { ok: false, reason: 'not_owner' });
});

test('a deleted invoice is refused', () => {
  const plan = planInvoiceSend(
    { ...invoice('draft'), deleted_at: '2026-10-19T12:00:00.000Z' },
    U,
    profile,
    NOW,
  );
  assert.deepEqual(plan, { ok: false, reason: 'deleted' });
});

test('a void invoice is refused', () => {
  const plan = planInvoiceSend(invoice('void'), U, profile, NOW);
  assert.deepEqual(plan, { ok: false, reason: 'void' });
});

test('a missing invoice is refused', () => {
  assert.deepEqual(planInvoiceSend(null, U, profile, NOW), {
    ok: false,
    reason: 'not_found',
  });
});

// Mirrors the UUID contract used by isUuid (estimates/owner.ts). The route guard
// rejects a malformed id before any DB read; importing the real guard here is not
// possible because owner.ts is marked server-only.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('a non-UUID id is rejected', () => {
  assert.equal(UUID_RE.test(U), true);
  assert.equal(UUID_RE.test('not-a-uuid'), false);
  assert.equal(UUID_RE.test("123'; DROP TABLE invoices; --"), false);
  assert.equal(UUID_RE.test(''), false);
});

test('first send freezes the terms; empty terms never write the column; resend never re-snapshots', () => {
  const withTerms = planInvoiceSend(invoice('draft'), U, { ...profile, terms: '  Net 15.  ' }, NOW);
  assert.ok(withTerms.ok && withTerms.patch.terms === 'Net 15.');

  const empty = planInvoiceSend(invoice('draft'), U, { ...profile, terms: '   ' }, NOW);
  assert.ok(empty.ok && !('terms' in empty.patch));

  const none = planInvoiceSend(invoice('draft'), U, profile, NOW);
  assert.ok(none.ok && !('terms' in none.patch));

  const resend = planInvoiceSend(invoice('sent'), U, { ...profile, terms: 'Changed later' }, NOW);
  assert.ok(resend.ok && !('terms' in resend.patch));
});
