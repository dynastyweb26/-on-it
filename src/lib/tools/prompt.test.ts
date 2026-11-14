import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from './fixture-db';
import { systemForTurn } from './turn';
import { localYmd, resolveTimeZone } from '@/lib/recap/dates';
import { TOOL_SYSTEM } from './prompt';

const OWNER = '11111111-1111-1111-1111-111111111111';

test("the prompt's today is the profile timezone's today, from the tools' own helper", async () => {
  const db = fixtureDb({ profiles: [{ id: OWNER, timezone: 'America/Chicago' }] } as never);
  // 02:30 UTC on the 14th is still the evening of the 13th in Chicago.
  const now = new Date('2026-11-14T02:30:00Z');

  const system = await systemForTurn(db, OWNER, now);

  const today = localYmd(resolveTimeZone('America/Chicago'), now);
  assert.equal(today, '2026-11-13');
  assert.match(system, /November 13, 2026/);
  assert.ok(system.includes(`(${today})`), 'the prompt carries that exact date');
  assert.equal(system.includes('November 14, 2026'), false);
  assert.match(system, /current month is November 2026/);
});

test('no profile row falls back to the default zone the tools use', async () => {
  const now = new Date('2026-11-14T02:30:00Z');
  const system = await systemForTurn(fixtureDb({} as never), OWNER, now);

  const today = localYmd(resolveTimeZone(null), now);
  assert.ok(system.includes(`(${today})`));
});

test('a request to see records is always a tool call, even with an odd filter word', () => {
  assert.match(TOOL_SYSTEM, /request to see their own records[^.]*is always a tool call/);
  assert.match(TOOL_SYSTEM, /never refuse[^.]*before a tool has tried/);
});
