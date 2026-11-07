import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bypassReason, decideRoute, hasFigure, looksLikeAnswer } from './decide';

// ── The five cases the slice names, plus the guard rails around them ──────

test("who hasn't paid me -> ask", () => {
  assert.deepEqual(
    decideRoute({ flagOn: true, bypass: null, classified: 'ask', text: "who hasn't paid me" }),
    { route: 'ask', via: 'router' },
  );
});

test('any unpaid invoices -> ask', () => {
  assert.deepEqual(
    decideRoute({ flagOn: true, bypass: null, classified: 'ask', text: 'any unpaid invoices' }),
    { route: 'ask', via: 'router' },
  );
});

test('how much did I spend on gas? -> unsupported (never parse)', () => {
  const d = decideRoute({
    flagOn: true,
    bypass: null,
    classified: 'unsupported',
    text: 'how much did I spend on gas?',
  });
  assert.deepEqual(d, { route: 'unsupported', via: 'router' });
});

test('invoice ZZ Test A $50 for a repair -> build', () => {
  assert.deepEqual(
    decideRoute({
      flagOn: true,
      bypass: null,
      classified: 'build',
      text: 'invoice ZZ Test A $50 for a repair',
    }),
    // The $50 is decided by the figure rule, before the model is asked.
    { route: 'build', via: 'regex' },
  );
});

test("Maria hasn't paid, bill her again -> build", () => {
  assert.deepEqual(
    decideRoute({
      flagOn: true,
      bypass: null,
      classified: 'build',
      text: "Maria hasn't paid, bill her again",
    }),
    { route: 'build', via: 'router' },
  );
});

test("who owes me 50 for the fence -> build, and the model is never asked", () => {
  // classified='ask' is here on purpose: the figure rule is deterministic and
  // runs before the model call, so no answer can turn this into a lookup.
  assert.deepEqual(
    decideRoute({
      flagOn: true,
      bypass: null,
      classified: 'ask',
      text: 'who owes me 50 for the fence',
    }),
    { route: 'build', via: 'regex' },
  );
  for (const t of ['who owes me 50 for the fence', '500 or best offer', '$40', 'charge 8%']) {
    assert.equal(hasFigure(t), true, t);
  }
  assert.equal(hasFigure('who owes me'), false);
});

test('$40 as a clarification reply -> bypass, and no model answer can override it', () => {
  // classified is present here on purpose: even a route that came back must not
  // beat the bypass, because an answer mid-build is never a new question.
  const d = decideRoute({
    flagOn: true,
    bypass: 'clarification',
    classified: 'unsupported',
    text: '$40',
  });
  assert.deepEqual(d, { route: 'build', via: 'bypass' });
});

test('router timeout -> the regex gate, then parse', () => {
  assert.deepEqual(
    decideRoute({ flagOn: true, bypass: null, classified: null, text: "who hasn't paid me" }),
    { route: 'ask', via: 'regex' },
  );
});

test('router garbage -> parse (a dead router is the old path, not a guess)', () => {
  assert.deepEqual(
    decideRoute({
      flagOn: true,
      bypass: null,
      classified: null,
      text: 'how much did I spend on gas?',
    }),
    { route: 'build', via: 'regex' },
  );
});

test('flag off -> old path even with a classification in hand', () => {
  assert.deepEqual(
    decideRoute({ flagOn: false, bypass: null, classified: 'unsupported', text: 'x' }),
    { route: 'build', via: 'regex' },
  );
  // …and the old path's own rule still routes a plain unpaid question to ask.
  assert.deepEqual(
    decideRoute({ flagOn: true, bypass: null, classified: null, text: 'who owes me' }),
    { route: 'ask', via: 'regex' },
  );
});

// ── Bypass rules ───────────────────────────────────────────────────────────

test('bypass precedence: photo, then open question, then dictated follow-up', () => {
  assert.equal(
    bypassReason({ imageAttached: true, clarificationOpen: true, voiceFollowUp: true }),
    'image',
  );
  assert.equal(
    bypassReason({ imageAttached: false, clarificationOpen: true, voiceFollowUp: true }),
    'clarification',
  );
  assert.equal(
    bypassReason({ imageAttached: false, clarificationOpen: false, voiceFollowUp: true }),
    'voice-followup',
  );
  assert.equal(
    bypassReason({ imageAttached: false, clarificationOpen: false, voiceFollowUp: false }),
    null,
  );
});

test('a short answer is recognised, a real question is not', () => {
  for (const t of ['$40', '40', '40 dollars', 'the car wash', 'for the fence', "it's 50"]) {
    assert.equal(looksLikeAnswer(t), true, t);
  }
  for (const t of ["who hasn't paid me?", 'how much did I spend on gas?', 'invoice ZZ Test A $50 for a repair', '']) {
    assert.equal(looksLikeAnswer(t), false, t);
  }
});
