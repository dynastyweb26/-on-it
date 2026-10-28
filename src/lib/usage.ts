// The quiet free-tier usage lines ("1 of 3 free invoices used"). Shown only to
// free / canceled users while the paywall is on: /api/access returns the limit
// as null otherwise, and the callers render nothing for null. Secondary text,
// no gold, no alerts or toasts.

export type UsageKind = 'invoice' | 'expense' | 'estimate';

export interface UsageSnapshot {
  invoiceCount?: number;
  expenseCount?: number;
  estimateCount?: number;
  invoiceLimit?: number | null;
  expenseLimit?: number | null;
  estimateLimit?: number | null;
  trialEligible?: boolean;
  /** Is subscription checkout open in this deployment? GET /api/access reports
   *  lib/subscriptions; false means the upgrade nudges render nothing. */
  subscriptionsEnabled?: boolean;
  /** hasAccess()'s tier, from the same GET /api/access payload. */
  tier?: string | null;
}

const COUNT_KEY = { invoice: 'invoiceCount', expense: 'expenseCount', estimate: 'estimateCount' } as const;
const LIMIT_KEY = { invoice: 'invoiceLimit', expense: 'expenseLimit', estimate: 'estimateLimit' } as const;

/** The line after a save, or null when there's nothing to say (no cap, or
 *  already past it — the wall covers that). Estimates also warn one before the
 *  last free one ("1 left"), since there are only 3. */
export function usageLine(kind: UsageKind, a: UsageSnapshot | null | undefined): string | null {
  if (!a) return null;
  const used = a[COUNT_KEY[kind]];
  const limit = a[LIMIT_KEY[kind]];
  if (typeof used !== 'number' || typeof limit !== 'number' || used < 1 || used > limit) return null;
  if (used === limit) {
    // A returning customer gets no trial, so don't promise one.
    return a.trialEligible === false
      ? `Last free ${kind}.`
      : `Last free ${kind}. Your next one starts a free trial.`;
  }
  if (kind === 'estimate' && used === limit - 1) return `${used} of ${limit} free estimates used. 1 left.`;
  return `${used} of ${limit} free ${kind}s used`;
}

/** Settings → "Free plan" row: the counts, or null when not on the free plan.
 *  The estimates count is added once the estimate cap is live. */
export function freePlanSummary(a: UsageSnapshot | null | undefined): string | null {
  if (!a || typeof a.invoiceLimit !== 'number' || typeof a.expenseLimit !== 'number') return null;
  const inv = Math.min(a.invoiceCount ?? 0, a.invoiceLimit);
  const exp = Math.min(a.expenseCount ?? 0, a.expenseLimit);
  const est = typeof a.estimateLimit === 'number'
    ? ` · ${Math.min(a.estimateCount ?? 0, a.estimateLimit)} of ${a.estimateLimit} estimates`
    : '';
  return `${inv} of ${a.invoiceLimit} invoices · ${exp} of ${a.expenseLimit} expenses${est} used`;
}

/** Fresh /api/access read → the counters it reports, or null (offline, or the
 *  route refused). Called right after a save, so the count includes it. */
export async function fetchUsageSnapshot(): Promise<UsageSnapshot | null> {
  try {
    const r = await fetch('/api/access', { cache: 'no-store' });
    return r.ok ? ((await r.json()) as UsageSnapshot) : null;
  } catch {
    return null;
  }
}

/** Fresh /api/access read → the line for `kind`, or null (paid, paywall off,
 *  offline). */
export async function fetchUsageLine(kind: UsageKind): Promise<string | null> {
  return usageLine(kind, await fetchUsageSnapshot());
}
