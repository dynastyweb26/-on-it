// The public payload's decision table: what is visible, what is blanked, and
// the one unavailable answer that keeps a token from being probed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPublicEstimate, type PublicModelInput } from './public-model';
import { CONSENT_V1 } from './consent';

const NOW = new Date('2026-10-23T18:00:00.000Z'); // 13:00 America/Chicago

const invoice = (over: Partial<PublicModelInput['invoice']> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  invoice_number: 12,
  status: 'sent',
  deleted_at: null,
  approved_at: null,
  revoked_at: null,
  valid_until: '2026-10-30',
  client_name: 'Mike Davis',
  client_address: '12 Oak St',
  title: 'Deck rebuild',
  line_items: [
    { description: 'Deck repair', qty: '2', unit_price: '150', unit: 'hour', detail: 'Back yard' },
  ],
  subtotal: '300',
  tax_rate: 0,
  tax_amount: 0,
  total: '300',
  notes: 'Thanks',
  ...over,
});

const profile = (over: Partial<PublicModelInput['profile']> = {}) => ({
  business_name: 'Acme',
  logo_url: 'https://example.com/logo.png',
  brand_colors: ['#111111'],
  background_color: '#ffffff',
  website_url: 'https://example.com',
  slogan: 'We fix things',
  business_phone: '(555) 010-2200',
  business_email: 'hello@acme.test',
  timezone: 'America/Chicago',
  ...over,
});

const input = (over: Partial<PublicModelInput> = {}): PublicModelInput => ({
  invoice: invoice(),
  profile: profile(),
  attachments: [],
  signature: null,
  converted: false,
  contentHash: 'a'.repeat(64),
  now: NOW,
  ...over,
});

test('a sent, unsigned estimate is pending with the whole payload', () => {
  const out = toPublicEstimate(input());
  assert.equal(out.state, 'pending');
  if (!('business' in out)) return;
  assert.equal(out.invoiceNumber, 12);
  assert.equal(out.clientName, 'Mike Davis');
  assert.equal(out.title, 'Deck rebuild');
  assert.equal(out.address, '12 Oak St');
  assert.deepEqual(out.lineItems, [
    { description: 'Deck repair', qty: 2, unitPrice: 150, unit: 'hour', detail: 'Back yard' },
  ]);
  assert.equal(out.subtotal, 300);
  assert.equal(out.taxRate, 0);
  assert.equal(out.taxAmount, 0);
  assert.equal(out.total, 300);
  assert.equal(out.notes, 'Thanks');
  assert.equal(out.validUntil, '2026-10-30');
  assert.equal(out.daysRemaining, 7); // Oct 23 → Oct 30, business-local
  assert.equal(out.business.name, 'Acme');
  assert.equal(out.business.phone, '(555) 010-2200');
  assert.equal(out.business.email, 'hello@acme.test');
  assert.equal(out.business.logoUrl, 'https://example.com/logo.png');
  assert.deepEqual(out.business.brandColors, ['#111111']);
  assert.deepEqual(out.consent, { text: CONSENT_V1, version: '1' });
  assert.equal(out.contentHash, 'a'.repeat(64));
});

test('the payload carries no owner id or storage path', () => {
  const out = toPublicEstimate(
    input({
      attachments: [
        { id: 'a1', mimeType: 'application/pdf', sizeBytes: 10, url: 'https://s/x', caption: 'Site photo' },
      ],
    }),
  );
  const json = JSON.stringify(out);
  assert.equal(json.includes('user_id'), false);
  assert.equal(json.includes('storage_path'), false);
  assert.equal(json.includes('11111111-1111-4111-8111-111111111111'), false);
});

test('a draft, revoked, converted or deleted estimate is unavailable', () => {
  for (const over of [
    { status: 'draft' },
    { revoked_at: '2026-10-22T12:00:00.000Z' },
    { status: 'void' },
    { deleted_at: '2026-10-22T12:00:00.000Z' },
  ]) {
    assert.deepEqual(toPublicEstimate(input({ invoice: invoice(over) })), { state: 'unavailable' });
  }
  assert.deepEqual(toPublicEstimate(input({ converted: true })), { state: 'unavailable' });
});

test('expiry is the END of valid_until in the business timezone', () => {
  // 2026-10-22 23:59 Chicago = 2026-10-23 04:59Z, still inside the day.
  const before = toPublicEstimate(
    input({ invoice: invoice({ valid_until: '2026-10-22' }), now: new Date('2026-10-23T04:59:00Z') }),
  );
  assert.equal(before.state, 'pending');
  if ('daysRemaining' in before) assert.equal(before.daysRemaining, 0);

  // 2026-10-23 00:00 Chicago = 05:00Z, now expired.
  const after = toPublicEstimate(
    input({ invoice: invoice({ valid_until: '2026-10-22' }), now: new Date('2026-10-23T05:00:00Z') }),
  );
  assert.equal(after.state, 'expired');
  if ('daysRemaining' in after) assert.equal(after.daysRemaining, 0);
});

test('title and business contact blank to null when empty or whitespace', () => {
  const out = toPublicEstimate(
    input({
      invoice: invoice({ title: '   ' }),
      profile: profile({ business_phone: '', business_email: null }),
    }),
  );
  if (!('business' in out)) throw new Error('expected a payload');
  assert.equal(out.title, null);
  assert.equal(out.business.phone, null);
  assert.equal(out.business.email, null);
});

test('an attachment caption travels with the attachment', () => {
  const out = toPublicEstimate(
    input({
      attachments: [
        { id: 'a1', mimeType: 'image/png', sizeBytes: 10, url: 'https://s/x', caption: 'Before' },
        { id: 'a2', mimeType: 'image/png', sizeBytes: 10, url: 'https://s/y', caption: null },
      ],
    }),
  );
  if (!('attachments' in out)) throw new Error('expected a payload');
  assert.deepEqual(
    out.attachments.map((a) => a.caption),
    ['Before', null],
  );
});

test('an unrecognised timezone falls back to America/Chicago', () => {
  const out = toPublicEstimate(
    input({
      profile: profile({ timezone: 'Not/AZone' }),
      invoice: invoice({ valid_until: '2026-10-22' }),
      now: new Date('2026-10-23T05:00:00Z'),
    }),
  );
  assert.equal(out.state, 'expired');
});

test('approved wins over expiry and exposes the signature', () => {
  const out = toPublicEstimate(
    input({
      invoice: invoice({
        valid_until: '2026-01-01',
        approved_at: '2026-10-20T15:00:00.000Z',
      }),
      signature: {
        signerName: 'Mike Davis',
        type: 'type',
        data: 'Mike Davis',
        signedAt: '2026-10-20T15:00:00.000Z',
      },
    }),
  );
  assert.equal(out.state, 'approved');
  if (!('business' in out)) return;
  assert.equal(out.daysRemaining, null);
  assert.equal(out.signature?.signerName, 'Mike Davis');
});

test('a legacy estimate with no valid_until never expires', () => {
  const out = toPublicEstimate(input({ invoice: invoice({ valid_until: null }) }));
  assert.equal(out.state, 'pending');
  if ('daysRemaining' in out) assert.equal(out.daysRemaining, null);
});

test('preview renders a draft; the public payload never does', () => {
  const draft = input({ invoice: invoice({ status: 'draft' }) });
  assert.deepEqual(toPublicEstimate(draft), { state: 'unavailable' });
  const preview = toPublicEstimate({ ...draft, preview: true });
  assert.equal(preview.state, 'pending');
});

test('preview still hides a deleted or revoked estimate', () => {
  assert.deepEqual(
    toPublicEstimate({
      ...input({ invoice: invoice({ status: 'draft', revoked_at: '2026-10-22T12:00:00Z' }) }),
      preview: true,
    }),
    { state: 'unavailable' },
  );
});
