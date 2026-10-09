import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keypadText, keypadValue, pressKey, type Key } from './keypad';

const type = (keys: string, kind: 'qty' | 'price', start = '') =>
  [...keys].reduce((t, k) => pressKey(t, (k === '<' ? 'back' : k) as Key, kind), start);

test('pressKey: digits, one decimal point, two decimals', () => {
  assert.equal(type('120', 'qty'), '120');
  assert.equal(type('1.555', 'qty'), '1.55');
  assert.equal(type('1..5', 'price'), '1.5');
  assert.equal(type('.5', 'price'), '0.5');
  assert.equal(type('005', 'qty'), '5');
  assert.equal(type('12<<3', 'price'), '3');
});

test('pressKey: qty ≤ 7 digits, price ≤ 10,000,000', () => {
  assert.equal(type('123456789', 'qty'), '1234567');
  assert.equal(type('12345.67', 'qty'), '12345.67');
  assert.equal(type('123456.7', 'qty'), '123456.7');
  assert.equal(type('10000000', 'price'), '10000000');
  assert.equal(type('100000001', 'price'), '10000000');
  assert.equal(type('99999999', 'price'), '9999999');
});

test('keypadValue and keypadText', () => {
  assert.equal(keypadValue('', 'qty'), 1);
  assert.equal(keypadValue('0', 'qty'), 1);
  assert.equal(keypadValue('2.', 'qty'), 2);
  assert.equal(keypadValue('1.5', 'qty'), 1.5);
  assert.equal(keypadValue('', 'price'), null);
  assert.equal(keypadValue('320', 'price'), 320);
  assert.equal(keypadValue('0', 'price'), 0);
  assert.equal(keypadText(1.5), '1.5');
  assert.equal(keypadText(null), '');
  assert.equal(keypadText(450), '450');
});
