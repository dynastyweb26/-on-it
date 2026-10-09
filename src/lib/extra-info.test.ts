import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPhrase, parseExtraInfo } from './extra-info';

const WED = new Date(2026, 9, 7); // Wed Oct 7, 2026
const FRI = new Date(2026, 9, 9); // Fri Oct 9, 2026

test('deposit: percentage and fixed', () => {
  assert.deepEqual(parseExtraInfo('50% deposit', WED).deposit, { type: 'percentage', value: 50 });
  assert.deepEqual(parseExtraInfo('Deposit 25%', WED).deposit, { type: 'percentage', value: 25 });
  assert.deepEqual(parseExtraInfo('30 percent down', WED).deposit, { type: 'percentage', value: 30 });
  assert.deepEqual(parseExtraInfo('$200 deposit', WED).deposit, { type: 'fixed', value: 200 });
  assert.deepEqual(parseExtraInfo('deposit of $1,500', WED).deposit, { type: 'fixed', value: 1500 });
  assert.equal(parseExtraInfo('150% deposit', WED).deposit, null);
  assert.equal(parseExtraInfo('Gate code 4411', WED).deposit, null);
});

test('due dates', () => {
  assert.equal(parseExtraInfo('Due Friday', WED).due, '2026-10-09');
  assert.equal(parseExtraInfo('due fri', WED).due, '2026-10-09');
  assert.equal(parseExtraInfo('Due Friday', FRI).due, '2026-10-16'); // a week out on a Friday
  assert.equal(parseExtraInfo('Due Monday', WED).due, '2026-10-12');
  assert.equal(parseExtraInfo('Due in 14 days', WED).due, '2026-10-21');
  assert.equal(parseExtraInfo('due in 2 weeks', WED).due, '2026-10-21');
  assert.equal(parseExtraInfo('Due today', WED).due, '2026-10-07');
  assert.equal(parseExtraInfo('due tomorrow', WED).due, '2026-10-08');
  assert.equal(parseExtraInfo('Job at 12 Elm St', WED).due, null);
});

test('both in one note', () => {
  assert.deepEqual(parseExtraInfo('Due Friday\n50% deposit\nJob at 12 Elm St', WED),
    { deposit: { type: 'percentage', value: 50 }, due: '2026-10-09' });
});

test('addPhrase', () => {
  assert.equal(addPhrase('', 'Due Friday'), 'Due Friday');
  assert.equal(addPhrase('Gate 44  ', 'Due Friday'), 'Gate 44\nDue Friday');
  assert.equal(addPhrase('due friday', 'Due Friday'), 'due friday');
});
