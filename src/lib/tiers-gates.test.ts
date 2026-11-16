// The wiring of the server gates, where a pure test can't reach: the routes
// behind NEXT_PUBLIC_TIERS must do nothing at all when the flag is off (today's
// behaviour), and must act only after the checks they document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const ASK = read('../../src/app/api/ask/route.ts');
const ACCESS = read('../../src/app/api/access/route.ts');

const indexOf = (source: string, needle: string): number => {
  const found = source.indexOf(needle);
  assert.ok(found >= 0, `expected to find ${needle}`);
  return found;
};

test('ask: the AI limit is checked after the body parse and before any model call', () => {
  const parse = indexOf(ASK, 'Body.safeParse');
  const gate = indexOf(ASK, 'if (NEXT_PUBLIC_TIERS) {');
  const affirmation = indexOf(ASK, 'isAffirmationOnly(question)');
  const model = indexOf(ASK, 'runToolTurn({');
  assert.ok(parse < gate, 'the gate runs after the body is parsed');
  assert.ok(gate < affirmation, 'the gate runs before the affirmation shortcut');
  assert.ok(gate < model, 'the gate runs before the model is called');
});

test('ask: a spent limit answers typed, with no model call and no chat row', () => {
  const start = indexOf(ASK, 'if (NEXT_PUBLIC_TIERS) {');
  const branch = ASK.slice(start, indexOf(ASK, '// The shared budget for this user turn'));
  assert.match(branch, /askLimitBody\(/);
  assert.match(branch, /status: 200|NextResponse\.json\(/);
  assert.doesNotMatch(branch, /logTurn|runToolTurn|anthropic/);
});

test('ask: the count is read only behind the flag', () => {
  // One call site, inside the flag branch.
  assert.equal(ASK.match(/aiLimitForUserId\(/g)?.length, 1);
  const call = indexOf(ASK, 'aiLimitForUserId(supabase, user.id)');
  const flag = indexOf(ASK, 'if (NEXT_PUBLIC_TIERS) {');
  assert.ok(flag < call, 'the only count call sits inside the flag branch');
});

test('access: the AI meter fields appear only when the flag is on', () => {
  assert.equal(ACCESS.match(/aiLimitForUser\(/g)?.length, 1);
  const flag = indexOf(ACCESS, 'const ai = NEXT_PUBLIC_TIERS');
  assert.ok(flag > 0, 'the meter read is behind the flag');
  assert.match(ACCESS, /\.\.\.\(NEXT_PUBLIC_TIERS\n\s+\? \{/, 'the fields are spread only under the flag');
  for (const field of ['aiUsedToday', 'aiLimit', 'aiResetsAt']) {
    assert.ok(ACCESS.includes(field), `${field} is returned`);
  }
});
