import { test } from 'node:test';
import assert from 'node:assert/strict';
import { websiteHref, cashAppUrl, payPalUrl, venmoUrl } from './url';

test('websiteHref: normalizes valid web links', () => {
  assert.equal(websiteHref('vtcprojects.com'), 'https://vtcprojects.com');
  assert.equal(websiteHref('www.example.com'), 'https://www.example.com');
  assert.equal(websiteHref('http://example.com'), 'http://example.com');
  assert.equal(websiteHref('https://example.com'), 'https://example.com');
  assert.equal(websiteHref('HTTPS://EXAMPLE.COM/path'), 'HTTPS://EXAMPLE.COM/path');
});

test('websiteHref: rejects dangerous pseudo-protocols', () => {
  assert.equal(websiteHref('javascript:alert(1)'), null);
  assert.equal(websiteHref('JAVASCRIPT:alert(1)'), null);
  assert.equal(websiteHref('java\x00script:alert(1)'), null);
  assert.equal(websiteHref('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(websiteHref('vbscript:msgbox(1)'), null);
  assert.equal(websiteHref('file:///etc/passwd'), null);
});

test('websiteHref: handles empty and null inputs', () => {
  assert.equal(websiteHref(null), null);
  assert.equal(websiteHref(undefined), null);
  assert.equal(websiteHref(''), null);
  assert.equal(websiteHref('   '), null);
});

test('payment link helpers sanitize handles', () => {
  assert.equal(cashAppUrl('$myhandle'), 'https://cash.app/$myhandle');
  assert.equal(payPalUrl('@myhandle'), 'https://paypal.me/myhandle');
  assert.equal(venmoUrl('myhandle'), 'https://venmo.com/u/myhandle');
});
