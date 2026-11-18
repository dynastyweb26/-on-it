// PostHog gets screens and named events only: no autocapture, no public-page
// traffic, no link tokens or query strings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubUrl, isPublicPath, scrubCapture, posthogOptions } from './posthog-scrub';

test('scrubUrl removes link tokens, query strings and hashes', () => {
  assert.equal(scrubUrl('https://onit.dynastyweb.co/pay/abc?x=1'), 'https://onit.dynastyweb.co/pay/[token]');
  assert.equal(scrubUrl('/e/tok#top'), '/e/[token]');
  assert.equal(scrubUrl('/invoices?filter=unpaid'), '/invoices');
});

test('public client pages are never tracked', () => {
  assert.equal(isPublicPath('/pay/abc'), true);
  assert.equal(isPublicPath('/e/abc'), true);
  assert.equal(isPublicPath('/i/abc'), true);
  assert.equal(isPublicPath('/invoices'), false);
  assert.equal(scrubCapture({ event: '$pageview', properties: { $pathname: '/pay/abc' } }), null);
});

test('autocapture, exceptions, rage and dead clicks are dropped', () => {
  for (const event of ['$autocapture', '$exception', '$rageclick', '$dead_click']) {
    assert.equal(scrubCapture({ event, properties: {} }), null, event);
  }
});

test('every URL property is cleaned, in properties and person sets', () => {
  const out = scrubCapture({
    event: '$pageview',
    properties: { $pathname: '/invoices', $current_url: 'https://x.co/invoices?id=9', $referrer: 'https://x.co/pay/tok' },
    $set_once: { $initial_current_url: 'https://x.co/i/grant?ref=1' },
  });
  assert.equal(out?.properties?.$current_url, 'https://x.co/invoices');
  assert.equal(out?.properties?.$referrer, 'https://x.co/pay/[token]');
  assert.equal(out?.$set_once?.$initial_current_url, 'https://x.co/i/[token]');
});

test('options: no autocapture, replay, surveys, heatmaps or exceptions; identified people only', () => {
  const o = posthogOptions();
  assert.equal(o.api_host, '/ingest');
  assert.equal(o.autocapture, false);
  assert.equal(o.disable_session_recording, true);
  assert.equal(o.disable_surveys, true);
  assert.equal(o.enable_heatmaps, false);
  assert.equal(o.capture_exceptions, false);
  assert.equal(o.person_profiles, 'identified_only');
  assert.equal(o.disable_external_dependency_loading, true);
});
