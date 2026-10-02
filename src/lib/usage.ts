// The quiet free-tier usage lines ("1 of 3 free invoices used"). Shown only to
// free / canceled users while the paywall is on: /api/access returns the limit
// as null otherwise, and the callers render nothing for null. Secondary text,
// no gold, no alerts or toasts.

export type UsageKind = 'invoice' | 'expense';

export interface UsageSnapshot {
  invoiceCount?: number;
  expenseCount?: number;
  invoiceLimit?: number | null;
  expenseLimit?: number | null;
  trialEligible?: boolean;
}

/** The line after a save, or null when there's nothing to say (no cap, or
 *  already past it — the wall covers that). */
export function usageLine(kind: UsageKind, a: UsageSnapshot | null | undefined): string | null {
  if (!a) return null;
  const used = kind === 'invoice' ? a.invoiceCount : a.expenseCount;
  const limit = kind === 'invoice' ? a.invoiceLimit : a.expenseLimit;
  if (typeof used !== 'number' || typeof limit !== 'number' || used < 1 || used > limit) return null;
  const noun = kind === 'invoice' ? 'invoice' : 'expense';
  if (used === limit) {
    // A returning customer gets no trial, so don't promise one.
    return a.trialEligible === false
      ? `Last free ${noun}.`
      : `Last free ${noun}. Your next one starts a free trial.`;
  }
  return `${used} of ${limit} free ${noun}s used`;
}

/** Settings → "Free plan" row: both counts, or null when not on the free plan. */
export function freePlanSummary(a: UsageSnapshot | null | undefined): string | null {
  if (!a || typeof a.invoiceLimit !== 'number' || typeof a.expenseLimit !== 'number') return null;
  const inv = Math.min(a.invoiceCount ?? 0, a.invoiceLimit);
  const exp = Math.min(a.expenseCount ?? 0, a.expenseLimit);
  return `${inv} of ${a.invoiceLimit} invoices · ${exp} of ${a.expenseLimit} expenses used`;
}

/** Fresh /api/access read → the line for `kind`, or null (paid, paywall off,
 *  offline). Called right after a save, so the count includes it. */
export async function fetchUsageLine(kind: UsageKind): Promise<string | null> {
  try {
    const r = await fetch('/api/access', { cache: 'no-store' });
    return r.ok ? usageLine(kind, (await r.json()) as UsageSnapshot) : null;
  } catch {
    return null;
  }
}
