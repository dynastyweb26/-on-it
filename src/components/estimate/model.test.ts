// The public page's copy and color rules, asserted instead of eyeballed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_V1 } from '@/lib/estimates/consent';
import type { PublicEstimate } from '@/lib/estimates/types';
import {
  CONSENT_HELPER,
  CONSENT_LABEL,
  CONSENT_SPLIT_OK,
  PAGE_BG,
  accentText,
  brandAccent,
  estimateNumber,
  fileSize,
  initials,
  itemsLabel,
  jobLine,
  lineMeta,
  longDateTime,
  onAccentColor,
  shortDate,
  signErrorCopy,
  signedDateText,
  statusChip,
  stillNeeded,
  stillNeededText,
  taxRateLabel,
  totalSubline,
  validityText,
} from './model';
import { contrastRatio } from '@/lib/colors';

const payload = (over: Partial<PublicEstimate> = {}): PublicEstimate => ({
  state: 'pending',
  invoiceNumber: 17,
  business: {
    name: 'Acme Plumbing',
    logoUrl: null,
    brandColors: ['#1B2A4A', '#2B5CE6'],
    backgroundColor: '#1B2A4A',
    websiteUrl: null,
    slogan: null,
    phone: '(555) 010-2200',
    email: 'hello@acme.test',
    timezone: 'America/Chicago',
  },
  clientName: 'Jordan Ellis',
  title: 'Deck rebuild',
  address: '12 Oak St',
  lineItems: [{ description: 'Deck repair', qty: 2, unitPrice: 150, unit: 'hour', detail: 'Back yard' }],
  subtotal: 300,
  taxRate: 8.25,
  taxAmount: 24.75,
  total: 324.75,
  notes: null,
  terms: null,
  validUntil: '2026-11-18',
  daysRemaining: 26,
  attachments: [],
  signature: null,
  contentHash: 'a'.repeat(64),
  consent: { text: CONSENT_V1, version: '1' },
  ...over,
});

// ── Consent ────────────────────────────────────────────────────────────────

test('the checkbox label + helper is exactly the recorded consent text', () => {
  assert.equal(`${CONSENT_LABEL} ${CONSENT_HELPER}`, CONSENT_V1);
  assert.equal(CONSENT_SPLIT_OK, true);
});

// ── Colors (colors.ts only) ────────────────────────────────────────────────

test('accent text clears 4.6:1 on the page paper', () => {
  for (const accent of ['#D3AE37', '#FACC15', '#84CC16', '#C0C0C0', '#1B2A4A']) {
    assert.ok(
      contrastRatio(accentText(accent), PAGE_BG) >= 4.6,
      `${accent} → ${accentText(accent)}`,
    );
  }
});

test('a dark accent is left alone, a light one is darkened', () => {
  assert.equal(accentText('#1B2A4A'), '#1B2A4A');
  assert.notEqual(accentText('#FACC15'), '#FACC15');
});

test('text on an accent fill is white only when it clears 4.5:1', () => {
  assert.equal(onAccentColor('#1B2A4A'), '#FFFFFF');
  assert.equal(onAccentColor('#FACC15'), '#1E1A15');
});

test('no brand color falls back to gold, role order picks the accent', () => {
  assert.equal(brandAccent(null, null), '#D3AE37');
  assert.equal(brandAccent([], '#ffffff'), '#D3AE37');
  // [background, accent, secondary] — accent is the second pick.
  assert.equal(brandAccent(['#FFFFFF', '#2B5CE6', '#1B2A4A'], '#FFFFFF'), '#2B5CE6');
});

// ── Labels ─────────────────────────────────────────────────────────────────

test('estimate numbers print E-####', () => {
  assert.equal(estimateNumber(17), 'E-0017');
  assert.equal(estimateNumber(1234), 'E-1234');
});

test('items and tax read like the design', () => {
  assert.equal(itemsLabel(0), '0 items');
  assert.equal(itemsLabel(1), '1 item');
  assert.equal(itemsLabel(24), '24 items');
  assert.equal(taxRateLabel(8.25), '8.25%');
  assert.equal(taxRateLabel(8), '8%');
  assert.equal(taxRateLabel(0), '0%');
  assert.equal(totalSubline(payload()), '1 item · includes $24.75 tax');
  assert.equal(totalSubline(payload({ taxAmount: 0 })), '1 item');
});

test('line meta and totals', () => {
  const item = payload().lineItems[0]!;
  assert.equal(lineMeta(item), '2 hr × $150.00');
  assert.equal(lineMeta({ ...item, qty: 1.5, unit: 'sq ft', unitPrice: 85 }), '1.5 sq ft × $85.00');
  assert.equal(lineMeta({ ...item, unit: null }), '2 ea × $150.00');
});

test('file sizes', () => {
  assert.equal(fileSize(0), '0 B');
  assert.equal(fileSize(2048), '2 KB');
  assert.equal(fileSize(1258291), '1.2 MB');
});

test('initials tile', () => {
  assert.equal(initials('Acme Plumbing'), 'AP');
  assert.equal(initials('Acme'), 'A');
  assert.equal(initials('  '), 'OI');
});

test('job line omits missing parts and the dot', () => {
  assert.equal(jobLine(payload()), 'Deck rebuild · 12 Oak St');
  assert.equal(jobLine(payload({ title: null })), '12 Oak St');
  assert.equal(jobLine(payload({ address: null })), 'Deck rebuild');
  assert.equal(jobLine(payload({ title: null, address: null })), '');
});

// ── Dates ──────────────────────────────────────────────────────────────────

test('validity text per state', () => {
  assert.equal(validityText(payload()), 'Valid until Nov 18');
  assert.equal(validityText(payload({ state: 'expired' })), 'Expired Nov 18');
  assert.equal(
    validityText(
      payload({
        state: 'approved',
        signature: { signerName: 'Jordan Ellis', type: 'type', data: 'Jordan Ellis', signedAt: '2026-10-23T03:42:00.000Z' },
      }),
    ),
    'Approved Oct 22', // 03:42Z = Oct 22, 10:42 PM in Chicago
  );
  assert.equal(validityText(payload({ validUntil: null })), '');
});

test('signed dates read in the business timezone', () => {
  const iso = '2026-10-23T03:42:00.000Z';
  assert.equal(longDateTime(iso, 'America/Chicago'), 'Oct 22, 2026 at 10:42 PM');
  assert.equal(longDateTime(iso, 'UTC'), 'Oct 23, 2026 at 3:42 AM');
  assert.equal(shortDate('2026-11-18'), 'Nov 18');
  assert.equal(signedDateText(payload({ signature: { signerName: 'J', type: 'draw', data: 'x', signedAt: iso } })), 'Oct 22, 2026 at 10:42 PM');
});

// ── Sign sheet ─────────────────────────────────────────────────────────────

test('disabled reasons list only what is missing', () => {
  assert.deepEqual(stillNeeded({ hasInk: false, name: '', agreed: false }), ['signature', 'full name', 'checkbox']);
  assert.equal(
    stillNeededText({ hasInk: false, name: '', agreed: false }),
    'Still needed: signature, full name, checkbox',
  );
  assert.deepEqual(stillNeeded({ hasInk: true, name: 'Jordan', agreed: false }), ['checkbox']);
  assert.equal(stillNeededText({ hasInk: true, name: 'Jordan', agreed: true }), null);
});

test('every sign error maps to the 2.3 copy', () => {
  assert.equal(signErrorCopy(409, 'content_changed').kind, 'content_changed');
  assert.match(signErrorCopy(409, 'content_changed').message, /was updated/);
  assert.equal(signErrorCopy(409, 'already_approved').kind, 'reload');
  assert.equal(signErrorCopy(410, 'expired').kind, 'reload');
  assert.equal(signErrorCopy(410, 'unavailable').kind, 'reload');
  assert.equal(
    signErrorCopy(400, 'invalid_signature').message,
    "That signature couldn't be read. Clear it and try again.",
  );
  assert.equal(signErrorCopy(429, 'rate_limited').message, 'Too many attempts. Try again in a minute.');
  assert.equal(signErrorCopy(500, undefined).message, "Couldn't approve. Please try again.");
  assert.equal(signErrorCopy(400, 'validation').message, "Couldn't approve. Please try again.");
});

test('status chips', () => {
  assert.deepEqual(statusChip('pending'), { label: 'Pending', icon: 'schedule', tone: 'pending' });
  assert.equal(statusChip('approved')?.icon, 'verified');
  assert.equal(statusChip('expired')?.icon, 'event_busy');
  assert.equal(statusChip('unavailable'), null);
});
