import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFeedbackIntent } from './feedback-intent';

const yes = [
  'feedback',
  'I have some feedback',
  'i want to give feedback',
  'can I leave feedback?',
  'where do I send feedback',
  'I have a suggestion',
  'feature request',
  'I want to request a feature',
  'I found a bug',
  'report a problem',
  'I wish On It could do recurring invoices',
  'it would be great if the app had a dark mode',
  'you should add signatures',
  'why can’t you add photos to quotes',
  'this app keeps crashing',
  'On It is confusing',
  'I love this app',
  'how do I tell the developer something',
  'I want to talk to a human',
  'I have a complaint',
];
const no = [
  'Invoice Mike Johnson $450 for fence repair',
  'quote Sarah 3 hours at $85 plus materials',
  'add a line item for permit fee',
  'change the price to 500',
  'yes',
  'send it',
  'client left feedback on the job, invoice them 200',
  'bill Dave for the deck, he gave feedback that it looked great',
  'can you add another coat of paint to the quote',
  'make it due in 30 days',
  'the client wants a suggestion on tile colors',
  'invoice Dave for the deck, he has some feedback for me',
  'make a quote for Lee, I have a suggestion on the price',
  'hi',
  '',
  'x'.repeat(300) + ' feedback',
];

for (const s of yes) test(`feedback intent: "${s}"`, () => assert.equal(isFeedbackIntent(s), true));
for (const s of no) test(`not feedback: "${s.slice(0, 50)}"`, () => assert.equal(isFeedbackIntent(s), false));
