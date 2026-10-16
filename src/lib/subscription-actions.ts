// Billing actions for the cancel flow — the ONLY module the Plan and cancel
// screens call to change a subscription. The screens, stats and reasons know
// nothing about the billing provider; this module and /api/subscription/*
// are the web (Stripe) implementation. Apple / Google billing get their own
// versions of these same functions later, and the UI is reused as is.
//
// Every function resolves (never throws) to { ok: true, ... } or
// { ok: false, message } with a message fit to show inline.
import type { CancelReason } from './subscription/reasons';
import type { OfferKind, PauseMonths } from './subscription/offers';
import type { StatTile } from './subscription/stats';

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; message: string; error?: string };

const UNAVAILABLE = 'That’s not available right now — try again shortly.';

async function post<T>(path: string, body?: unknown): Promise<ActionResult<T>> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) return data as ActionResult<T>;
    return { ok: false, message: data?.message ?? UNAVAILABLE, error: data?.error };
  } catch {
    return { ok: false, message: UNAVAILABLE };
  }
}

/** What the Plan and cancel screens render (GET /api/subscription/cancel-summary). */
export type CancelSummary = {
  tier: string;
  status: string | null;
  subscribed: boolean;
  cancelAtPeriodEnd: boolean;
  pausedUntil: string | null;
  endsAt: string | null;
  offerEligible?: boolean;
  tiles?: StatTile[];
  freeLimits?: { invoices: number | null; expenses: number | null };
};

/** Server state for the subscription screens, or null when unavailable. */
export async function getSummary(): Promise<CancelSummary | null> {
  try {
    const res = await fetch('/api/subscription/cancel-summary', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as CancelSummary) : null;
  } catch {
    return null;
  }
}

/** Cancel at the end of the paid period (or trial). Reason and detail are optional. */
export function cancel(input: { reason?: CancelReason | null; detail?: string | null } = {}) {
  return post<{ endsAt: string | null }>('/api/subscription/cancel', {
    reason: input.reason ?? undefined,
    detail: input.detail ?? undefined,
  });
}

/** Undo a pending cancel, or end a pause now. */
export function resume() {
  return post<{ changed: boolean }>('/api/subscription/resume');
}

/** Take the retention offer: 'discount' (50% off the next 2 months) or
 *  'pause' for 1-3 months. The server re-checks eligibility. */
export function applyOffer(kind: OfferKind, months?: PauseMonths) {
  return post<{ kind: OfferKind; pausedUntil: string | null }>('/api/subscription/offer', { kind, months });
}
