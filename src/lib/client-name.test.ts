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

test('DECISION 2026-10-15: "Client" typed as the answer is accepted as the name', async () => {
  const { resolveClientName } = await import('./client-name');
  const asked = "On it! Total: $200.00. Who's this for?";
  // The user typed it: kept exactly as typed, even though it's a generic word.
  assert.deepEqual(resolveClientName({ modelName: null, draftName: null, lastAssistant: asked, latestUser: 'Client' }),
    { name: 'Client', source: 'answer' });
  assert.deepEqual(resolveClientName({ modelName: 'client', draftName: null, lastAssistant: asked, latestUser: 'Client' }),
    { name: 'Client', source: 'answer' });
  // The model inventing it (nobody was asked) is still rejected — the 56b0703 guard.
  assert.deepEqual(resolveClientName({ modelName: 'Client', draftName: null, lastAssistant: '', latestUser: 'Invoice for gutters, $200' }),
    { name: null, source: null });
  // Dodges are never a name, typed or not.
  for (const dodge of ['cancel', 'no']) {
    assert.equal(resolveClientName({ modelName: null, draftName: null, lastAssistant: asked, latestUser: dodge }).name, null);
  }
  // A real draft name survives a later generic mention ("send it to the client").
  assert.deepEqual(resolveClientName({ modelName: 'the client', draftName: 'Maria', lastAssistant: 'Got it.', latestUser: 'send it to the client' }),
    { name: 'Maria', source: 'draft' });
});
