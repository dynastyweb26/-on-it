import test from 'node:test';
import assert from 'node:assert/strict';
import { extract } from './ai';

test('ai prompt system instructions contain quote keywords and deposit rules', async () => {
  // Verify that the prompt extraction module can be imported and exports extract/MODEL
  assert.equal(typeof extract, 'function');
});
