// ═══ ON IT — what each paywall entry point opens (design/tiers 01) ═══
// Every wall is the same screen, but it does not open the same way: a free
// limit preselects Pro, a Plus lock preselects Plus, and a Pro user who hits a
// Plus lock reads the "Move up to Plus" line. Those decisions are here, once,
// so no mount point picks a plan or a top line of its own.
//
// The result is data: the plan to preselect and a KEY for the top-line copy
// (Claude Code owns the words). A null result means there is no wall to show —
// a Plus user at a Plus lock, or a Plus user at the AI limit, which is the one
// limit they still have and has no upgrade row.
//
// Pure: no DB, no React, no copy.
import type { TierPlan } from './entitlements';

/** Every entry point that opens the paywall. */
export type PaywallEntry =
  // Free/document limits: the 4th invoice, 4th estimate, 6th expense.
  | 'invoice'
  | 'estimate'
  | 'expense'
  // Plus locks (TIERS-SPEC: bank activity, recurring expenses, attachments).
  | 'recurring'
  | 'photos'
  | 'bank'
  // Paid-only features a free user asks for.
  | 'pdfs'
  | 'recaps'
  // The AI daily limit card.
  | 'ai-limit'
  // A canceled customer's winback nudge.
  | 'winback'
  // The soft prompts, which open a wall nobody hit a limit on.
  | 'soft-usage-invoice'
  | 'soft-usage-estimate'
  | 'soft-estimate-approved'
  | 'soft-first-payment'
  | 'soft-winback';

/** The top-line copy key. The wording lives with the UI, not here. */
export type PaywallTopLineKey =
  | 'limit.invoice'
  | 'limit.estimate'
  | 'limit.expense'
  | 'lock.recurring'
  | 'lock.photos'
  | 'lock.bank'
  // A Pro user at a Plus lock: the "Move up to Plus" variant.
  | 'lock.recurring.moveUp'
  | 'lock.photos.moveUp'
  | 'lock.bank.moveUp'
  | 'reports'
  | 'recaps'
  | 'ai.limit.free'
  | 'ai.limit.pro'
  | 'winback'
  | 'soft.usage.invoice'
  | 'soft.usage.estimate'
  | 'soft.estimate-approved'
  | 'soft.first-payment'
  | 'soft.winback';

export interface PaywallEntryTarget {
  /** The plan card the wall opens with selected. */
  plan: 'pro' | 'plus';
  topLineKey: PaywallTopLineKey;
}

const FREE_LIMIT: Readonly<Record<string, PaywallTopLineKey>> = {
  invoice: 'limit.invoice',
  estimate: 'limit.estimate',
  expense: 'limit.expense',
  pdfs: 'reports',
  recaps: 'recaps',
  winback: 'winback',
  'soft-usage-invoice': 'soft.usage.invoice',
  'soft-usage-estimate': 'soft.usage.estimate',
  'soft-estimate-approved': 'soft.estimate-approved',
  'soft-first-payment': 'soft.first-payment',
  'soft-winback': 'soft.winback',
};

const PLUS_LOCK: Readonly<Record<string, PaywallTopLineKey>> = {
  recurring: 'lock.recurring',
  photos: 'lock.photos',
  bank: 'lock.bank',
};

const MOVE_UP: Readonly<Record<string, PaywallTopLineKey>> = {
  recurring: 'lock.recurring.moveUp',
  photos: 'lock.photos.moveUp',
  bank: 'lock.bank.moveUp',
};

/**
 * The plan to preselect and the top-line key for this entry point, or null when
 * this user has nothing to buy there.
 */
export function paywallEntryFor(entry: PaywallEntry, viewerPlan: TierPlan): PaywallEntryTarget | null {
  // A Plus lock is already open on Plus.
  if (entry in PLUS_LOCK) {
    if (viewerPlan === 'plus') return null;
    return {
      plan: 'plus',
      topLineKey: viewerPlan === 'pro' ? MOVE_UP[entry] : PLUS_LOCK[entry],
    };
  }

  // The AI limit: Free buys Pro, Pro buys Plus, Plus has no upgrade row.
  if (entry === 'ai-limit') {
    if (viewerPlan === 'plus') return null;
    return viewerPlan === 'pro'
      ? { plan: 'plus', topLineKey: 'ai.limit.pro' }
      : { plan: 'pro', topLineKey: 'ai.limit.free' };
  }

  if (entry in FREE_LIMIT) return { plan: 'pro', topLineKey: FREE_LIMIT[entry] };

  // An entry point added to the union above without a mapping here: no wall,
  // never a guessed plan.
  return null;
}
