// ═══ ON IT — the plan catalog (TIERS-SPEC.md, design/tiers) ═══
// Everything the plan screens show about the plans, in one pure module: their
// display names, the two monthly prices, the trial length, and the Free / Pro /
// Plus comparison rows.
//
// No limit is written twice. Every cell is read off lib/entitlements.ts through
// rowValueFor(), so changing a plan there moves the table with it, and a row
// added later cannot disagree with what the server enforces. The one number the
// catalog needs from elsewhere is the free plan's recap allowance, which its own
// module owns (lib/recap/quota: FREE_RECAPS) — never a copy.
//
// Pure: no server-only import, no DB, no React. /api/access serves it to the UI
// behind NEXT_PUBLIC_TIERS.
import { entitlementsFor, PLAN_NAMES, type Entitlements, type TierPlan } from './entitlements';
import { TRIAL_DAYS } from './trial';
import { FREE_RECAPS } from './recap/quota';

export { PLAN_NAMES };

/** The two plans a user can buy. Free is what everyone has. */
export type PaidPlan = Exclude<TierPlan, 'free'>;
export const PAID_PLANS: readonly PaidPlan[] = ['pro', 'plus'];

/** Monthly prices in whole cents — integer money, never a float. */
export const PLAN_MONTHLY_CENTS: Record<PaidPlan, number> = { pro: 999, plus: 1699 };

/** The trial every plan starts on (lib/trial.ts owns the number). */
export const PLAN_TRIAL_DAYS = TRIAL_DAYS;

export interface PlanOffer {
  plan: TierPlan;
  name: string;
  /** null on Free: there is nothing to pay. */
  monthlyCents: number | null;
  /** The same price as the user reads it (9.99), or null on Free. */
  monthlyUsd: number | null;
  trialDays: number;
  /** What this plan allows, from the one table in lib/entitlements.ts. */
  limits: Entitlements;
}

/** The limits of a plan, independent of who is looking: Free is the free tier,
 *  Pro and Plus are the paid tiers' own plan values. */
export function limitsForPlan(plan: TierPlan): Entitlements {
  return plan === 'free' ? entitlementsFor('free', null) : entitlementsFor('active', plan);
}

export function planOffer(plan: TierPlan): PlanOffer {
  const cents = plan === 'free' ? null : PLAN_MONTHLY_CENTS[plan];
  return {
    plan,
    name: PLAN_NAMES[plan],
    monthlyCents: cents,
    monthlyUsd: cents == null ? null : cents / 100,
    trialDays: PLAN_TRIAL_DAYS,
    limits: limitsForPlan(plan),
  };
}

/** Free, Pro, Plus — in the order the plan picker shows them. */
export const PLAN_OFFERS: readonly PlanOffer[] = (['free', 'pro', 'plus'] as const).map(planOffer);

// ── Comparison table ────────────────────────────────────────────────────────
// One cell is a value the UI words itself ("Unlimited", "2", a tick). Nothing
// here is a limit the app does not enforce.

export type RowKey =
  | 'invoices'
  | 'estimates'
  | 'expenses'
  | 'recaps'
  | 'reports'
  | 'ai'
  | 'bank'
  | 'recurring'
  | 'attachments';

export type RowValue =
  | { kind: 'yes' }
  | { kind: 'no' }
  | { kind: 'unlimited' }
  /** Capped by the free plan's own cap, whose number the SQL owns. */
  | { kind: 'free' }
  | { kind: 'count'; count: number };

const YES: RowValue = { kind: 'yes' };
const NO: RowValue = { kind: 'no' };
const UNLIMITED: RowValue = { kind: 'unlimited' };
const FREE_CAPPED: RowValue = { kind: 'free' };

/** The one derivation: a row's cell for one plan, from that plan's limits. */
export function rowValueFor(key: RowKey, limits: Entitlements): RowValue {
  switch (key) {
    // Invoices, estimates and expenses share the free document cap, so they
    // share the one entitlement that lifts it.
    case 'invoices':
    case 'estimates':
    case 'expenses':
      return limits.unlimitedDocs ? UNLIMITED : FREE_CAPPED;
    // Paid plans have every recap; Free gets the first FREE_RECAPS, counted at
    // build time (lib/recap/quota owns the allowance).
    case 'recaps':
      return limits.unlimitedDocs ? UNLIMITED : { kind: 'count', count: FREE_RECAPS };
    case 'reports':
      return limits.canExport ? YES : NO;
    case 'ai':
      return { kind: 'count', count: limits.aiDailyLimit };
    case 'bank':
      return limits.canBank ? YES : NO;
    case 'recurring':
      return limits.canRecurring ? YES : NO;
    case 'attachments':
      return limits.canAttach ? YES : NO;
  }
}

/** The rows in display order. Labels are the founder's table wording. */
const ROW_LABELS: readonly { key: RowKey; label: string }[] = [
  { key: 'invoices', label: 'Invoices' },
  { key: 'estimates', label: 'Estimates' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'recaps', label: 'Recaps' },
  { key: 'reports', label: 'Income / expense PDFs' },
  { key: 'ai', label: 'AI questions per day' },
  { key: 'bank', label: 'Bank activity' },
  { key: 'recurring', label: 'Recurring expenses' },
  { key: 'attachments', label: 'Attachments' },
];

export interface ComparisonRow {
  key: RowKey;
  label: string;
  free: RowValue;
  pro: RowValue;
  plus: RowValue;
}

/** The Free / Pro / Plus table, every cell derived from entitlements. */
export const COMPARISON_ROWS: readonly ComparisonRow[] = ROW_LABELS.map(({ key, label }) => ({
  key,
  label,
  free: rowValueFor(key, limitsForPlan('free')),
  pro: rowValueFor(key, limitsForPlan('pro')),
  plus: rowValueFor(key, limitsForPlan('plus')),
}));

/** Everything the plan screens need to draw: the offers and the table. */
export interface PlanCatalog {
  plans: readonly PlanOffer[];
  rows: readonly ComparisonRow[];
}

export const PLAN_CATALOG: PlanCatalog = { plans: PLAN_OFFERS, rows: COMPARISON_ROWS };
