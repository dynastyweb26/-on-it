import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM } from './ai';

// The parser talks to a model, so the prompt IS the behavior. These guards keep
// a future edit from dropping the synonym list, or from reintroducing "quote" as
// the word On It says back to the user (ESTIMATES-DESIGN-SPEC §5).

test('prompt asks for an estimate, with quote and friends as synonyms', () => {
  assert.match(SYSTEM, /extract structured invoice, estimate, or expense/);
  for (const word of ['"quote"', '"quotes"', '"bid"', '"proposal"']) {
    assert.ok(SYSTEM.includes(word), `prompt should accept ${word}`);
  }
});

test('prompt keeps the stored intent value and still names it', () => {
  // The value is `quote` in the client and the DB (a TypeScript union guards
  // it); only the wording the model produces changes.
  assert.match(SYSTEM, /set intent=quote \(the stored value for an estimate\), NOT invoice/);
  // A bid or a proposal is the estimate type, not an invoice.
  assert.match(SYSTEM, /if the message says "estimate", "quote", "quotes", "bid" or "proposal", set intent=quote/);
});

test('prompt tells the model to say estimate, never quote or bid', () => {
  assert.match(SYSTEM, /In your reply, say "estimate" — never "quote", "bid" or "proposal"/);
  // intent_explicit counts the synonym words as naming the document type.
  assert.match(SYSTEM, /the words "estimate", "quote", "quotes", "bid", "proposal", "invoice", or "bill"/);
});

// ── Payments already received (alive layer item 5) ────────────────────────
// The prompt is the behavior: a payment must never be read as a new invoice,
// and the model must never imply the money is recorded — the card asks first.

test('prompt routes a received payment to its own intent, not to an invoice', () => {
  assert.match(SYSTEM, /Set intent=record_payment/);
  assert.match(SYSTEM, /A payment NEVER creates or changes an invoice/);
});

test('prompt keeps the record-payment turn a proposal', () => {
  assert.match(SYSTEM, /This is a proposal only/);
  assert.match(SYSTEM, /nothing is recorded until the owner taps Confirm/);
});

test('prompt never states a payment figure aloud', () => {
  assert.match(SYSTEM, /Never state a dollar figure/);
});

test('prompt keeps a billing request out of the payment intent', () => {
  assert.match(SYSTEM, /ASKS to bill, invoice, charge or quote someone is NEVER record_payment/);
});
