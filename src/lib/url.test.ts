import test from 'node:test';
import assert from 'node:assert/strict';
import { websiteHref, cashAppUrl, payPalUrl, venmoUrl } from './url.js';

test('websiteHref normalizes valid websites and blocks dangerous protocols', () => {
  // Empty inputs
  assert.equal(websiteHref(null), null);
  assert.equal(websiteHref(undefined), null);
  assert.equal(websiteHref('   '), null);

  // Standard bare domains and URLs
  assert.equal(websiteHref('vtcprojects.com'), 'https://vtcprojects.com');
  assert.equal(websiteHref('www.x.com'), 'https://www.x.com');
  assert.equal(websiteHref('http://x.com'), 'http://x.com');
  assert.equal(websiteHref('https://x.com/'), 'https://x.com/');

  // Dangerous pseudo-protocols
  assert.equal(websiteHref('javascript:alert(1)'), null);
  assert.equal(websiteHref('JAVASCRIPT:alert(document.cookie)'), null);
  assert.equal(websiteHref('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(websiteHref('vbscript:msgbox("XSS")'), null);
  assert.equal(websiteHref('file:///etc/passwd'), null);
});

test('payment deep link normalizers sanitize user handles', () => {
  assert.equal(cashAppUrl('$myhandle'), 'https://cash.app/$myhandle');
  assert.equal(payPalUrl('@myhandle'), 'https://paypal.me/myhandle');
  assert.equal(venmoUrl('@myhandle'), 'https://venmo.com/u/myhandle');
});
