// Unlock polling, pure part (no DOM, no fetch of its own): used by
// lib/upgrade-return.ts. After checkout success or a code redeem the paid tier
// reaches the database a moment later (Stripe webhook), so the client re-reads
// /api/access on a short backoff until the tier reads paid, then gives up.
import { isPaidTier } from '@/lib/paywall';

/** Waits between reads: 1 s, 2 s, then 3 s steps. Sums to 20 s. */
export const UNLOCK_BACKOFF_MS: readonly number[] = [1000, 2000, 3000, 3000, 3000, 3000, 3000, 2000];

export type AccessRead = {
  tier?: string;
  hasAccess?: boolean;
  canExpense?: boolean;
  canExport?: boolean;
  [k: string]: unknown;
};

/** Paid = a paid tier, or the paywall is off so everything already reads open. */
export const accessIsPaid = (a: AccessRead | null | undefined): boolean =>
  !!a && (isPaidTier(a.tier) || a.canExport === true);

export type PollResult =
  | { status: 'paid'; access: AccessRead; reads: number }
  | { status: 'timeout'; access: AccessRead | null; reads: number };

/**
 * Wait, read, repeat. `read` returns null on a failed read (network, 401,
 * 429): that counts as an attempt and the poll carries on. Always waits first:
 * the webhook never beats the browser back by less than the first delay.
 */
export async function pollUntilPaid(
  read: () => Promise<AccessRead | null>,
  sleep: (ms: number) => Promise<void>,
  delays: readonly number[] = UNLOCK_BACKOFF_MS,
): Promise<PollResult> {
  let last: AccessRead | null = null;
  let reads = 0;
  for (const ms of delays) {
    await sleep(ms);
    reads++;
    let a: AccessRead | null = null;
    try { a = await read(); } catch { a = null; }
    if (a) last = a;
    if (a && accessIsPaid(a)) return { status: 'paid', access: a, reads };
  }
  return { status: 'timeout', access: last, reads };
}
