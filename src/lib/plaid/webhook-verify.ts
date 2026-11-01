// ═══ Plaid webhook verification — node:crypto only ═══
// Plaid signs every webhook with an ES256 JWT in the Plaid-Verification header.
// This module verifies that JWT without a JWT dependency:
//   - alg must be ES256 and the kid must be present;
//   - the signing key is fetched from /webhook_verification_key/get and cached
//     by kid (Plaid rotates keys, so a cache entry is never assumed valid);
//   - a key whose own expired_at has passed is refused, cached or not;
//   - iat must be within 5 minutes of now;
//   - SHA-256(raw body) must equal the request_body_sha256 claim;
//   - the signature must verify over `${header}.${payload}`.
//
// Nothing here reads env or talks to Plaid: the route injects the key fetcher,
// the tests inject a generated P-256 key.
import { createHash, createPublicKey, timingSafeEqual, verify as verifySignature, type JsonWebKey } from 'node:crypto';

const MAX_IAT_SKEW_SECONDS = 5 * 60;
const KEY_CACHE_MS = 12 * 60 * 60 * 1000;

export type WebhookJwtHeader = { alg?: string; kid?: string; typ?: string };
export type WebhookJwtClaims = {
  iat?: number;
  request_body_sha256?: string;
  webhook_type?: string;
  webhook_code?: string;
};

/**
 * A verification key plus when it stops being usable. `keyExpiresAt` is Plaid's
 * own `expired_at` in ms; null means the key did not state one.
 */
export type KeyCacheEntry = { key: JsonWebKey; expiresAt: number; keyExpiresAt?: number | null };

/** The key Plaid returns: a JWK that also carries created_at / expired_at. */
export type WebhookKey = JsonWebKey & { expired_at?: string | null };

/** `expired_at` in ms, or null when it is absent or unparseable. */
export function keyExpiresAt(key: JsonWebKey): number | null {
  const raw = (key as WebhookKey).expired_at;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Plaid retires a key at expired_at, so equal-to-now already counts as dead. */
const keyExpired = (expiresAtMs: number | null, nowMs: number): boolean =>
  expiresAtMs !== null && expiresAtMs <= nowMs;

/** Shared by every request in the instance: a hot webhook key is fetched once. */
export const webhookKeyCache = new Map<string, KeyCacheEntry>();

export type KeyFetcher = (kid: string) => Promise<WebhookKey>;

export type VerifyFailure =
  | 'malformed'
  | 'unsupported_alg'
  | 'missing_kid'
  | 'stale_iat'
  | 'future_iat'
  | 'body_mismatch'
  | 'bad_signature'
  | 'key_expired'
  | 'key_unavailable';

export type VerifyResult =
  | { ok: true; claims: WebhookJwtClaims }
  | { ok: false; reason: VerifyFailure };

export function requestBodySha256(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf8').digest('hex');
}

function decodeJson<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function equalStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * A verifier bound to one key fetcher and (by default) the module-level key
 * cache. `now` is milliseconds, injectable so the iat window is testable.
 */
export function createWebhookVerifier(
  fetchKey: KeyFetcher,
  options: { now?: () => number; cache?: Map<string, KeyCacheEntry> } = {},
): (jwt: string | null | undefined, rawBody: string) => Promise<VerifyResult> {
  const now = options.now ?? Date.now;
  const cache = options.cache ?? webhookKeyCache;

  return async function verifyWebhook(jwt, rawBody) {
    if (!jwt) return { ok: false, reason: 'malformed' };
    const parts = jwt.split('.');
    if (parts.length !== 3) return { ok: false, reason: 'malformed' };

    const header = decodeJson<WebhookJwtHeader>(parts[0]);
    const claims = decodeJson<WebhookJwtClaims>(parts[1]);
    if (!header || !claims) return { ok: false, reason: 'malformed' };

    if (header.alg !== 'ES256') return { ok: false, reason: 'unsupported_alg' };
    const kid = (header.kid ?? '').trim();
    if (!kid) return { ok: false, reason: 'missing_kid' };

    const nowMs = now();
    const nowSeconds = Math.floor(nowMs / 1000);
    if (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat)) {
      return { ok: false, reason: 'malformed' };
    }
    if (nowSeconds - claims.iat > MAX_IAT_SKEW_SECONDS) return { ok: false, reason: 'stale_iat' };
    if (claims.iat - nowSeconds > MAX_IAT_SKEW_SECONDS) return { ok: false, reason: 'future_iat' };

    if (typeof claims.request_body_sha256 !== 'string') {
      return { ok: false, reason: 'malformed' };
    }
    if (!equalStrings(requestBodySha256(rawBody), claims.request_body_sha256)) {
      return { ok: false, reason: 'body_mismatch' };
    }

    // A cached key is usable only while the cache entry AND Plaid's own
    // expired_at are in the future. A stale entry is refetched; a key Plaid
    // has retired is refused, never used just because it was cached.
    const cached = cache.get(kid);
    const cachedExpiry = cached ? (cached.keyExpiresAt ?? keyExpiresAt(cached.key)) : null;
    let key =
      cached && cached.expiresAt > nowMs && !keyExpired(cachedExpiry, nowMs) ? cached.key : null;
    if (!key) {
      try {
        key = await fetchKey(kid);
      } catch {
        return { ok: false, reason: 'key_unavailable' };
      }
      if (!key) return { ok: false, reason: 'key_unavailable' };
      const expiresAtMs = keyExpiresAt(key);
      if (keyExpired(expiresAtMs, nowMs)) {
        cache.delete(kid);
        return { ok: false, reason: 'key_expired' };
      }
      cache.set(kid, { key, expiresAt: nowMs + KEY_CACHE_MS, keyExpiresAt: expiresAtMs });
    }

    try {
      const publicKey = createPublicKey({ key, format: 'jwk' });
      const signature = Buffer.from(parts[2], 'base64url');
      const valid = verifySignature(
        'sha256',
        Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8'),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        signature,
      );
      if (!valid) return { ok: false, reason: 'bad_signature' };
    } catch {
      return { ok: false, reason: 'bad_signature' };
    }

    return { ok: true, claims };
  };
}
