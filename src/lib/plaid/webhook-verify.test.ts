// ═══ Plaid webhook verification ═══
// A real ES256 key is generated per run; the verifier is driven with a fake key
// fetcher. No Plaid call, no env, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signRaw, type KeyObject } from 'node:crypto';
import { createWebhookVerifier, requestBodySha256, type KeyCacheEntry } from './webhook-verify';

const BODY = JSON.stringify({
  webhook_type: 'TRANSACTIONS',
  webhook_code: 'SYNC_UPDATES_AVAILABLE',
  item_id: 'item-1',
});
const NOW = 1_790_000_000_000; // fixed ms clock

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { privateKey, jwk: publicKey.export({ format: 'jwk' }) };
}

function jwtFor(
  privateKey: KeyObject,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'ES256', typ: 'JWT', kid: 'kid-1' },
): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = signRaw('sha256', Buffer.from(`${h}.${p}`), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${h}.${p}.${signature}`;
}

const claimsFor = (body: string, iat = Math.floor(NOW / 1000)) => ({
  iat,
  request_body_sha256: requestBodySha256(body),
  webhook_type: 'TRANSACTIONS',
  webhook_code: 'SYNC_UPDATES_AVAILABLE',
});

const verifierFor = (jwk: ReturnType<typeof keyPair>['jwk'], cache?: Map<string, KeyCacheEntry>) =>
  createWebhookVerifier(async (kid) => {
    assert.equal(kid, 'kid-1');
    return jwk;
  }, { now: () => NOW, cache: cache ?? new Map() });

test('accepts a correctly signed, fresh, body-matched JWT', async () => {
  const { privateKey, jwk } = keyPair();
  const result = await verifierFor(jwk)(jwtFor(privateKey, claimsFor(BODY)), BODY);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.claims.webhook_code, 'SYNC_UPDATES_AVAILABLE');
  }
});

test('rejects a signature made by another key', async () => {
  const real = keyPair();
  const attacker = keyPair();
  const result = await verifierFor(real.jwk)(jwtFor(attacker.privateKey, claimsFor(BODY)), BODY);
  assert.deepEqual(result, { ok: false, reason: 'bad_signature' });
});

test('rejects a tampered body (hash claim no longer matches)', async () => {
  const { privateKey, jwk } = keyPair();
  const jwt = jwtFor(privateKey, claimsFor(BODY));
  const result = await verifierFor(jwk)(jwt, BODY.replace('item-1', 'item-2'));
  assert.deepEqual(result, { ok: false, reason: 'body_mismatch' });
});

test('rejects an iat older than five minutes, and one far in the future', async () => {
  const { privateKey, jwk } = keyPair();
  const stale = jwtFor(privateKey, claimsFor(BODY, Math.floor(NOW / 1000) - 301));
  assert.deepEqual(await verifierFor(jwk)(stale, BODY), { ok: false, reason: 'stale_iat' });

  const future = jwtFor(privateKey, claimsFor(BODY, Math.floor(NOW / 1000) + 301));
  assert.deepEqual(await verifierFor(jwk)(future, BODY), { ok: false, reason: 'future_iat' });
});

test('five minutes of skew is still fresh', async () => {
  const { privateKey, jwk } = keyPair();
  const edge = jwtFor(privateKey, claimsFor(BODY, Math.floor(NOW / 1000) - 300));
  assert.equal((await verifierFor(jwk)(edge, BODY)).ok, true);
});

test('rejects the wrong alg, a missing kid, and a malformed token', async () => {
  const { privateKey, jwk } = keyPair();
  const hs = jwtFor(privateKey, claimsFor(BODY), { alg: 'HS256', kid: 'kid-1' });
  assert.deepEqual(await verifierFor(jwk)(hs, BODY), { ok: false, reason: 'unsupported_alg' });

  const noKid = jwtFor(privateKey, claimsFor(BODY), { alg: 'ES256' });
  assert.deepEqual(await verifierFor(jwk)(noKid, BODY), { ok: false, reason: 'missing_kid' });

  assert.deepEqual(await verifierFor(jwk)(null, BODY), { ok: false, reason: 'malformed' });
  assert.deepEqual(await verifierFor(jwk)('not.a.jwt.really', BODY), { ok: false, reason: 'malformed' });
  assert.deepEqual(await verifierFor(jwk)('abc.def', BODY), { ok: false, reason: 'malformed' });
});

test('a fetched key is cached per kid (one call for many webhooks)', async () => {
  const { privateKey, jwk } = keyPair();
  let fetches = 0;
  const cache = new Map<string, KeyCacheEntry>();
  const verify = createWebhookVerifier(async () => {
    fetches++;
    return jwk;
  }, { now: () => NOW, cache });

  const token = jwtFor(privateKey, claimsFor(BODY));
  assert.equal((await verify(token, BODY)).ok, true);
  assert.equal((await verify(token, BODY)).ok, true);
  assert.equal(fetches, 1);
});

test('a key fetch failure fails closed', async () => {
  const { privateKey } = keyPair();
  const verify = createWebhookVerifier(async () => {
    throw new Error('plaid down');
  }, { now: () => NOW, cache: new Map() });
  assert.deepEqual(
    await verify(jwtFor(privateKey, claimsFor(BODY)), BODY),
    { ok: false, reason: 'key_unavailable' },
  );
});

test('an expired cache entry is refetched', async () => {
  const { privateKey, jwk } = keyPair();
  let fetches = 0;
  const cache = new Map<string, KeyCacheEntry>([['kid-1', { key: jwk, expiresAt: NOW - 1 }]]);
  const verify = createWebhookVerifier(async () => {
    fetches++;
    return jwk;
  }, { now: () => NOW, cache });
  assert.equal((await verify(jwtFor(privateKey, claimsFor(BODY)), BODY)).ok, true);
  assert.equal(fetches, 1);
});
