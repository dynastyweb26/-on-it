import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIGNED_OUT_REPLY, SIGN_IN_BUSY, SIGN_IN_ERROR, SIGN_IN_HREF, SIGN_IN_LABEL,
  isGuest, signInLabel, signInStep, signedOutGate,
} from './chat-signed-out';

test('guest = auth resolved with no profile; never before it resolves', () => {
  assert.equal(isGuest({ profileLoaded: true, hasProfile: false }), true);
  assert.equal(isGuest({ profileLoaded: false, hasProfile: false }), false);
  assert.equal(isGuest({ profileLoaded: true, hasProfile: true }), false);
});

test('a guest is blocked with the sign-in reply, whatever they asked', () => {
  const g = signedOutGate({ guest: true });
  assert.deepEqual(g, { block: true, reply: SIGNED_OUT_REPLY });
  assert.match(SIGNED_OUT_REPLY, /not signed in/i);
  assert.deepEqual(signedOutGate({ guest: false }), { block: false });
});

test('idle: a tap starts navigation once', () => {
  assert.deepEqual(signInStep('idle', 'tap'), { state: 'pending', navigate: true });
});

test('repeat-tap: a tap while pending does nothing', () => {
  assert.deepEqual(signInStep('pending', 'tap'), { state: 'pending', navigate: false });
});

test('error: pending times out into error, and a tap retries', () => {
  assert.deepEqual(signInStep('pending', 'timeout'), { state: 'error', navigate: false });
  assert.deepEqual(signInStep('error', 'tap'), { state: 'pending', navigate: true });
  assert.deepEqual(signInStep('idle', 'timeout'), { state: 'idle', navigate: false });
});

test('pending clears on exit', () => {
  assert.deepEqual(signInStep('pending', 'reset'), { state: 'idle', navigate: false });
  assert.deepEqual(signInStep('error', 'reset'), { state: 'idle', navigate: false });
});

test('labels name the state; the target is the sign-in page', () => {
  assert.equal(signInLabel('idle'), SIGN_IN_LABEL);
  assert.equal(signInLabel('pending'), SIGN_IN_BUSY);
  assert.equal(signInLabel('error'), SIGN_IN_ERROR);
  assert.equal(SIGN_IN_HREF, '/login');
});
