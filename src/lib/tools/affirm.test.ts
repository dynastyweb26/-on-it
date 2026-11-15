import test from 'node:test';
import assert from 'node:assert/strict';
import { isAffirmationOnly, TAP_CONFIRM_REPLY } from './affirm';

test('a bare yes, ok or do it is an affirmation', () => {
  for (const text of [
    'yes', 'Yeah', 'yep', 'OK', 'okay', 'confirm', 'do it', 'go ahead',
    'sure', 'save it', 'send it', 'yes please', 'ok, do it',
  ]) {
    assert.equal(isAffirmationOnly(text), true, text);
  }
});

test('the two requests that got no tool call on the preview are not affirmations', () => {
  // The bug: the prompt told the model to answer "tap Confirm" and it read these
  // as yeses. Neither is short and neither is made only of affirmation words.
  assert.equal(isAffirmationOnly('change Ruth Lawrence phone to 555-0199'), false);
  assert.equal(isAffirmationOnly('save service call at 95'), false);
  assert.equal(isAffirmationOnly('change Ruth Lawrence phone to the 12th'), false);
});

test('anything longer than four words always goes to the model', () => {
  assert.equal(isAffirmationOnly('yes ok do it'), true);
  assert.equal(isAffirmationOnly('yes ok sure do it now'), false);
  assert.equal(isAffirmationOnly('yes ok sure do it now please'), false);
  assert.equal(isAffirmationOnly('yes but change the phone first'), false);
});

test('a name, a figure or a verb outside the list is not an affirmation', () => {
  for (const text of [
    'yes change it', 'ok change the phone', 'add a line', 'make it 50',
    'update Maria', 'delete it', '', '   ', '$40',
  ]) {
    assert.equal(isAffirmationOnly(text), false, text);
  }
});

test('the reply is the card sentence, composed here, never by the model', () => {
  assert.equal(TAP_CONFIRM_REPLY, 'Tap Confirm on the card.');
});
