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
