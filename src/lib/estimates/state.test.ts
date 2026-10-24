import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysRemaining, estimateState, type EstimateStateInput } from './state';

const CHI = 'America/Chicago';
const at = (iso: string) => new Date(iso);

const sent = (over: Partial<EstimateStateInput> = {}): EstimateStateInput => ({
  status: 'sent',
  deletedAt: null,
  approvedAt: null,
  revokedAt: null,
  validUntil: null,
  converted: false,
  ...over,
});

test('pending on the last day at 23:59 local', () => {
  const row = sent({ validUntil: '2026-10-23' });
  assert.equal(estimateState(row, at('2026-10-24T04:59:59Z'), CHI), 'pending');
  assert.equal(daysRemaining(row, at('2026-10-24T04:59:59Z'), CHI), 0);
});

test('expired at 00:00 local the next day', () => {
  const row = sent({ validUntil: '2026-10-23' });
  assert.equal(estimateState(row, at('2026-10-24T05:00:00Z'), CHI), 'expired');
  assert.equal(daysRemaining(row, at('2026-10-24T05:00:00Z'), CHI), 0);
});

test('DST spring boundary', () => {
  const row = sent({ validUntil: '2026-03-08' });
  assert.equal(estimateState(row, at('2026-03-09T04:59:59Z'), CHI), 'pending');
  assert.equal(estimateState(row, at('2026-03-09T05:00:00Z'), CHI), 'expired');
});

test('DST fall boundary', () => {
  const row = sent({ validUntil: '2026-11-01' });
  assert.equal(estimateState(row, at('2026-11-02T05:59:59Z'), CHI), 'pending');
  assert.equal(estimateState(row, at('2026-11-02T06:00:00Z'), CHI), 'expired');
});

test('days remaining is calendar days, inclusive of today as 0', () => {
  const row = sent({ validUntil: '2026-10-23' });
  assert.equal(daysRemaining(row, at('2026-10-20T12:00:00Z'), CHI), 3);
  assert.equal(daysRemaining(row, at('2026-10-23T12:00:00Z'), CHI), 0);
});

test('an approved estimate stays approved forever, even after expiry', () => {
  const row = sent({ approvedAt: '2026-01-01T00:00:00Z', validUntil: '2026-01-02' });
  assert.equal(estimateState(row, at('2026-12-31T12:00:00Z'), CHI), 'approved');
  assert.equal(daysRemaining(row, at('2026-12-31T12:00:00Z'), CHI), null);
});

test('an approved converted estimate is still viewable', () => {
  const row = sent({ approvedAt: '2026-01-01T00:00:00Z', converted: true });
  assert.equal(estimateState(row, at('2026-12-31T12:00:00Z'), CHI), 'approved');
});

test('draft, revoked, deleted and converted-unsigned are unavailable', () => {
  const now = at('2026-10-23T12:00:00Z');
  assert.equal(estimateState(sent({ status: 'draft' }), now, CHI), 'unavailable');
  assert.equal(estimateState(sent({ revokedAt: '2026-10-20T00:00:00Z' }), now, CHI), 'unavailable');
  assert.equal(estimateState(sent({ deletedAt: '2026-10-20T00:00:00Z' }), now, CHI), 'unavailable');
  assert.equal(estimateState(sent({ converted: true }), now, CHI), 'unavailable');
});

test('a legacy NULL expiry never expires', () => {
  const row = sent({ validUntil: null });
  assert.equal(estimateState(row, at('2030-01-01T00:00:00Z'), CHI), 'pending');
  assert.equal(daysRemaining(row, at('2030-01-01T00:00:00Z'), CHI), null);
});

test('an invalid date does not expire the estimate', () => {
  const row = sent({ validUntil: '2026-02-31' });
  assert.equal(estimateState(row, at('2030-01-01T00:00:00Z'), CHI), 'pending');
});
