// ═══ feedback.checkin · when the occasional card may appear ═══
//
// RULES.md §6, item 4: at most once every 30 days, never in the middle of a
// task, and skip anyone who sent feedback in the last 30 days.
//
// Storage is the one the existing "Tell us about On It" prompt already uses:
// the `onit_feedback_prompt` localStorage value (lastShownAt), parsed by
// lib/feedback's tolerant `parsePromptState`, plus the feedback table's newest
// `created_at` for this user (read under their own session). No new column and
// no migration: the old rule ("never again after one submission") is replaced by
// the 30-day window here, which is why submission is a timestamp, not a boolean.
//
// This card now and then, never on a task: the caller passes `midTask` true for
// a voice session, an open template, the paywall or the tour (RULES §6, item 4).
import { parsePromptState, type PromptState } from '@/lib/feedback';

export const CHECKIN_INTERVAL_DAYS = 30;
export const CHECKIN_INTERVAL_MS = CHECKIN_INTERVAL_DAYS * 86_400_000;

/** The localStorage key the existing feedback prompt already writes. */
export const CHECKIN_STORAGE_KEY = 'onit_feedback_prompt';

/**
 * The same object the existing prompt writes (lastShownAt, snoozedUntil,
 * dismissals): updating the check-in must not wipe the sibling card's snooze.
 */
export type CheckInState = PromptState;

export const EMPTY_CHECKIN_STATE: CheckInState = {
  lastShownAt: null,
  snoozedUntil: null,
  dismissals: 0,
};

export type CheckInContext = {
  now: number;
  /** When the check-in card was last shown (the prompt's lastShownAt). */
  lastAskedAt: number | null;
  /** Newest feedback row's created_at for this user, or null. */
  lastSubmittedAt: number | null;
  /** A voice session, an open template, the paywall or the tour is up. */
  midTask: boolean;
};

export type CheckInDecision =
  | { show: true; nextEligibleAt: number }
  | { show: false; reason: 'mid_task' | 'asked_recently' | 'submitted_recently'; nextEligibleAt: number };

const VALID_TS = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Eligible when: not mid-task, not asked in the last 30 days, and no feedback
 * submitted in the last 30 days. Both windows are the same 30 days by rule.
 */
export function checkInDecision(c: CheckInContext): CheckInDecision {
  const askedUntil = VALID_TS(c.lastAskedAt) ? c.lastAskedAt + CHECKIN_INTERVAL_MS : 0;
  const submittedUntil = VALID_TS(c.lastSubmittedAt) ? c.lastSubmittedAt + CHECKIN_INTERVAL_MS : 0;
  const nextEligibleAt = Math.max(askedUntil, submittedUntil);

  if (c.midTask) return { show: false, reason: 'mid_task', nextEligibleAt: Math.max(nextEligibleAt, c.now) };
  if (c.now < askedUntil) return { show: false, reason: 'asked_recently', nextEligibleAt };
  if (c.now < submittedUntil) {
    return { show: false, reason: 'submitted_recently', nextEligibleAt };
  }
  return { show: true, nextEligibleAt: c.now };
}

/** Shown: remember when, preserving the sibling prompt's snooze fields. */
export function markCheckInAsked(state: CheckInState, now: number): CheckInState {
  return { ...state, lastShownAt: now };
}

/** A timestamp from the feedback table (Postgres Date or Supabase text), or null. */
export function submittedAtFrom(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Read the existing prompt storage; anything odd means "never asked". */
export function checkInStateFrom(raw: string | null): CheckInState {
  return parsePromptState(raw);
}
