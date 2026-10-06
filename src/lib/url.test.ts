import test from 'node:test';
import assert from 'node:assert/strict';
import { websiteHref, cashAppUrl, payPalUrl, venmoUrl } from './url';

test('websiteHref normalizes valid web links', () => {
  assert.equal(websiteHref('example.com'), 'https://example.com');
  assert.equal(websiteHref('https://example.com'), 'https://example.com');
  assert.equal(websiteHref('http://example.com'), 'http://example.com');
  assert.equal(websiteHref('  www.example.com  '), 'https://www.example.com');
});

test('websiteHref handles empty or whitespace input', () => {
  assert.equal(websiteHref(null), null);
  assert.equal(websiteHref(undefined), null);
  assert.equal(websiteHref(''), null);
  assert.equal(websiteHref('   '), null);
});

test('websiteHref rejects dangerous pseudo-protocols', () => {
  assert.equal(websiteHref('javascript:alert(1)'), null);
  assert.equal(websiteHref('JAVASCRIPT:alert(1)'), null);
  assert.equal(websiteHref('   data:text/html,hello'), null);
  assert.equal(websiteHref('vbscript:msgbox(1)'), null);
  assert.equal(websiteHref('file:///etc/passwd'), null);
});

test('payment link normalizers sanitize handles', () => {
  assert.equal(cashAppUrl('$myhandle'), 'https://cash.app/$myhandle');
  assert.equal(payPalUrl('myhandle'), 'https://paypal.me/myhandle');
  assert.equal(venmoUrl('@myhandle'), 'https://venmo.com/u/myhandle');
});
