// design/tiers 02 (AI meter) + 03 (AI limit card): how ChatView wires them.
// ChatView needs Supabase to mount, so this proves the wiring from the source,
// the same way templates-flag-off.test.ts does.
//
// The bug this fixes: with the tiers flag on, /api/ask answers a spent day with
// kind:'limit' and an empty reply. ChatView used to treat every non-ok kind as
// a failure, so the user got an empty "failed" bubble with a Retry that could
// only hit the limit again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/components/tabs/ChatView.tsx', 'utf8').replace(/\r\n/g, '\n');

test('a limit answer is handled before the failure bubble, in the live ask branch', () => {
  const ask = chat.indexOf("decision.route === 'ask'");
  const limit = chat.indexOf("out.kind === 'limit'", ask);
  const failure = chat.indexOf('A failure names its cause', ask);
  assert.ok(ask > 0 && limit > ask && failure > limit, 'limit is answered before the failure path');
  const branch = chat.slice(limit, chat.indexOf('return null;', limit));
  assert.match(branch, /landAiLimit\(out, trimmed\)/);
  assert.doesNotMatch(branch, /failed:/, 'never a failed bubble');
});

test('a limit answer that lands after a tab switch is a card too, not an empty bubble', () => {
  const fn = chat.indexOf('function applyAttachedAsk');
  const limit = chat.indexOf("out.kind === 'limit'", fn);
  const fallthrough = chat.indexOf('aMsg(out.reply, { skipHistory: true })', fn);
  assert.ok(fn > 0 && limit > fn && fallthrough > limit);
});

test('the limit card stays out of parse history and carries the day it belongs to', () => {
  const fn = chat.slice(chat.indexOf('function landAiLimit'), chat.indexOf('function landAiLimit') + 1200);
  assert.match(fn, /skipHistory: true/);
  assert.match(fn, /resetsAt: out\.resetsAt/);
  assert.match(fn, /limitCardCollapsed\(/);
});

test('flag off: no /api/access read for tiers, no meter, no card', () => {
  assert.match(chat, /const tiersOn = NEXT_PUBLIC_TIERS && AI_TOOLS;/);
  assert.match(chat, /if \(!tiersOn\) return;/);
  assert.match(chat, /\{tiersOn && <AiMeter meter=\{tiers\.meter\} \/>\}/);
  assert.match(chat, /m\.aiLimit && NEXT_PUBLIC_TIERS \?/);
});

test('the meter moves only after the answer finished streaming', () => {
  assert.match(chat, /pendingMeterRef\.current = \{ msgId, meter: out\.ai \}/);
  const eff = chat.indexOf('if (!q || !streamDone.has(q.msgId)) return;');
  assert.ok(eff > 0, 'applied from the stream-done set');
});

test('no limit, price or plan name is typed in the card or the meter', () => {
  for (const f of ['src/components/chat/AiLimitCard.tsx', 'src/components/chat/AiMeter.tsx']) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /\$\d|\b(5|30|100)\b|['"](Free|Pro|Plus)['"]/, f);
  }
});
