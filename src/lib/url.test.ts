import test from 'node:test';
import assert from 'node:assert/strict';
import { websiteHref, cashAppUrl, payPalUrl, venmoUrl } from './url';

test('websiteHref: normalizes web links and rejects dangerous pseudo-protocols', () => {
  // Empty / whitespace
  assert.equal(websiteHref(null), null);
  assert.equal(websiteHref(undefined), null);
  assert.equal(websiteHref(''), null);
  assert.equal(websiteHref('   '), null);

  // Standard domains
  assert.equal(websiteHref('example.com'), 'https://example.com');
  assert.equal(websiteHref('www.example.com'), 'https://www.example.com');

  // Already prefixed
  assert.equal(websiteHref('http://example.com'), 'http://example.com');
  assert.equal(websiteHref('https://example.com'), 'https://example.com');
  assert.equal(websiteHref('HTTPS://EXAMPLE.COM'), 'HTTPS://EXAMPLE.COM');

  // Rejects dangerous pseudo-protocols
  assert.equal(websiteHref('javascript:alert(1)'), null);
  assert.equal(websiteHref('JAVASCRIPT:alert(1)'), null);
  assert.equal(websiteHref('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(websiteHref('vbscript:msgbox(1)'), null);
  assert.equal(websiteHref('file:///etc/passwd'), null);
});

test('cashAppUrl: normalizes and encodes Cash App tags', () => {
  assert.equal(cashAppUrl('johndoe'), 'https://cash.app/$johndoe');
  assert.equal(cashAppUrl('$johndoe'), 'https://cash.app/$johndoe');
  assert.equal(cashAppUrl('https://cash.app/$johndoe'), 'https://cash.app/$johndoe');
  assert.equal(cashAppUrl('   $johndoe   '), 'https://cash.app/$johndoe');
  assert.equal(cashAppUrl('user name'), 'https://cash.app/$user%20name');
});

test('payPalUrl: normalizes and encodes PayPal handles', () => {
  assert.equal(payPalUrl('johndoe'), 'https://paypal.me/johndoe');
  assert.equal(payPalUrl('@johndoe'), 'https://paypal.me/johndoe');
  assert.equal(payPalUrl('https://paypal.me/johndoe'), 'https://paypal.me/johndoe');
  assert.equal(payPalUrl('user name'), 'https://paypal.me/user%20name');
});

test('venmoUrl: normalizes and encodes Venmo usernames', () => {
  assert.equal(venmoUrl('johndoe'), 'https://venmo.com/u/johndoe');
  assert.equal(venmoUrl('@johndoe'), 'https://venmo.com/u/johndoe');
  assert.equal(venmoUrl('https://venmo.com/u/johndoe'), 'https://venmo.com/u/johndoe');
  assert.equal(venmoUrl('user name'), 'https://venmo.com/u/user%20name');
});
