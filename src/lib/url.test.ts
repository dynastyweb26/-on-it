import test from 'node:test';
import assert from 'node:assert/strict';
import { websiteHref, cashAppUrl, payPalUrl, venmoUrl } from './url';

test('websiteHref normalizes valid web links', () => {
  assert.equal(websiteHref('vtcprojects.com'), 'https://vtcprojects.com');
  assert.equal(websiteHref('www.example.com'), 'https://www.example.com');
  assert.equal(websiteHref('http://example.com'), 'http://example.com');
  assert.equal(websiteHref('https://example.com'), 'https://example.com');
  assert.equal(websiteHref('  https://example.com/path  '), 'https://example.com/path');
});

test('websiteHref rejects empty and whitespace inputs', () => {
  assert.equal(websiteHref(null), null);
  assert.equal(websiteHref(undefined), null);
  assert.equal(websiteHref(''), null);
  assert.equal(websiteHref('   '), null);
});

test('websiteHref rejects dangerous pseudo-protocols', () => {
  assert.equal(websiteHref('javascript:alert(1)'), null);
  assert.equal(websiteHref('JAVASCRIPT:alert(1)'), null);
  assert.equal(websiteHref('  javascript:void(0)  '), null);
  assert.equal(websiteHref('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), null);
  assert.equal(websiteHref('vbscript:msgbox("XSS")'), null);
  assert.equal(websiteHref('file:///etc/passwd'), null);
  assert.equal(websiteHref('blob:http://example.com/uuid'), null);
});

test('payment URL generators sanitize handles and format links', () => {
  assert.equal(cashAppUrl('john'), 'https://cash.app/$john');
  assert.equal(cashAppUrl('$john'), 'https://cash.app/$john');
  assert.equal(cashAppUrl('https://cash.app/$john'), 'https://cash.app/$john');

  assert.equal(payPalUrl('john'), 'https://paypal.me/john');
  assert.equal(payPalUrl('@john'), 'https://paypal.me/john');
  assert.equal(payPalUrl('https://paypal.me/john'), 'https://paypal.me/john');

  assert.equal(venmoUrl('john'), 'https://venmo.com/u/john');
  assert.equal(venmoUrl('@john'), 'https://venmo.com/u/john');
  assert.equal(venmoUrl('https://venmo.com/u/john'), 'https://venmo.com/u/john');
});
