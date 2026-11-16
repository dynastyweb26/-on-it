// Webhook authentication, kept pure so every refusal is testable.
//
// 1. The Authorization header must equal REVENUECAT_WEBHOOK_AUTH (the value set
//    in the RevenueCat dashboard). Compared in constant time: an attacker who
//    times the route learns nothing about how much of the value they guessed.
// 2. Optional HMAC signing (dashboard → Webhooks → signature verification):
//       X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hmac_sha256_hex>
//    where the HMAC is over "<t>.<raw body>" with the integration's signing
//    secret. Verified on the RAW body, before JSON parsing — re-serializing
//    changes the bytes. A timestamp older than five minutes is refused, so a
//    captured delivery cannot be replayed forever.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Constant-time string comparison (hashing first, so length can't leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/** Does the Authorization header match the configured value? */
export function authorizeHeader(header: string | null | undefined, expected: string): boolean {
  if (!header || !expected) return false;
  return safeEqual(header, expected);
}

export type SignatureVerdict = 'ok' | 'missing' | 'malformed' | 'stale' | 'invalid';

export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Verify the HMAC header against the raw request body. */
export function verifySignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  now: Date,
  toleranceMs: number = SIGNATURE_TOLERANCE_MS,
): SignatureVerdict {
  if (!header) return 'missing';
  const t = /(?:^|,)\s*t=(\d+)/.exec(header)?.[1];
  const v1 = /(?:^|,)\s*v1=([0-9a-f]{64})/i.exec(header)?.[1];
  if (!t || !v1) return 'malformed';

  const stampMs = Number(t) * 1000;
  if (!Number.isFinite(stampMs)) return 'malformed';
  if (Math.abs(now.getTime() - stampMs) > toleranceMs) return 'stale';

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  return safeEqual(v1.toLowerCase(), expected) ? 'ok' : 'invalid';
}
