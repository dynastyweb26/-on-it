import { test } from 'node:test';
import assert from 'node:assert/strict';
import { websiteHref, cashAppUrl, payPalUrl, venmoUrl } from './url';

test('websiteHref: handles empty, null, and whitespace inputs', () => {
  assert.equal(websiteHref(null), null);
  assert.equal(websiteHref(undefined), null);
  assert.equal(websiteHref(''), null);
  assert.equal(websiteHref('   '), null);
});

test('websiteHref: normalizes valid URLs', () => {
  assert.equal(websiteHref('example.com'), 'https://example.com');
  assert.equal(websiteHref('www.example.com'), 'https://www.example.com');
  assert.equal(websiteHref('http://example.com'), 'http://example.com');
  assert.equal(websiteHref('https://example.com'), 'https://example.com');
  assert.equal(websiteHref('HTTPS://EXAMPLE.COM'), 'HTTPS://EXAMPLE.COM');
});

test('websiteHref: rejects dangerous pseudo-protocols', () => {
  assert.equal(websiteHref('javascript:alert(1)'), null);
  assert.equal(websiteHref('JAVASCRIPT:alert(1)'), null);
  assert.equal(websiteHref('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(websiteHref('vbscript:msgbox(1)'), null);
  assert.equal(websiteHref('file:///etc/passwd'), null);
  assert.equal(websiteHref('blob:https://example.com/uuid'), null);
});

test('payment URL normalizers', () => {
  assert.equal(cashAppUrl('$myhandle'), 'https://cash.app/$myhandle');
  assert.equal(cashAppUrl('https://cash.app/$myhandle'), 'https://cash.app/$myhandle');
  assert.equal(payPalUrl('myhandle'), 'https://paypal.me/myhandle');
  assert.equal(payPalUrl('@myhandle'), 'https://paypal.me/myhandle');
  assert.equal(venmoUrl('myhandle'), 'https://venmo.com/u/myhandle');
  assert.equal(venmoUrl('@myhandle'), 'https://venmo.com/u/myhandle');
});
