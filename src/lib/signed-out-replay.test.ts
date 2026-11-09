import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PENDING_TTL_MS, afterSignIn, classifySignInFailure, parsePending, rememberQuestion, replayDecision, signInFailureMessage,
} from './signed-out-replay';
import { matchRecap } from './chat-recap';

const NOW = 1_000_000_000_000;
const pend = (over: Partial<{ text: string; at: number }> = {}) => ({ text: 'Who owes me money?', source: 'typed' as const, at: NOW - 1000, ...over });

test('remember: the trimmed question and its source; nothing for a blank one', () => {
  assert.deepEqual(rememberQuestion('  How did today go?  ', 'voice', NOW), { text: 'How did today go?', source: 'voice', at: NOW });
  assert.equal(rememberQuestion('   ', 'typed', NOW), null);
  assert.equal(rememberQuestion('x'.repeat(5000), 'typed', NOW)!.text.length, 2000);
});

test('remember: a later question overwrites the earlier, so only the last runs', () => {
  let slot = rememberQuestion('first', 'typed', NOW);
  slot = rememberQuestion('second', 'typed', NOW + 1) ?? slot;
  assert.equal(slot!.text, 'second');
});

test('stored state is untrusted', () => {
  assert.equal(parsePending(null), null);
  assert.equal(parsePending('nope'), null);
  assert.equal(parsePending('{"text":5,"at":1}'), null);
  assert.equal(parsePending('{"text":"hi"}'), null);
  assert.deepEqual(parsePending('{"text":"hi","at":5,"source":"voice"}'), { text: 'hi', source: 'voice', at: 5 });
  assert.equal(parsePending('{"text":"hi","at":5,"source":"x"}')!.source, 'typed');
});

test('replay: nothing remembered means nothing to do', () => {
  assert.equal(replayDecision({ pending: null, signedIn: true, profileReady: true, busy: false, now: NOW }), 'none');
});

test('replay: waits until signed in, the profile is loaded and Chat is idle', () => {
  const base = { pending: pend(), signedIn: true, profileReady: true, busy: false, now: NOW };
  assert.equal(replayDecision({ ...base, signedIn: false }), 'wait');
  assert.equal(replayDecision({ ...base, profileReady: false }), 'wait');
  assert.equal(replayDecision({ ...base, busy: true }), 'wait');
  assert.equal(replayDecision(base), 'run');
});

test('clear: an expired question (or one from the future) is dropped, never run', () => {
  const base = { signedIn: true, profileReady: true, busy: false, now: NOW };
  assert.equal(replayDecision({ ...base, pending: pend({ at: NOW - PENDING_TTL_MS - 1 }) }), 'clear');
  assert.equal(replayDecision({ ...base, pending: pend({ at: NOW + 10 * 60e3 }) }), 'clear');
  assert.equal(replayDecision({ ...base, pending: pend({ at: NOW - PENDING_TTL_MS }) }), 'run');
});

test('claim-then-run is once-only: after the claim removes it, the next look finds none', () => {
  let slot: string | null = JSON.stringify(pend());
  const claim = () => { const p = parsePending(slot); slot = null; return p; };
  const first = claim();
  const second = claim();
  assert.ok(first);
  assert.equal(second, null);
  assert.equal(replayDecision({ pending: second, signedIn: true, profileReady: true, busy: false, now: NOW }), 'none');
});

test('after sign-in: every not-signed-in message and button goes, and the replayed echo with it', () => {
  const thread = [
    { id: 'g', role: 'assistant' as const, content: 'Morning!' },
    { id: 'u1', role: 'user' as const, content: 'first question' },
    { id: 'a1', role: 'assistant' as const, content: "You're not signed in.", signInLink: true as const },
    { id: 'u2', role: 'user' as const, content: "How'd I do this week?" },
    { id: 'a2', role: 'assistant' as const, content: "You're not signed in.", signInLink: true as const },
  ];
  const out = afterSignIn(thread, "How'd I do this week?");
  assert.deepEqual(out.map((m) => m.id), ['g', 'u1']); // only the last question is re-run; the earlier bubble stays
  assert.ok(out.every((m) => !m.signInLink));
});

test('after sign-in with no remembered question the prompts still go; nothing else changes', () => {
  const thread = [
    { id: 'u', role: 'user' as const, content: 'hello' },
    { id: 'a', role: 'assistant' as const, content: 'x', signInLink: true as const },
  ];
  assert.deepEqual(afterSignIn(thread, null).map((m) => m.id), ['u']);
  const clean = [{ id: 'u', role: 'user' as const, content: 'hello' }];
  assert.equal(afterSignIn(clean, null), clean); // same reference: no re-render
});

test('failures name the real cause', () => {
  assert.equal(classifySignInFailure({ status: 401 }, false), 'auth');
  assert.equal(classifySignInFailure(new TypeError('Failed to fetch'), false), 'network');
  assert.equal(classifySignInFailure({ status: 500 }, false), 'server');
  assert.equal(classifySignInFailure({ status: 500 }, true), 'network');
  const msgs = (['auth', 'network', 'server'] as const).map(signInFailureMessage);
  assert.equal(new Set(msgs).size, 3);
  assert.match(msgs[0], /Couldn't sign you in/);
  assert.match(msgs[2], /Couldn't reach the server/);
  for (const m of msgs) assert.doesNotMatch(m, /check your connection/i);
});

// The reported mix-up: a weekly question must get the weekly recap, a daily one the daily.
test('recap questions map to their own kind, with the curly apostrophe iOS types', () => {
  assert.equal(matchRecap("How'd I do this week?"), 'weekly');
  assert.equal(matchRecap('How’d I do this week?'), 'weekly');
  assert.equal(matchRecap('How‘d I do this week?'), 'weekly');
  assert.equal(matchRecap('How did today go?'), 'daily');
  assert.equal(matchRecap('weekly recap'), 'weekly');
  assert.equal(matchRecap('daily recap'), 'daily');
});

import { claimPending, clearPending, readPending, writePending } from './signed-out-storage';

const fakeStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, size: () => m.size };
};

test('storage: write, read, overwrite with the last question, clear', () => {
  const s = fakeStore();
  writePending('first', 'typed', NOW, s);
  writePending('second', 'voice', NOW + 5, s);
  assert.deepEqual(readPending(s), { text: 'second', source: 'voice', at: NOW + 5 });
  clearPending(s);
  assert.equal(readPending(s), null);
  assert.equal(s.size(), 0);
});

test('storage: a blank question is never written; a missing or throwing store is "nothing"', () => {
  const s = fakeStore();
  writePending('   ', 'typed', NOW, s);
  assert.equal(s.size(), 0);
  assert.equal(readPending(null), null);
  const boom = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  assert.doesNotThrow(() => { writePending('q', 'typed', NOW, boom); clearPending(boom); });
  assert.equal(readPending(boom), null);
});

test('storage: a claim returns the question once and leaves nothing behind', () => {
  const s = fakeStore();
  writePending('How did today go?', 'typed', NOW, s);
  assert.equal(claimPending(s)!.text, 'How did today go?');
  assert.equal(claimPending(s), null);
  assert.equal(s.size(), 0);
});
