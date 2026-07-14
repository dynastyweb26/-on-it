// ═══ Rate limiting — Upstash Redis (sliding window) ═══
// Replaces the old Postgres-backed counter: atomic (no read-then-write race),
// cross-instance, and — critically — keyed by user id when signed in OR by IP
// for guests, so the cost-exposed AI/transcribe routes can't be drained by an
// anonymous caller dropping a cookie.
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';

export type RateRoute = 'parse' | 'transcribe' | 'zelle_read' | 'zelle_write' | 'checkout';

// Starting points (tune later). AI ~20/min, transcribe ~30/min.
const LIMITS: Record<RateRoute, { tokens: number; window: `${number} s` }> = {
  parse:        { tokens: 20, window: '60 s' },
  transcribe:   { tokens: 30, window: '60 s' },
  zelle_read:   { tokens: 10, window: '60 s' },
  zelle_write:  { tokens: 5,  window: '60 s' },
  checkout:     { tokens: 5,  window: '60 s' }, // checkout-session spam guard
};

let redis: Redis | null = null;
const limiters = new Map<RateRoute, Ratelimit>();

function getLimiter(route: RateRoute): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null; // env absent (e.g. local without Upstash) — caller fails open
  }
  if (!redis) redis = Redis.fromEnv();
  let limiter = limiters.get(route);
  if (!limiter) {
    const { tokens, window } = LIMITS[route];
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(tokens, window),
      prefix: `rl:${route}`,
      analytics: false,
    });
    limiters.set(route, limiter);
  }
  return limiter;
}

/** First hop of x-forwarded-for (Vercel sets it); falls back to x-real-ip. */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** Stable identifier: the signed-in user when present, otherwise the IP. */
export function rateIdentifier(req: NextRequest, userId?: string | null): string {
  return userId ? `user:${userId}` : `ip:${clientIp(req)}`;
}

/**
 * Returns true if the request is allowed. Fails OPEN on a Redis outage or
 * missing env — a rate-limiter that hard-breaks the whole app during an
 * infra blip is worse than a brief, narrow cost window (logged for alerting).
 */
export async function rateLimit(route: RateRoute, identifier: string): Promise<boolean> {
  const limiter = getLimiter(route);
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit(identifier);
    return success;
  } catch (e) {
    console.error('ratelimit error (failing open)', route, e);
    return true;
  }
}
