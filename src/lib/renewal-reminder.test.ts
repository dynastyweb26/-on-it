import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestAnniversary, renewalReminderDue, renewalReminderEmail } from './renewal-reminder';

const T = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const START = T('2025-11-17T15:00:00Z');

test('under a year old: never due', () => {
  assert.equal(latestAnniversary(START, new Date('2026-10-16T12:00:00Z')), null);
  assert.equal(renewalReminderDue(START, null, new Date('2026-10-16T12:00:00Z')).due, false);
});

test('window opens 14 days before the first anniversary', () => {
  assert.equal(renewalReminderDue(START, null, new Date('2026-11-02T12:00:00Z')).due, false); // 15 days out
  const r = renewalReminderDue(START, null, new Date('2026-11-04T12:00:00Z')); // 13 days out
  assert.equal(r.due, true);
  assert.equal(r.anniversary?.toISOString(), '2026-11-17T15:00:00.000Z');
});

test('sent for this anniversary: not due again; due again next year', () => {
  const sent = '2026-11-04T16:00:00Z';
  assert.equal(renewalReminderDue(START, sent, new Date('2026-11-20T12:00:00Z')).due, false);
  assert.equal(renewalReminderDue(START, sent, new Date('2027-11-10T12:00:00Z')).due, true);
});

test('a missed window is still sent late, once', () => {
  assert.equal(renewalReminderDue(START, null, new Date('2026-12-30T12:00:00Z')).due, true);
});

test('bad start dates are never due', () => {
  for (const s of [0, -5, NaN]) assert.equal(renewalReminderDue(s, null, new Date()).due, false);
});

test('email: states price, next charge, cancel link; escapes the name', () => {
  const m = renewalReminderEmail({
    businessName: '<b>A&B</b>', amount: '$9.99', nextChargeDate: 'November 17, 2026', manageUrl: 'https://x.test/settings',
  });
  assert.match(m.text, /\$9\.99/);
  assert.match(m.text, /November 17, 2026/);
  assert.match(m.text, /cancel any time/);
  assert.match(m.html, /&lt;b&gt;A&amp;B&lt;\/b&gt;/);
  assert.ok(!m.html.includes('<b>A'));
  assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test(m.text), false);
});
