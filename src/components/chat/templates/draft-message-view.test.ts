import test from 'node:test';
import assert from 'node:assert/strict';
import { smsHref } from './draft-message-view';

test('the sms link carries the number and the body exactly as given', () => {
  const body = 'Invoice INV-0074 ($8,100.00) was due Oct 8 & still open.';
  const href = smsHref('(945) 555-0182', body);
  assert.equal(href, `sms:9455550182?&body=${encodeURIComponent(body)}`);
  assert.equal(decodeURIComponent(href!.split('&body=')[1]), body);
});

test('a number with a plus keeps it; no usable number gives no link', () => {
  assert.equal(smsHref('+1 945 555 0182', 'x'), 'sms:+19455550182?&body=x');
  assert.equal(smsHref('', 'x'), null);
  assert.equal(smsHref('12-34', 'x'), null);
});
