// ═══ ON IT — the AI meter's numbers ═══
// POST /api/ask answers with the count after that question, so the meter never
// re-fetches /api/access between turns. Same shape as /api/access's
// aiUsedToday / aiLimit / aiResetsAt, and the same one source for the limit
// (aiDailyLimitFor, from entitlements).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiDailyLimitFor, aiMeterAfterTurn } from './ai-limit';
import { askLimitBody, askResponseBody } from './ask-response';

const NOW = new Date('2026-11-16T18:00:00Z');
const TZ = 'America/Chicago';

const meterFor = (tier: string | null, plan: string | null, used: number, logged: boolean) =>
  aiMeterAfterTurn(aiDailyLimitFor(tier, plan, TZ, NOW, used), logged);

test('meter: free counts the turn against 5', () => {
  assert.deepEqual(meterFor('free', null, 0, true), {
    used: 1,
    limit: 5,
    resetsAt: aiDailyLimitFor('free', null, TZ, NOW, 0).resetsAt,
  });
});

test('meter: pro is 30 a day', () => {
  const m = meterFor('active', 'pro', 4, true);
  assert.equal(m.used, 5);
  assert.equal(m.limit, 30);
});

test('meter: plus is 100 a day, and a founder counts as plus', () => {
  assert.equal(meterFor('active', 'plus', 40, true).limit, 100);
  assert.equal(meterFor('founder', null, 99, true).limit, 100);
  assert.equal(meterFor('founder', null, 99, true).used, 100);
});

test('meter: at the limit no turn is counted (nothing was written)', () => {
  const atLimit = aiDailyLimitFor('free', null, TZ, NOW, 5);
  assert.equal(atLimit.allowed, false);
  assert.deepEqual(aiMeterAfterTurn(atLimit, false), {
    used: 5,
    limit: 5,
    resetsAt: atLimit.resetsAt,
  });
  // The typed answer carries the same three numbers.
  const body = askLimitBody({ used: 5, limit: 5, resetsAt: atLimit.resetsAt });
  assert.deepEqual(
    { kind: body.kind, used: body.used, limit: body.limit, resetsAt: body.resetsAt },
    { kind: 'limit', used: 5, limit: 5, resetsAt: atLimit.resetsAt },
  );
});

test('meter: an answer body carries it only when the server sends one', () => {
  const base = {
    reply: 'Two are unpaid.',
    messageId: 'm1',
    template: null,
    destination: null,
    fallback: null,
    tool: null,
    pending: null,
  };
  assert.deepEqual(askResponseBody(base), base, 'flag off: no ai key at all');
  const withMeter = askResponseBody({ ...base, ai: { used: 2, limit: 5, resetsAt: 'x' } });
  assert.deepEqual(withMeter.ai, { used: 2, limit: 5, resetsAt: 'x' });
});

test('wiring: every /api/ask answer in the flag branch carries the count', () => {
  const ASK = readFileSync(new URL('../app/api/ask/route.ts', import.meta.url), 'utf8');
  // One count read, and the meter is built from it for both reply paths (the
  // affirmation shortcut and a normal model turn).
  assert.equal(ASK.match(/aiLimitForUserId\(/g)?.length, 1);
  assert.equal(ASK.match(/aiMeterAfterTurn\(/g)?.length, 2);
  assert.equal(ASK.match(/ai: aiUsage \? aiMeterAfterTurn\(aiUsage, messageId !== null\)/g)?.length, 2);
  // The limit answer keeps its own typed body, and no answer sets the meter
  // outside the flag.
  assert.match(ASK, /askLimitBody\(/);
});
