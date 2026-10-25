// ═══ ON IT — the ONE access check ═══
// Every paywall gate calls hasAccess(userId). No scattered tier logic.
//
// - 'founder' (access_tier materialized by redeem_grant from an access_grants
//   token, e.g. 'dadcrew') bypasses everything — founders never see a paywall.
// - 'trialing' / 'active' → unlimited (a live subscription).
// - 'past_due' → unlimited (Stripe dunning grace: payment is retrying. The
//   webhook collapses the tier to 'canceled' once retries are exhausted, which
//   ends the grace — see tierFromStatus in lib/subscription/state.ts).
// - 'canceled' → exactly like 'free' below (reported as 'canceled').
// - 'free' (and any legacy value like the old 'standard') → free_invoice_limit()
//   real invoices and free_expense_limit() expenses created since
//   paywall_reset_at(), and free_estimate_limit() estimates (kind='quote')
//   created since estimate_reset_at(), then paywalled. Older rows never count;
//   soft-deleted ones do. Recurring expenses can't be created at all (paid).
//
// These tier rules MUST match the enforce_free_invoice_limit() (invoices and
// estimates), enforce_free_expense_limit() and enforce_paid_recurring_expenses()
// triggers exactly (20261001000001 / 000002 / 20261025100000) — the modal and
// the DB gate cannot disagree. The caps and the reset moments each live in ONE
// place, the SQL free_invoice_limit(), free_expense_limit(),
// free_estimate_limit(), paywall_reset_at() and estimate_reset_at(), read below
// via rpc.
//
// Server-only: it reads the DB with the session client under RLS. The client
// gates via GET /api/access, never by importing this.
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { PAYWALL_ENABLED } from '@/lib/paywall';

export type AccessTier = 'free' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'founder';

export interface AccessResult {
  hasAccess: boolean;    // may create an invoice (the original meaning, unchanged)
  canExpense: boolean;   // may create an expense
  canEstimate: boolean;  // may create an estimate (a quote)
  canRecurring: boolean; // may create a recurring expense (paid tiers only)
  // May export the Income / Expense PDFs (Totals and Itemized). Paid tiers
  // only while the paywall is on; everyone when it is off. UI gate: the PDFs
  // are built in the browser from the user's own RLS-scoped rows, so there is
  // no server step to enforce it on.
  canExport: boolean;
  tier: AccessTier;
  invoiceCount: number;  // real invoices since the reset (quotes never count)
  expenseCount: number;  // expenses since the reset (soft-deleted included)
  estimateCount: number; // estimates (quotes) since estimate_reset_at (soft-deleted included)
  // The free limits that apply to this user right now; null = no cap (a paid
  // tier, or the paywall off). Drives the "1 of 3 free invoices used" lines.
  invoiceLimit: number | null;
  expenseLimit: number | null;
  estimateLimit: number | null;
}

// A free limit worth showing the user; anything this large is "uncapped".
export const displayLimit = (n: unknown): number | null =>
  typeof n === 'number' && n < 1000 ? n : null;

/** Optional per-step durations (ms), filled in when passed. /api/access
 *  logs them on preview to measure the request (see that route). */
export type AccessTiming = Record<string, number>;

async function timed<T>(timing: AccessTiming | undefined, key: string, p: PromiseLike<T>): Promise<T> {
  if (!timing) return p;
  const t0 = performance.now();
  try { return await p; } finally { timing[key] = Math.round(performance.now() - t0); }
}

export async function hasAccess(userId: string, timing?: AccessTiming): Promise<AccessResult> {
  const supabase = await createClient();

  // Two rounds instead of four sequential ones. Round 1: the tier and the
  // reset moment, which nothing else depends on. Round 2: the counts (they
  // need the reset) and both limits (constant; fetched alongside so a free
  // user pays no extra round). Paid tiers and the paywall-off path ignore
  // the limits, exactly as before.
  const [{ data: profile }, { data: resetData }, { data: estimateResetData }] = await Promise.all([
    timed(timing, 'profile', supabase.from('profiles').select('access_tier').eq('id', userId).maybeSingle()),
    // Before the reset migration is pushed the rpc doesn't exist; count
    // all-time then, as before (the limits are still the kill-switch value).
    timed(timing, 'reset', supabase.rpc('paywall_reset_at')),
    timed(timing, 'estimateReset', supabase.rpc('estimate_reset_at')),
  ]);
  const raw = (profile?.access_tier ?? 'free') as string;
  const resetAt = typeof resetData === 'string' ? resetData : null;
  const estimateResetAt = typeof estimateResetData === 'string' ? estimateResetData : null;

  // Count the same rows the triggers count: real invoices (kind='invoice', not
  // quotes) and all expenses, created since the paywall reset, soft-deleted
  // included (RLS select is auth.uid() = user_id, so deleted rows are visible).
  let invoiceQuery = supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'invoice');
  let expenseQuery = supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  // Estimates are the quotes (kind='quote'), counted from their own reset.
  let estimateQuery = supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'quote');
  if (resetAt) {
    invoiceQuery = invoiceQuery.gte('created_at', resetAt);
    expenseQuery = expenseQuery.gte('created_at', resetAt);
  }
  if (estimateResetAt) estimateQuery = estimateQuery.gte('created_at', estimateResetAt);
  // Each cap is read from the SAME SQL function its trigger uses, so the
  // numbers are never duplicated.
  const [
    { count: invCount }, { count: expCount }, { count: estCount },
    { data: invLimit }, { data: expLimit }, { data: estLimit },
  ] = await Promise.all([
    timed(timing, 'invoiceCount', invoiceQuery),
    timed(timing, 'expenseCount', expenseQuery),
    timed(timing, 'estimateCount', estimateQuery),
    timed(timing, 'invoiceLimit', supabase.rpc('free_invoice_limit')),
    timed(timing, 'expenseLimit', supabase.rpc('free_expense_limit')),
    timed(timing, 'estimateLimit', supabase.rpc('free_estimate_limit')),
  ]);
  const invoiceCount = invCount ?? 0;
  const expenseCount = expCount ?? 0;
  const estimateCount = estCount ?? 0;
  const counts = { invoiceCount, expenseCount, estimateCount, invoiceLimit: null, expenseLimit: null, estimateLimit: null };
  const everything = { hasAccess: true, canExpense: true, canEstimate: true, canRecurring: true, canExport: true };

  if (raw === 'founder') return { ...everything, tier: 'founder', ...counts };
  // trialing / active / past_due → unlimited (past_due = dunning grace window).
  if (raw === 'trialing' || raw === 'active' || raw === 'past_due') {
    return { ...everything, tier: raw, ...counts };
  }
  // Capped from here on: free, canceled, legacy, anything unexpected. A
  // canceled user is treated exactly like a free one (the triggers do the
  // same): the free limits counted from the reset, quotes always allowed. The
  // tier is still reported as 'canceled' so the UI can word things for them.
  const tier: AccessTier = raw === 'canceled' ? 'canceled' : 'free';

  // Paywall kill switch (UI): with the paywall off nothing is gated here. The
  // DB triggers still enforce whatever limits are live — turning the caps off
  // for real is the rollback (supabase/rollbacks/paywall_v2_rollback.sql).
  if (!PAYWALL_ENABLED) {
    return { ...everything, tier, ...counts };
  }

  // If an rpc failed we do NOT false-block — the triggers are the real
  // enforcement, and hasAccess is only the UX hint.
  const invoiceLimit = typeof invLimit === 'number' ? invLimit : Number.MAX_SAFE_INTEGER;
  const expenseLimit = typeof expLimit === 'number' ? expLimit : Number.MAX_SAFE_INTEGER;
  const estimateLimit = typeof estLimit === 'number' ? estLimit : Number.MAX_SAFE_INTEGER;
  return {
    hasAccess: invoiceCount < invoiceLimit,
    canExpense: expenseCount < expenseLimit,
    canEstimate: estimateCount < estimateLimit,
    canRecurring: false, // recurring expenses are a paid feature (free / canceled tiers)
    canExport: false, // reports are a paid feature (free / canceled tiers)
    tier,
    ...counts,
    // Only real limits: a missing rpc (pre-push) or the paywall-off sentinel
    // (1,000,000, 20260823120000) reads as no cap, so no "1 of 1000000" line.
    invoiceLimit: displayLimit(invLimit),
    expenseLimit: displayLimit(expLimit),
    estimateLimit: displayLimit(estLimit),
  };
}
