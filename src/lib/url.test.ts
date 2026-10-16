import { test } from 'node:test';
import assert from 'node:assert/strict';
import { websiteHref, cashAppUrl, payPalUrl, venmoUrl } from './url';

test('websiteHref normalizes valid web links', () => {
  assert.equal(websiteHref(null), null);
  assert.equal(websiteHref(''), null);
  assert.equal(websiteHref('   '), null);

  assert.equal(websiteHref('example.com'), 'https://example.com');
  assert.equal(websiteHref('www.example.com'), 'https://www.example.com');
  assert.equal(websiteHref('http://example.com'), 'http://example.com');
  assert.equal(websiteHref('https://example.com'), 'https://example.com');
  assert.equal(websiteHref('  HTTPS://EXAMPLE.COM/path  '), 'HTTPS://EXAMPLE.COM/path');
});

test('websiteHref rejects dangerous pseudo-protocols', () => {
  assert.equal(websiteHref('javascript:alert(1)'), null);
  assert.equal(websiteHref('JAVASCRIPT:alert(1)'), null);
  assert.equal(websiteHref('data:text/html;base64,123'), null);
  assert.equal(websiteHref('vbscript:msgbox(1)'), null);
  assert.equal(websiteHref('file:///etc/passwd'), null);
  assert.equal(websiteHref('blob:https://example.com/uuid'), null);
  assert.equal(websiteHref('   javascript:void(0)   '), null);
  assert.equal(websiteHref('\u0000javascript:alert(1)'), null);
  assert.equal(websiteHref('   \u0007javascript:alert(1)   '), null);
});

test('payment URL helpers sanitize handles and build valid deep links', () => {
  assert.equal(cashAppUrl('$myhandle'), 'https://cash.app/$myhandle');
  assert.equal(cashAppUrl('cash.app/$myhandle'), 'https://cash.app/$myhandle');
  assert.equal(cashAppUrl('https://cash.app/$myhandle'), 'https://cash.app/$myhandle');

  assert.equal(payPalUrl('@myhandle'), 'https://paypal.me/myhandle');
  assert.equal(payPalUrl('paypal.me/myhandle'), 'https://paypal.me/myhandle');

  assert.equal(venmoUrl('@myhandle'), 'https://venmo.com/u/myhandle');
  assert.equal(venmoUrl('venmo.com/u/myhandle'), 'https://venmo.com/u/myhandle');
});
