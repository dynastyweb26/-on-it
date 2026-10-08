import test from 'node:test';
import assert from 'node:assert/strict';
import { websiteHref, cashAppUrl, payPalUrl, venmoUrl } from './url';

test('websiteHref: normalizes web links and rejects empty/whitespace', () => {
  assert.equal(websiteHref(null), null);
  assert.equal(websiteHref(undefined), null);
  assert.equal(websiteHref(''), null);
  assert.equal(websiteHref('   '), null);

  assert.equal(websiteHref('example.com'), 'https://example.com');
  assert.equal(websiteHref('www.example.com'), 'https://www.example.com');
  assert.equal(websiteHref('http://example.com'), 'http://example.com');
  assert.equal(websiteHref('https://example.com'), 'https://example.com');
  assert.equal(websiteHref('HTTP://EXAMPLE.COM/PATH'), 'HTTP://EXAMPLE.COM/PATH');
});

test('websiteHref: rejects dangerous pseudo-protocols', () => {
  assert.equal(websiteHref('javascript:alert(1)'), null);
  assert.equal(websiteHref('JAVASCRIPT:alert(1)'), null);
  assert.equal(websiteHref('   javascript:alert(1)   '), null);
  assert.equal(websiteHref('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(websiteHref('vbscript:msgbox(1)'), null);
  assert.equal(websiteHref('file:///etc/passwd'), null);
});

test('cashAppUrl: normalizes Cash App handle into URL', () => {
  assert.equal(cashAppUrl('$mycashtag'), 'https://cash.app/$mycashtag');
  assert.equal(cashAppUrl('mycashtag'), 'https://cash.app/$mycashtag');
  assert.equal(cashAppUrl('https://cash.app/$mycashtag'), 'https://cash.app/$mycashtag');
});

test('payPalUrl: normalizes PayPal.me handle into URL', () => {
  assert.equal(payPalUrl('myhandle'), 'https://paypal.me/myhandle');
  assert.equal(payPalUrl('@myhandle'), 'https://paypal.me/myhandle');
  assert.equal(payPalUrl('https://paypal.me/myhandle'), 'https://paypal.me/myhandle');
});

test('venmoUrl: normalizes Venmo handle into URL', () => {
  assert.equal(venmoUrl('myhandle'), 'https://venmo.com/u/myhandle');
  assert.equal(venmoUrl('@myhandle'), 'https://venmo.com/u/myhandle');
  assert.equal(venmoUrl('https://venmo.com/u/myhandle'), 'https://venmo.com/u/myhandle');
});
