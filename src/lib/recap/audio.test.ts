import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuePeak } from './audio';
import { RECAP_CONFIG } from './config';

test('every cue on the sheet maps into the −10 … −6 dBFS peak window, order kept', () => {
  const dbs = [...new Set(Object.values(RECAP_CONFIG.slides).flatMap((s) => s.cues.map((c) => c.db)).concat(RECAP_CONFIG.transition.cue.db))].sort((a, b) => a - b);
  for (const db of dbs) {
    assert.ok(cuePeak(db) >= -10 && cuePeak(db) <= -6, `${db} dB → ${cuePeak(db)}`);
  }
  for (let i = 1; i < dbs.length; i++) assert.ok(cuePeak(dbs[i]) > cuePeak(dbs[i - 1]));
  assert.equal(cuePeak(-28), -10);
  assert.equal(cuePeak(-10), -6);
});
