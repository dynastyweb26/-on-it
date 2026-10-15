import test from 'node:test';
import assert from 'node:assert/strict';
import { websiteHref, cashAppUrl, payPalUrl, venmoUrl } from './url';

test('websiteHref normalizes valid web links', () => {
  assert.equal(websiteHref(null), null);
  assert.equal(websiteHref(undefined), null);
  assert.equal(websiteHref(''), null);
  assert.equal(websiteHref('   '), null);

  assert.equal(websiteHref('vtcprojects.com'), 'https://vtcprojects.com');
  assert.equal(websiteHref('www.x.com'), 'https://www.x.com');
  assert.equal(websiteHref('http://x.com'), 'http://x.com');
  assert.equal(websiteHref('https://x.com/path?q=1'), 'https://x.com/path?q=1');
  assert.equal(websiteHref('HTTPS://EXAMPLE.COM'), 'HTTPS://EXAMPLE.COM');
});

test('websiteHref rejects dangerous pseudo-protocols', () => {
  assert.equal(websiteHref('javascript:alert(1)'), null);
  assert.equal(websiteHref('JAVASCRIPT:alert(1)'), null);
  assert.equal(websiteHref('   javascript:void(0)   '), null);
  assert.equal(websiteHref('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(websiteHref('vbscript:msgbox(1)'), null);
  assert.equal(websiteHref('file:///etc/passwd'), null);
  assert.equal(websiteHref('blob:https://example.com/uuid'), null);
});

test('payment URL normalization functions', () => {
  assert.equal(cashAppUrl('$myhandle'), 'https://cash.app/$myhandle');
  assert.equal(cashAppUrl('https://cash.app/$myhandle'), 'https://cash.app/$myhandle');

  assert.equal(payPalUrl('@myhandle'), 'https://paypal.me/myhandle');
  assert.equal(payPalUrl('paypal.me/myhandle'), 'https://paypal.me/myhandle');

  assert.equal(venmoUrl('@myhandle'), 'https://venmo.com/u/myhandle');
  assert.equal(venmoUrl('https://venmo.com/u/myhandle'), 'https://venmo.com/u/myhandle');
});
