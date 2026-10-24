import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planEstimateSend, type EstimateSendableInvoice } from './send';

const U = '1f58b401-e1b1-41e9-b11f-df5530872007';
const OTHER = '2a58b401-e1b1-41e9-b11f-df5530872008';
const NOW = new Date('2026-10-23T12:00:00Z'); // Oct 23 in Chicago

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
  timezone: 'America/Chicago',
};

const quote = (over: Partial<EstimateSendableInvoice> = {}): EstimateSendableInvoice => ({
  id: 'inv-1',
  user_id: U,
  status: 'draft',
  deleted_at: null,
  kind: 'quote',
  approved_at: null,
  valid_until: null,
  ...over,
});

const send = (
  invoice: EstimateSendableInvoice | null,
  opts: { converted?: boolean; requestedValidUntil?: string | null } = {},
) => planEstimateSend(invoice, U, profile, NOW, { converted: false, ...opts });

test('a first send captures the snapshot and fills a missing expiry', () => {
  const plan = send(quote());
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.firstSend, true);
  assert.equal(plan.patch.status, 'sent');
  assert.equal(plan.patch.sent_at, NOW.toISOString());
  assert.equal(plan.patch.valid_until, '2026-11-22');
  assert.equal(plan.patch.business_name, 'Acme');
  assert.equal(plan.patch.template, 'classic');
});

test('a resend that still has no expiry fills one without re-snapshotting', () => {
  const plan = send(quote({ status: 'sent' }));
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.firstSend, false);
  assert.deepEqual(plan.patch, { sent_at: NOW.toISOString(), valid_until: '2026-11-22' });
});

test('a resend with an existing expiry leaves it alone', () => {
  const plan = send(quote({ status: 'sent', valid_until: '2026-12-01' }));
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.patch, { sent_at: NOW.toISOString() });
});

test('a resend may replace the expiry', () => {
  const plan = send(quote({ status: 'sent', valid_until: '2026-12-01' }), {
    requestedValidUntil: '2026-12-15',
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.patch.valid_until, '2026-12-15');
});

test('the default expiry follows the business-local date, not UTC', () => {
  const late = new Date('2026-10-23T04:30:00Z'); // Oct 22 in Chicago
  const plan = planEstimateSend(quote(), U, profile, late, { converted: false });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.patch.valid_until, '2026-11-21');
});

test('a past or impossible date is refused', () => {
  assert.deepEqual(send(quote({ status: 'sent' }), { requestedValidUntil: '2026-10-01' }), {
    ok: false,
    code: 'past_date',
  });
  assert.deepEqual(send(quote({ status: 'sent' }), { requestedValidUntil: '2026-02-31' }), {
    ok: false,
    code: 'invalid_date',
  });
});

test('approved and converted estimates cannot be sent', () => {
  assert.deepEqual(send(quote({ status: 'sent', approved_at: '2026-10-20T00:00:00Z' })), {
    ok: false,
    code: 'approved',
  });
  assert.deepEqual(send(quote({ status: 'sent' }), { converted: true }), {
    ok: false,
    code: 'converted',
  });
});

test('only a quote owned by the caller can be sent', () => {
  assert.deepEqual(send(quote({ kind: 'invoice' })), { ok: false, code: 'not_estimate' });
  assert.deepEqual(
    planEstimateSend(quote({ user_id: OTHER }), U, profile, NOW, { converted: false }),
    { ok: false, code: 'not_owner' },
  );
  assert.deepEqual(send(null), { ok: false, code: 'not_found' });
  assert.deepEqual(send(quote({ deleted_at: '2026-10-20T00:00:00Z' })), {
    ok: false,
    code: 'deleted',
  });
  assert.deepEqual(send(quote({ status: 'void' })), { ok: false, code: 'void' });
});
