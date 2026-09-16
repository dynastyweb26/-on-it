import { test } from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { verifyCronAuth } from './cron-auth';

test('verifyCronAuth security tests', async (t) => {
  const origSecret = process.env.CRON_SECRET;

  await t.test('returns false when CRON_SECRET is undefined', () => {
    delete process.env.CRON_SECRET;
    const req = new NextRequest('http://localhost/api/followups', {
      headers: { authorization: 'Bearer undefined' },
    });
    assert.strictEqual(verifyCronAuth(req), false);
  });

  await t.test('returns false when CRON_SECRET is empty string', () => {
    process.env.CRON_SECRET = '';
    const req = new NextRequest('http://localhost/api/followups', {
      headers: { authorization: 'Bearer ' },
    });
    assert.strictEqual(verifyCronAuth(req), false);
  });

  await t.test('returns false when authorization header is missing', () => {
    process.env.CRON_SECRET = 'valid_secret_123';
    const req = new NextRequest('http://localhost/api/followups');
    assert.strictEqual(verifyCronAuth(req), false);
  });

  await t.test('returns false when secret does not match', () => {
    process.env.CRON_SECRET = 'valid_secret_123';
    const req = new NextRequest('http://localhost/api/followups', {
      headers: { authorization: 'Bearer wrong_secret' },
    });
    assert.strictEqual(verifyCronAuth(req), false);
  });

  await t.test('returns false when header has different length', () => {
    process.env.CRON_SECRET = 'valid_secret_123';
    const req = new NextRequest('http://localhost/api/followups', {
      headers: { authorization: 'Bearer valid_secret_123_extra' },
    });
    assert.strictEqual(verifyCronAuth(req), false);
  });

  await t.test('returns true when valid CRON_SECRET and bearer header match', () => {
    process.env.CRON_SECRET = 'valid_secret_123';
    const req = new NextRequest('http://localhost/api/followups', {
      headers: { authorization: 'Bearer valid_secret_123' },
    });
    assert.strictEqual(verifyCronAuth(req), true);
  });

  if (origSecret !== undefined) {
    process.env.CRON_SECRET = origSecret;
  } else {
    delete process.env.CRON_SECRET;
  }
});
