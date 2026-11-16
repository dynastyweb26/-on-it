// The fallback's fixtures, both directions. Without the builder guard first,
// "create an estimate for my client Ana" and "add an invoice for client Smith
// $50" matched create + "client" and were routed to /api/ask.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBuildRequest, isWriteCommand } from './write-commands';
import { decideRoute } from './decide';

const ASK = [
  'add Ruth Lawrence as a client, 555-0100',
  'save service call at 95',
  'delete the Home Depot expense',
  "change Smith's due date to the 12th",
  'delete draft 6',
  "update Maria's email to m@x.com",
  'Maria paid 200',
  'Ruth paid in full',
  'record a payment',
  'got 150 cash, no invoice',
  'mark invoice 12 as paid',
];

/** The shapes the guard names outright: a document, a bill or an amount. */
const GUARDED = [
  'create an estimate for my client Ana',
  'add an invoice for client Smith $50',
  'new invoice for my client',
  'bill my client Ruth 200',
  "add a line for the client's filter",
  'new estimate for Ana',
  'I spent $40 on gas',
  'I paid $40 for gas',
  'just paid 60 for lumber',
  'we paid 40 for gas',
  'my helper got paid 100',
  'invoice Maria 500 for the deck, she paid 200 deposit',
];

/** Builder shapes the other rules already keep: never a write command either. */
const BUILD = [
  'invoice Smith $50 for a repair',
  'add a line for the filter',
  'make it 50',
  'change the tax to 8 percent',
];

test('the six write commands are recognised as changes', () => {
  for (const text of ASK) assert.equal(isWriteCommand(text), true, text);
});

test('the guard owns every document, bill and amount shape', () => {
  for (const text of GUARDED) {
    assert.equal(isBuildRequest(text), true, text);
    assert.equal(isWriteCommand(text), false, text);
  }
});

test('the rest of the builder never becomes a write command', () => {
  for (const text of [...GUARDED, ...BUILD]) {
    assert.equal(isWriteCommand(text), false, text);
  }
});

test('a bare figure or a question is not a write command', () => {
  for (const text of ['$40', 'who owes me', "who hasn't paid me", 'add $40', '', '   ']) {
    assert.equal(isWriteCommand(text), false, text);
  }
});

test('an unambiguous money-in record routes to ask, even with a figure in it', () => {
  for (const text of [
    'Maria paid 200',
    'Ruth paid in full',
    'got paid',
    'record a payment',
    'got 150 cash, no invoice',
    'mark invoice 12 as paid',
  ]) {
    assert.equal(isWriteCommand(text), true, text);
  }
});

test('a paid shape that is not a record is left to the classifier', () => {
  for (const text of [
    'just paid 60 for lumber',
    'we paid 40 for gas',
    'my helper got paid 100',
    'invoice Maria 500 for the deck, she paid 200 deposit',
    'got 200 cash back from home depot return',
  ]) {
    assert.equal(isWriteCommand(text), false, text);
    // Every one of them still routes to the builder in the fallback.
    assert.deepEqual(
      decideRoute({ flagOn: true, bypass: null, classified: null, text }),
      { route: 'build', via: 'regex' },
      text,
    );
  }
});

test('a payment reminder is not a payment to record', () => {
  assert.equal(isWriteCommand('add a payment reminder for Maria'), false);
  assert.equal(isWriteCommand('record a payment reminder'), false);
});

test('a question about paying stays a question, and a bill stays a job', () => {
  for (const text of ["who hasn't paid me", 'who paid me the most', 'what did Ruth pay?']) {
    assert.equal(isWriteCommand(text), false, text);
  }
  assert.equal(isBuildRequest("Maria hasn't paid, bill her again"), false);
  assert.equal(isWriteCommand("Maria hasn't paid, bill her again"), false);
});

test('a phone number or an email does not turn a change into a job', () => {
  assert.equal(isBuildRequest('add Ruth Lawrence as a client, 555-0100'), false);
  assert.equal(isBuildRequest("update Maria's email to m@x.com"), false);
});
