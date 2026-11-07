import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUnpaidQuestion, shouldRouteToAsk } from './ask-intent';

const MATCHES = [
  "who hasn't paid me",
  "Who hasn’t paid me?",
  'who has not paid me yet',
  'who owes me',
  'Who owes me money?',
  'who still owes me',
  'any unpaid invoices',
  'Any unpaid invoices?',
  'show me my unpaid invoices',
  'which invoices are overdue',
  'what overdue invoices do I have',
  'anything overdue',
  'is there anything overdue?',
  "what's my outstanding balance",
  'how much do people owe me',
  'how much is still owed',
  'hey can you tell me who owes me',
];

const NON_MATCHES = [
  // invoice building that mentions paid / owes
  'Bob owes me 200 for the fence',
  'Bob owes me for the fence',
  "Maria hasn't paid, make her a new invoice for the deck",
  'Did a job for Sam, he owes me',
  'Invoice John who hasn’t paid for the roof',
  'Paid Home Depot 200',
  'I paid the lumber yard',
  'charge Dana for the unpaid work',
  'who owes me $50',
  'who owes me 3 hours at 65',
  // bare phrases and other talk
  'unpaid invoices',
  'overdue',
  'send it',
  'yes',
  'who is my plumber',
  'how much did I spend on gas',
  '',
  '   ',
  // too long to be a question
  `who owes me ${'really '.repeat(20)}`,
];

for (const text of MATCHES) {
  test(`matches: ${text}`, () => assert.equal(isUnpaidQuestion(text), true));
}
for (const text of NON_MATCHES) {
  test(`does not match: ${JSON.stringify(text.slice(0, 40))}`, () => assert.equal(isUnpaidQuestion(text), false));
}

test('routing needs the flag AND a match', () => {
  assert.equal(shouldRouteToAsk({ flagOn: true, text: 'who owes me' }), true);
  assert.equal(shouldRouteToAsk({ flagOn: false, text: 'who owes me' }), false);
  assert.equal(shouldRouteToAsk({ flagOn: true, text: 'Bob owes me 200' }), false);
  assert.equal(shouldRouteToAsk({ flagOn: false, text: 'Bob owes me 200' }), false);
});
