import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldOfferTermsPrompt } from './terms-prompt';

const ctx = { firstSend: true, blocked: false };

test('shows after the first and second send with empty terms, then never', () => {
  assert.equal(shouldOfferTermsPrompt({ terms: null, terms_prompt_count: null }, ctx), true);
  assert.equal(shouldOfferTermsPrompt({ terms: null, terms_prompt_count: 0 }, ctx), true);
  assert.equal(shouldOfferTermsPrompt({ terms: null, terms_prompt_count: 1 }, ctx), true);
  assert.equal(shouldOfferTermsPrompt({ terms: null, terms_prompt_count: 2 }, ctx), false);
  assert.equal(shouldOfferTermsPrompt({ terms: '', terms_prompt_count: 5 }, ctx), false);
});

test('never with terms present, on a resend, when blocked, or before the migration', () => {
  assert.equal(shouldOfferTermsPrompt({ terms: 'Net 15', terms_prompt_count: 0 }, ctx), false);
  assert.equal(shouldOfferTermsPrompt({ terms: '   ', terms_prompt_count: 0 }, ctx), true);
  assert.equal(shouldOfferTermsPrompt({ terms: null }, { ...ctx, firstSend: false }), false);
  assert.equal(shouldOfferTermsPrompt({ terms: null }, { ...ctx, blocked: true }), false);
  assert.equal(shouldOfferTermsPrompt({}, ctx), false); // columns absent
  assert.equal(shouldOfferTermsPrompt(null, ctx), false);
});
