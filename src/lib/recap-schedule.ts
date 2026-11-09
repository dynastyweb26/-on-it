// When Chat posts a recap card on its own (app open). Asking for one
// ("How did today go?") always works and never touches this.
//
// A pure, seedable decision: no clock, no storage, no randomness of its own.
// The caller passes `now`, the remembered state and a rand() in [0,1).
//
// Numbers (tune them here):
//   chance       1 in 3 per open
//   minHour      nothing before 7:00 local
//   at most one automatic recap per calendar day
//   weekly       at most once per week (Monday-based, like weekKey)
//   weeklyShare  when both are eligible, 1 in 3 picks the weekly
//   never two opens in a row: an open right after one that showed a recap shows none
import { dayKey, weekKey, type RecapKind } from '@/lib/chat-recap';

export const RECAP_SCHEDULE = { chance: 1 / 3, weeklyShare: 1 / 3, minHour: 7 } as const;

export interface RecapState {
  lastDaily: string | null;   // dayKey of the last daily shown
  lastWeekly: string | null;  // weekKey of the last weekly shown
  lastShownDay: string | null; // dayKey of the last recap of either kind
  lastShownAt: number | null; // epoch ms of the last recap of either kind
  lastOpenShown: boolean;     // did the previous open show one?
}

export const EMPTY_RECAP_STATE: RecapState = { lastDaily: null, lastWeekly: null, lastShownDay: null, lastShownAt: null, lastOpenShown: false };

export function decideAutoRecap(
  now: Date,
  state: RecapState,
  rand: () => number,
  cfg: { chance: number; weeklyShare: number; minHour: number } = RECAP_SCHEDULE,
): RecapKind | null {
  if (now.getHours() < cfg.minHour) return null;
  if (state.lastOpenShown) return null;                    // never two opens in a row
  if (state.lastShownDay === dayKey(now)) return null;     // one a day
  const dailyOk = state.lastDaily !== dayKey(now);
  const weeklyOk = state.lastWeekly !== weekKey(now);
  if (!dailyOk && !weeklyOk) return null;
  if (rand() >= cfg.chance) return null;                   // the dice
  if (dailyOk && weeklyOk) return rand() < cfg.weeklyShare ? 'weekly' : 'daily';
  return dailyOk ? 'daily' : 'weekly';
}

/** The state after an open. `shown` is what actually reached the screen (null
 *  when nothing was picked, or the picked recap had nothing in it). */
export function recapStateAfterOpen(state: RecapState, now: Date, shown: RecapKind | null): RecapState {
  if (!shown) return { ...state, lastOpenShown: false };
  return {
    lastDaily: shown === 'daily' ? dayKey(now) : state.lastDaily,
    lastWeekly: shown === 'weekly' ? weekKey(now) : state.lastWeekly,
    lastShownDay: dayKey(now),
    lastShownAt: now.getTime(),
    lastOpenShown: true,
  };
}

/** Storage is untrusted: anything off the shape falls back to "never shown". */
export function parseRecapState(raw: string | null): RecapState {
  try {
    const v = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!v || typeof v !== 'object') return EMPTY_RECAP_STATE;
    const s = (x: unknown) => (typeof x === 'string' ? x : null);
    return {
      lastDaily: s(v.lastDaily),
      lastWeekly: s(v.lastWeekly),
      lastShownDay: s(v.lastShownDay),
      lastShownAt: typeof v.lastShownAt === 'number' && Number.isFinite(v.lastShownAt) ? v.lastShownAt : null,
      lastOpenShown: v.lastOpenShown === true,
    };
  } catch {
    return EMPTY_RECAP_STATE;
  }
}

export const recapStateKey = (userId: string) => `onit-recap-state:${userId}`;
