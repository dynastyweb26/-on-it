// ═══ ON IT — the AI daily limit (TIERS-SPEC.md) ═══
// One turn of /api/ask is one chat_messages row. The limit counts those rows
// since the owner's local midnight and resets at the next one. Pure: the route
// supplies the count, the profile supplies the timezone, and this decides —
// so the day boundary is testable without a clock or a database.
//
// The number itself is never written here: entitlementsFor() is the only place
// a plan's limit is decided.
import { entitlementsFor } from './entitlements';

export interface AiLimitState {
  allowed: boolean;
  used: number;
  limit: 5 | 30 | 100;
  /** The next local midnight, ISO — when `used` starts over. */
  resetsAt: string;
}

/** The numbers a meter shows: what /api/access and every /api/ask answer both
 *  send, so the screen never re-fetches the access route between questions. */
export interface AiMeter {
  used: number;
  limit: number;
  /** The next local midnight, ISO — when `used` starts over. */
  resetsAt: string;
}

export interface AiLimitWindow {
  /** The owner's local midnight today, ISO — the lower bound for the count. */
  since: string;
  resetsAt: string;
}

/** A missing or unknown zone never blocks a question: UTC is the fallback. */
const FALLBACK_ZONE = 'UTC';

function safeZone(timezone: string | null | undefined): string {
  if (!timezone) return FALLBACK_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return FALLBACK_ZONE;
  }
}

/** The wall clock in `zone` at `date` (hour cycle h23, so midnight is 0). */
function wallClock(date: Date, zone: string): {
  y: number; mo: number; d: number; h: number; mi: number; s: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const at: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') at[part.type] = Number(part.value);
  }
  return { y: at.year, mo: at.month, d: at.day, h: at.hour, mi: at.minute, s: at.second };
}

/**
 * The instant of 00:00 local time on y-mo-d in `zone`. Two passes, because the
 * offset at the guess can differ from the offset at midnight on a DST day —
 * which is exactly the 23- and 25-hour window this has to get right.
 */
function localMidnight(y: number, mo: number, d: number, zone: string): Date {
  const target = Date.UTC(y, mo - 1, d, 0, 0, 0);
  let ts = target;
  for (let pass = 0; pass < 3; pass++) {
    const wall = wallClock(new Date(ts), zone);
    const asUtc = Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s);
    ts = target - (asUtc - ts);
  }
  return new Date(ts);
}

/** The window the count covers: today's local midnight → tomorrow's. */
export function aiLimitWindow(timezone: string | null | undefined, now: Date): AiLimitWindow {
  const zone = safeZone(timezone);
  const today = wallClock(now, zone);
  const since = localMidnight(today.y, today.mo, today.d, zone);
  // The next calendar day in that zone (Date.UTC normalizes month rollover).
  const next = new Date(Date.UTC(today.y, today.mo - 1, today.d + 1));
  const resets = localMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), zone);
  return { since: since.toISOString(), resetsAt: resets.toISOString() };
}

/**
 * The meter after this turn. `logged` is whether the turn wrote its
 * chat_messages row: a log that failed (best effort) must not inflate the
 * count the screen shows, and a refused turn wrote nothing at all.
 */
export function aiMeterAfterTurn(
  state: Pick<AiLimitState, 'used' | 'limit' | 'resetsAt'>,
  logged: boolean,
): AiMeter {
  return {
    used: state.used + (logged ? 1 : 0),
    limit: state.limit,
    resetsAt: state.resetsAt,
  };
}

/**
 * The limit decision for one turn: how many the plan allows today, how many
 * are used, and when that count starts over. `used` is whatever the caller
 * counted inside aiLimitWindow(); a negative count reads as zero.
 */
export function aiDailyLimitFor(
  tier: string | null | undefined,
  plan: string | null | undefined,
  timezone: string | null | undefined,
  now: Date,
  used: number,
): AiLimitState {
  const limit = entitlementsFor(tier, plan).aiDailyLimit;
  const count = Number.isFinite(used) && used > 0 ? Math.floor(used) : 0;
  return {
    allowed: count < limit,
    used: count,
    limit,
    resetsAt: aiLimitWindow(timezone, now).resetsAt,
  };
}
