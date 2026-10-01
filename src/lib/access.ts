// ═══ ON IT — the ONE access check ═══
// Every paywall gate calls hasAccess(userId). No scattered tier logic.
//
// - 'founder' (access_tier materialized by redeem_grant from an access_grants
//   token, e.g. 'dadcrew') bypasses everything — founders never see a paywall.
// - 'trialing' / 'active' → unlimited (a live subscription).
// - 'past_due' → unlimited (Stripe dunning grace: payment is retrying. The
//   webhook collapses the tier to 'canceled' once retries are exhausted, which
//   ends the grace — see tierFromStatus in the stripe webhook).
// - 'canceled' → exactly like 'free' below (reported as 'canceled').
// - 'free' (and any legacy value like the old 'standard') → free_invoice_limit()
//   real invoices and free_expense_limit() expenses created since
//   paywall_reset_at(), then paywalled. Older rows never count; soft-deleted
//   ones do.
//
// These tier rules MUST match the enforce_free_invoice_limit() and
// enforce_free_expense_limit() triggers exactly (20261001000001 / 000002) —
// the modal and the DB gate cannot disagree. The caps and the reset moment
// each live in ONE place, the SQL free_invoice_limit(), free_expense_limit()
// and paywall_reset_at(), read below via rpc.
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
  // May export the Income / Expense PDFs (Totals and Itemized). Paid tiers
  // only while the paywall is on; everyone when it is off. UI gate: the PDFs
  // are built in the browser from the user's own RLS-scoped rows, so there is
  // no server step to enforce it on.
  canExport: boolean;
  tier: AccessTier;
  invoiceCount: number;  // real invoices since the reset (quotes never count)
  expenseCount: number;  // expenses since the reset (soft-deleted included)
  // The free limits that apply to this user right now; null = no cap (a paid
  // tier, or the paywall off). Drives the "1 of 3 free invoices used" lines.
  invoiceLimit: number | null;
  expenseLimit: number | null;
}

export async function hasAccess(userId: string): Promise<AccessResult> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('access_tier')
    .eq('id', userId)
    .maybeSingle();
  const raw = (profile?.access_tier ?? 'free') as string;

  // Count the same rows the triggers count: real invoices (kind='invoice', not
  // quotes) and all expenses, created since the paywall reset, soft-deleted
  // included (RLS select is auth.uid() = user_id, so deleted rows are visible).
  // Before the reset migration is pushed the rpc doesn't exist; count all-time
  // then, as before (the limits are still the kill-switch value at that point).
  const { data: resetData } = await supabase.rpc('paywall_reset_at');
  const resetAt = typeof resetData === 'string' ? resetData : null;
  let invoiceQuery = supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'invoice');
  let expenseQuery = supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (resetAt) {
    invoiceQuery = invoiceQuery.gte('created_at', resetAt);
    expenseQuery = expenseQuery.gte('created_at', resetAt);
  }
  const [{ count: invCount }, { count: expCount }] = await Promise.all([invoiceQuery, expenseQuery]);
  const invoiceCount = invCount ?? 0;
  const expenseCount = expCount ?? 0;
  const counts = { invoiceCount, expenseCount, invoiceLimit: null, expenseLimit: null };

  if (raw === 'founder') return { hasAccess: true, canExpense: true, canExport: true, tier: 'founder', ...counts };
  // trialing / active / past_due → unlimited (past_due = dunning grace window).
  if (raw === 'trialing' || raw === 'active' || raw === 'past_due') {
    return { hasAccess: true, canExpense: true, canExport: true, tier: raw, ...counts };
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
    return { hasAccess: true, canExpense: true, canExport: true, tier, ...counts };
  }

  // Each cap is read from the SAME SQL function its trigger uses, so the
  // numbers are never duplicated. If an rpc fails we do NOT false-block — the
  // triggers are the real enforcement, and hasAccess is only the UX hint.
  const [{ data: invLimit }, { data: expLimit }] = await Promise.all([
    supabase.rpc('free_invoice_limit'),
    supabase.rpc('free_expense_limit'),
  ]);
  const invoiceLimit = typeof invLimit === 'number' ? invLimit : Number.MAX_SAFE_INTEGER;
  const expenseLimit = typeof expLimit === 'number' ? expLimit : Number.MAX_SAFE_INTEGER;
  return {
    hasAccess: invoiceCount < invoiceLimit,
    canExpense: expenseCount < expenseLimit,
    canExport: false, // reports are a paid feature (free / canceled tiers)
    tier,
    ...counts,
    // Only real limits: a missing rpc (pre-push) reads as no cap.
    invoiceLimit: typeof invLimit === 'number' ? invLimit : null,
    expenseLimit: typeof expLimit === 'number' ? expLimit : null,
  };
}
