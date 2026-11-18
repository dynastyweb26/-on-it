// What reaches Sentry: no link tokens, no query strings, no bodies, cookies,
// headers or identity beyond the account id, no console breadcrumbs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubUrl, scrubEvent, scrubBreadcrumb, sentryOptions } from './scrub';

test('scrubUrl: public link tokens and query strings never leave', () => {
  assert.equal(scrubUrl('https://onit.dynastyweb.co/pay/abc123XYZ?x=1'), 'https://onit.dynastyweb.co/pay/[token]');
  assert.equal(scrubUrl('/api/pay/abc123/intent'), '/api/pay/[token]/intent');
  assert.equal(scrubUrl('/e/tok_9'), '/e/[token]');
  assert.equal(scrubUrl('/api/e/tok_9'), '/api/e/[token]');
  assert.equal(scrubUrl('/i/grant-token'), '/i/[token]');
  assert.equal(scrubUrl('/invoices?filter=unpaid#top'), '/invoices');
  assert.equal(scrubUrl('/settings/plan'), '/settings/plan');
});

test('scrubEvent: request keeps only a clean URL; user keeps only the id', () => {
  const out = scrubEvent({
    type: undefined,
    transaction: '/pay/secret',
    request: { url: '/pay/secret?a=1', cookies: { sb: 'x' }, data: '{"amount":5}', headers: { cookie: 'x' }, query_string: 'a=1' },
    user: { id: 'u1', email: 'a@b.co', ip_address: '1.2.3.4' },
    breadcrumbs: [
      { category: 'console', message: 'invoice INV-1 $500' },
      { category: 'fetch', data: { url: '/api/e/tok?y=2' } },
    ],
  });
  assert.deepEqual(out.request, { url: '/pay/[token]' });
  assert.equal(out.transaction, '/pay/[token]');
  assert.deepEqual(out.user, { id: 'u1' });
  assert.equal(out.breadcrumbs?.length, 1);
  assert.equal(out.breadcrumbs?.[0].data?.url, '/api/e/[token]');
});

test('scrubBreadcrumb: console crumbs are dropped, navigation is cleaned', () => {
  assert.equal(scrubBreadcrumb({ category: 'console', message: 'x' }), null);
  assert.deepEqual(scrubBreadcrumb({ category: 'navigation', data: { from: '/pay/a', to: '/i/b?z' } })?.data, { from: '/pay/[token]', to: '/i/[token]' });
});

test('sentryOptions: off without a DSN, never sends default PII', () => {
  assert.equal(sentryOptions(undefined).enabled, false);
  assert.equal(sentryOptions('https://k@o1.ingest.us.sentry.io/1').enabled, true);
  assert.equal(sentryOptions('x').sendDefaultPii, false);
});
