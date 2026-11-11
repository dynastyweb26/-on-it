// /api/parse's money-strip invariant: model-written prose is stripped once,
// before any branch or early return. Fixed server copy and server-composed copy
// are written later and must never pass through the strip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withoutMoney } from '@/lib/tools/reply';

const SOURCE = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'parse', 'route.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

const STRIP = "result.reply = withoutMoney(result.reply ?? '');";
const STRIP_AT = SOURCE.indexOf(STRIP);

test('record_payment model reply loses a model-written dollar figure', () => {
  const modelReply = 'Got it. $500 from Maria. Who paid?';
  assert.equal(withoutMoney(modelReply), 'Got it. Who paid?');

  const branch = SOURCE.indexOf("if (result.intent === 'record_payment')");
  assert.ok(STRIP_AT > 0, 'the model strip exists');
  assert.ok(branch > STRIP_AT, 'the strip runs before the record_payment return');
});

test('empty line_items model reply loses a model-written dollar figure', () => {
  const modelReply = 'I found the notes. The total was $1,200. Who is this for?';
  assert.equal(withoutMoney(modelReply), 'I found the notes. Who is this for?');

  const lineItemsGate = SOURCE.indexOf(
    'if (Array.isArray(result.line_items) && result.line_items.length > 0',
  );
  assert.ok(STRIP_AT > 0, 'the model strip exists');
  assert.ok(lineItemsGate > STRIP_AT, 'the strip runs before the line-items gate');
});

test('fixed server copy is never passed through the strip', () => {
  const fixedCopy = [
    'One sec — slow down a moment.',
    "Let's save your work — create your free account to keep going.",
    'Say that again?',
    'Let’s start that one fresh.',
    "Something glitched on my end. Say that one more time?",
    "I couldn't quite read the amounts on that job. Could you try rephrasing the prices?",
    'How much did you charge? Just the number is fine, like 150.',
  ];

  for (const copy of fixedCopy) {
    assert.ok(SOURCE.includes(copy), `fixed copy exists: ${copy}`);
    assert.equal(withoutMoney(copy), copy, `fixed copy unchanged: ${copy}`);
  }

  assert.equal(
    (SOURCE.match(/withoutMoney\(/g) ?? []).length,
    1,
    'only the model reply is stripped',
  );
  assert.ok(
    !SOURCE.includes('.filter((s) => !/\\$\\s?\\d/.test(s))'),
    'the old inline filter is gone',
  );
});

test('server-composed targetReply and groundingNote stay outside the strip', () => {
  const targetAt = SOURCE.indexOf('if (targetReply && result.client_name) result.reply = targetReply;');
  const groundingAt = SOURCE.indexOf('if (groundingNote) result.reply');
  assert.ok(targetAt > STRIP_AT, 'targetReply is applied after the strip');
  assert.ok(groundingAt > STRIP_AT, 'groundingNote is appended after the strip');
  assert.ok(
    SOURCE.includes('if (targetReply && result.client_name) result.reply = targetReply;'),
    'targetReply is assigned directly',
  );
  assert.ok(SOURCE.includes('${groundingNote}`.trim();'), 'groundingNote is appended directly');

  // The server-composed sentence itself carries money the app computed; the
  // route must not send it through the model strip.
  const targetReply = 'Total is $500.00, $100.00 under your $600.00 target. Which line should I change?';
  assert.match(targetReply, /\$500\.00/);
  assert.equal(
    (SOURCE.match(/withoutMoney\(/g) ?? []).length,
    1,
    'server-composed copy never reaches the strip',
  );
});
