// ChatView needs Supabase and profile props to mount, so this reads the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/components/tabs/ChatView.tsx', 'utf8');
const button = readFileSync('src/components/chat/SignInChatButton.tsx', 'utf8');

test('a guest question is remembered at send, last one wins, and carried on the prompt', () => {
  assert.match(chat, /writePending\(trimmed, source, Date\.now\(\)\);\s*setMessages\(\(m\) => \[\.\.\.m, aMsg\(gate\.reply, \{ signInLink: true, skipHistory: true, question: trimmed \}\)\]\)/);
});

test('tapping Sign in remembers the LAST signed-out question before navigating', () => {
  assert.match(chat, /onBeforeSignIn=\{\(\) => \{[\s\S]{0,300}\[\.\.\.messages\]\.reverse\(\)\.find/);
  assert.ok(button.indexOf('onBeforeSignIn?.()') < button.indexOf('router.push(SIGN_IN_HREF)'));
});

test('the auth state is watched for another tab signing in, and only reacts when no profile is loaded', () => {
  assert.match(chat, /supabase\.auth\.onAuthStateChange\(\(event, session\)/);
  assert.match(chat, /event !== 'SIGNED_IN' \|\| profileRef\.current/);
  assert.match(chat, /subscription\.unsubscribe\(\)/);
});

test('the prompts leave at sign-in, whether or not a question was remembered', () => {
  assert.match(chat, /if \(!profile\) return;\s*setMessages\(\(m\) => afterSignIn\(m, null\)\)/);
});

test('the replay is claimed (removed from storage) before it runs, behind a ref, and decided by replayDecision', () => {
  const eff = chat.slice(chat.indexOf('// Claim and replay.'), chat.indexOf('// Run the claimed question'));
  assert.match(eff, /replayDecision\(\{/);
  assert.match(eff, /replayClaimRef\.current\) return/);
  assert.ok(eff.indexOf('claimPending()') < eff.indexOf('setReplay('));
  assert.match(eff, /decision === 'clear'\) \{ clearPending\(\)/);
});

test('the claimed question is re-sent through send() once the prompts are gone', () => {
  const run = chat.slice(chat.indexOf('// Run the claimed question'), chat.indexOf('// Recaps, no cron'));
  assert.match(run, /messages\.some\(\(m\) => m\.signInLink\)\) return/);
  assert.match(run, /setReplay\(null\);[\s\S]{0,80}void send\(r\.text, r\.source\)/);
});

test('a new chat and an auto recap respect the remembered question', () => {
  assert.match(chat, /clearPending\(\); \/\/ cancel: a new chat/);
  assert.match(chat, /if \(readPending\(\)\) return;/);
});

test('failures are named by cause, not a generic line', () => {
  assert.match(chat, /signInFailureMessage\(classifySignInFailure\(err,/);
});
