// ═══ Rate limiting — Upstash Redis (sliding window) ═══
// Replaces the old Postgres-backed counter: atomic (no read-then-write race),
// cross-instance, and — critically — keyed by user id when signed in OR by IP
// for guests, so the cost-exposed AI/transcribe routes can't be drained by an
// anonymous caller dropping a cookie.
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';

export type RateRoute = 'parse' | 'parse_receipt' | 'transcribe' | 'zelle_read' | 'zelle_write' | 'checkout' | 'billing_portal' | 'delete_account' | 'access';

// Starting points (tune later). AI ~20/min, transcribe ~12/min.
const LIMITS: Record<RateRoute, { tokens: number; window: `${number} s` }> = {
  parse:          { tokens: 20, window: '60 s' },
  // Vision costs meaningfully more per call than a text parse, and a human
  // photographing receipts can't outpace 10/min. Tighter on purpose.
  parse_receipt:  { tokens: 10, window: '60 s' },
  // Tightened from 30 → 12/min: with the paywall off, tier no longer gates who
  // keeps calling, so the per-minute window is a real cost ceiling on
  // AssemblyAI + the downstream /api/parse (Anthropic). A human dictating jobs
  // never needs more than ~12/min; pair with the per-user daily cap below.
  transcribe:     { tokens: 12, window: '60 s' },
  zelle_read:     { tokens: 10, window: '60 s' },
  zelle_write:    { tokens: 5,  window: '60 s' },
  checkout:       { tokens: 5,  window: '60 s' }, // checkout-session spam guard
  billing_portal: { tokens: 5,  window: '60 s' }, // portal-session spam guard
  // Irreversible + does Stripe/Storage/auth work — the tightest bucket. A real
  // user deletes once; a few retries after a transient failure is the ceiling.
  delete_account: { tokens: 3,  window: '60 s' },
  access:         { tokens: 20, window: '60 s' }, // access check spam guard
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

// ═══ Global daily guest ceiling ═══
// The per-user/IP window above is per-caller; a determined abuser rotating IPs
// and clearing cookies gets a fresh sliding window every time. This is a single
// shared counter across ALL guests for a cost-exposed route, so cookie-clearing
// plus IP rotation still runs into one hard daily wall. Only guest
// (unauthenticated) calls are counted; signed-in users are never subject to it.
const DAILY_GUEST_CAP: Partial<Record<RateRoute, number>> = {
  // ~500 short guest voice notes/day. Generous for the real demo funnel (a few
  // hundred new visitors doing a handful of taps each stays well under), and
  // cheap if abused — worst case is a few dollars of AssemblyAI, not a runaway
  // bill, no matter how many fresh cookies/IPs an attacker throws at it.
  transcribe: 500,
};

/**
 * Reserves one unit of today's global guest budget for `route` and returns
 * true if still within budget (caller may proceed), false once the daily
 * ceiling is reached. Atomic INCR, so it's cross-instance safe; rejected
 * calls still consume, which only makes the wall firmer for the rest of the
 * day — the right bias for a cost backstop. The key self-expires.
 *
 * Fails OPEN on a Redis outage / missing env, matching rateLimit — in that
 * window the per-guest cookie cap in the route remains as a floor.
 */
export async function reserveGuestDaily(route: RateRoute): Promise<boolean> {
  const cap = DAILY_GUEST_CAP[route];
  if (cap == null) return true;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return true; // env absent (e.g. local without Upstash) — fail open
  }
  if (!redis) redis = Redis.fromEnv();
  const day = new Date().toISOString().slice(0, 10); // UTC calendar day
  const key = `guestcap:${route}:${day}`;
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 60 * 60 * 48); // self-clean, 48h margin
    return n <= cap;
  } catch (e) {
    console.error('guest daily cap error (failing open)', route, e);
    return true;
  }
}

// ═══ Per-signed-in-user daily ceiling ═══
// The sliding per-minute window (LIMITS) caps burst rate; this caps ONE
// account's total daily spend on a cost-exposed route. Until the paywall was
// switched off, tier gating was the implicit daily ceiling — a free account
// couldn't stay past the invoice cap, so it couldn't run up transcribe/parse
// spend indefinitely. With the paywall off that backstop is gone and signed-in
// accounts otherwise have NO daily limit, so add an explicit one. Guests are
// covered separately by reserveGuestDaily; a caller uses one or the other.
const DAILY_USER_CAP: Partial<Record<RateRoute, number>> = {
  // ~150 voice notes/day per account. Far more than a real contractor dictating
  // invoices needs, but a hard wall against a single account running up an
  // unbounded AssemblyAI + Anthropic bill now that nothing gates on tier.
  transcribe: 150,
};

/**
 * Reserves one unit of TODAY's budget for (`route`, `userId`) and returns true
 * while under the daily cap, false once it's reached. Atomic INCR (cross-
 * instance safe); the key self-expires. Reserves on attempt, matching
 * reserveGuestDaily — a rejected call still consumes, which only firms the wall
 * for the rest of the day.
 *
 * Fails OPEN on a Redis outage / missing env, matching rateLimit and
 * reserveGuestDaily — a limiter that hard-breaks the app during an infra blip
 * is worse than a brief, narrow cost window (logged for alerting).
 */
export async function reserveUserDaily(route: RateRoute, userId: string): Promise<boolean> {
  const cap = DAILY_USER_CAP[route];
  if (cap == null) return true;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return true; // env absent (e.g. local without Upstash) — fail open
  }
  if (!redis) redis = Redis.fromEnv();
  const day = new Date().toISOString().slice(0, 10); // UTC calendar day
  const key = `usercap:${route}:${userId}:${day}`;
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 60 * 60 * 48); // self-clean, 48h margin
    return n <= cap;
  } catch (e) {
    console.error('user daily cap error (failing open)', route, e);
    return true;
  }
}
