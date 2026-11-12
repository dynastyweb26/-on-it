// ═══ AI Smart · one model-call budget per turn ═══
//
// Before this, MAX_MODEL_CALLS = 3 covered the /api/ask loop only; the router
// and /api/parse each spent their own calls on the same user turn. Now a turn
// has ONE cap of 8, counted across the router and /api/ask together.
//
// How the two requests share a count: the chat client sends the same x-turn-id
// header on both. The count lives in the existing Upstash Redis with a short
// expiry. A request without a turn id still gets the per-request cap, so the
// ceiling never depends on the client doing the right thing.
//
// Fails OPEN on a Redis outage, exactly like lib/ratelimit: the per-request
// counter below is a hard local wall, and breaking a turn during an infra blip
// would be worse than the shared count lapsing for a minute.
import { Redis } from '@upstash/redis';

/** Model calls one whole user turn may spend: router, tool loop and answer. */
export const TURN_MODEL_CALL_CAP = 8;

/** The shared counter is short-lived: a turn is one interaction, not a session. */
export const TURN_BUDGET_TTL_SECONDS = 600;

/** What the user hears when a turn runs out of calls. Plain, no figure, no blame. */
export const TURN_BUDGET_REPLY = 'I did a lot of looking just now. Ask me again in a moment.';

/** Reserves one call. Returns false once the shared cap is reached. */
export type BudgetReserver = (input: {
  userId: string;
  turnId: string;
  cap: number;
}) => Promise<boolean>;

let redis: Redis | null = null;

/** The real reserver: atomic INCR, self-expiring, one key per user turn. */
export const redisReserve: BudgetReserver = async ({ userId, turnId, cap }) => {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return true; // no shared store configured: the per-request cap still applies
  }
  try {
    if (!redis) redis = Redis.fromEnv();
    const key = `turn:${userId}:${turnId}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, TURN_BUDGET_TTL_SECONDS);
    return n <= cap;
  } catch (e) {
    console.error('turn budget error (failing open)', e);
    return true;
  }
};

export type TurnBudget = {
  /** The shared turn this request belongs to, when the client sent one. */
  turnId: string | null;
  /** Calls this turn has spent so far, as this request sees it. */
  spent(): number;
  /** Reserve one call. False means: stop, answer with a plain reply. */
  spend(): Promise<boolean>;
  exhausted(): boolean;
};

/**
 * One budget per request. Without a turn id it is a plain request cap; with one
 * it is the shared turn cap, backed by Redis.
 */
export function createTurnBudget(input: {
  userId: string;
  turnId?: string | null;
  cap?: number;
  reserve?: BudgetReserver;
}): TurnBudget {
  const cap = input.cap ?? TURN_MODEL_CALL_CAP;
  const turnId = input.turnId?.trim() || null;
  const reserve = input.reserve ?? redisReserve;
  let spent = 0;

  return {
    turnId,
    spent: () => spent,
    exhausted: () => spent >= cap,
    async spend() {
      if (spent >= cap) return false;
      if (turnId) {
        // A shared store that throws must not take the turn down with it: fail
        // open exactly like lib/ratelimit, with the local cap still standing.
        let allowed = true;
        try {
          allowed = await reserve({ userId: input.userId, turnId, cap });
        } catch (e) {
          console.error('turn budget reserve failed (failing open)', e);
        }
        if (!allowed) return false;
      }
      spent += 1;
      return true;
    },
  };
}
