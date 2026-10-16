import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientNameKey } from './client-name';

test('clientNameKey matches lower(btrim(name))', () => {
  assert.equal(clientNameKey('Bob Welding'), 'bob welding');
  assert.equal(clientNameKey('  CYRIL  '), 'cyril');
  assert.equal(clientNameKey('Ann  Lee'), 'ann  lee');      // inner spaces kept
  assert.equal(clientNameKey('\tTab'), '\ttab');            // btrim strips spaces only
});

test('clientNameKey treats LIKE wildcards as plain text', () => {
  assert.equal(clientNameKey('100% Roofing'), '100% roofing');
  assert.equal(clientNameKey('A_B'), 'a_b');
});

test('nameFromAnswer: a short answer to "Who\'s this for?" is the name', async () => {
  const { nameFromAnswer } = await import('./client-name');
  const asked = "Total: $119.00. On it! Who's this for?";
  assert.equal(nameFromAnswer(asked, 'TEST Pasted Card'), 'TEST Pasted Card');
  assert.equal(nameFromAnswer(asked, "It's for Taco Spot."), 'Taco Spot');
  assert.equal(nameFromAnswer(asked, 'for the Johnsons'), 'the Johnsons');
  assert.equal(nameFromAnswer(asked, 'The customer is Maria'), 'Maria');
  assert.equal(nameFromAnswer(asked, '80'), null);
  assert.equal(nameFromAnswer(asked, 'no'), null);
  for (const dodge of ['cancel', 'Cancel.', 'never mind', 'nevermind', 'forget it', 'wait', 'I don\'t know', 'nobody']) {
    assert.equal(nameFromAnswer(asked, dodge), null, dodge);
  }
  assert.equal(nameFromAnswer(asked, 'add a labor charge of 120 to that one please ok'), null);
  assert.equal(nameFromAnswer('Any labor charge on this?', 'Taco Spot'), null);
});
