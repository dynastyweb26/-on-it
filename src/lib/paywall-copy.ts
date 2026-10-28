// ═══ Paywall copy and state ═══
// The words and the step list for the paywall's three steps, in ONE pure
// module so every state can be unit-tested without a DOM:
//
//   state     what the access check has said so far (null | true | false)
//   steps     showcase → trial → plan (the trial step drops out for anyone
//             who has no trial left, and for the winback wall)
//   copy      CTA label, disclosure, reason pill, trial timeline, plan rows
//
// The rules themselves are NOT here: trial eligibility is lib/trial.ts (the
// same function /api/checkout and /api/access use) and the caps are the DB's.
// This module only turns their answer into words, so the wall can never
// promise something checkout won't do.
//
// Pure: no DOM, no server-only, no fetch — safe in a client component and in a
// node:test file.
import { TRIAL_DAYS } from '@/lib/trial';

// Which wall: 'invoice' = the 4th invoice at Send, 'expense' = the 6th expense
// before the camera/upload, 'estimate' = the 4th estimate, 'recurring' = a
// recurring expense (paid only), 'reports' = an Income/Expense PDF export,
// 'recaps' = a recap past the free plan's two, 'winback' = a canceled
// customer's nudge (no limit was hit).
export type PaywallVariant = 'invoice' | 'expense' | 'estimate' | 'recurring' | 'reports' | 'recaps' | 'winback';

// Why the wall opened: a quiet pill above the showcase, fixed while its demo
// slides change. A soft prompt may replace it (the `reason` prop).
export const REASON: Record<PaywallVariant, string> = {
  invoice: 'You’ve used your 3 free invoices',
  expense: 'You’ve used your 5 free expenses',
  estimate: 'You’ve used your 3 free estimates',
  recurring: 'Recurring expenses are part of On It',
  reports: 'Reports are part of On It Pro',
  recaps: 'You’ve used your 2 free recaps',
  winback: 'Welcome back — pick up where you left off',
};

/** What the access check has told us. `checking` = null (still in flight or
 *  unreachable); nothing may be charged-wording-free until it answers. */
export type PaywallState = 'checking' | 'trial' | 'paid-today';

/** `true` only for a first-time customer. An unreachable check reads as
 *  `false`, exactly like PaywallModal's client state and /api/access. */
export function paywallState(trialEligible: boolean | null): PaywallState {
  if (trialEligible === null) return 'checking';
  return trialEligible ? 'trial' : 'paid-today';
}

// ── The three steps ─────────────────────────────────────────────────────────
export type PaywallStepId = 'showcase' | 'trial' | 'plan';

export const STEP_TITLE: Record<PaywallStepId, string> = {
  showcase: 'What you win',
  trial: `Try On It free for ${TRIAL_DAYS} days`,
  plan: 'What’s included',
};

/**
 * The steps this wall shows, in order. The trial step needs BOTH a trial to
 * give (state 'trial') and a wall that can offer one — the winback prompt is
 * 'paid-today' by definition, and skipping it is stated here rather than left
 * to eligibility so the two rules can't drift. While the check is in flight
 * the trial step stays (it is the promise; the CTA is disabled meanwhile) and
 * falls away if the answer turns out to be 'paid-today'.
 *
 * `subscribable` is STRIPE_SUBSCRIPTIONS_ENABLED as /api/access reports it. When
 * it is off nobody can start a trial, so the trial step — the wall's longest
 * trial promise — is not shown at all: showcase → plan.
 */
export function stepsFor(variant: PaywallVariant, state: PaywallState, subscribable = true): PaywallStepId[] {
  const trial = subscribable && state !== 'paid-today' && variant !== 'winback';
  return trial ? ['showcase', 'trial', 'plan'] : ['showcase', 'plan'];
}

// ── Footer ──────────────────────────────────────────────────────────────────
/** The one gold button's label. */
export function ctaLabel(state: PaywallState): string {
  return state === 'paid-today' ? 'Subscribe — $9.99/month' : 'Start 14-day free trial';
}

/**
 * The disclosure under the CTA. Material terms only, and they follow the state:
 * a trial says it is free until `freeUntil` (the same trialDates() end the
 * timeline shows), everyone else is told the plan starts (and bills) today.
 * `checking` promises neither.
 */
export function disclosure(state: PaywallState, freeUntil?: string): string {
  switch (state) {
    case 'trial':
      return `${freeUntil ? `Free until ${freeUntil}.` : 'Nothing charged today.'} Then $9.99/month, renews monthly until you cancel. Cancel anytime in Settings.`;
    case 'paid-today':
      return '$9.99/month starts today, renews monthly until you cancel. Cancel anytime in Settings.';
    default:
      return 'Checking your plan…';
  }
}

// ── Step 2 · the trial timeline ─────────────────────────────────────────────
// Static copy only — there is no reminder toggle: the reminder email is a
// cron (/api/trial-reminders) that goes out TRIAL_REMINDER_DAYS before the end,
// and trialDates() (lib/trial) is where both dates come from. The words are
// the design's (design-reference/paywall-mockup.html); the dates are real.
export const TRIAL_COPY = {
  subtitle: 'Here’s exactly what happens, and when.',
  todayLabel: 'Today',
  todayText: 'Full access. Nothing charged today.',
  todayMeta: 'Unlimited invoices, estimates and receipt scans.',
  reminderText: 'We’ll email you a reminder before it ends.',
  reminderMeta: 'From On It · keep it or cancel in Settings',
  startText: 'Your plan starts at $9.99/month unless you cancel.',
  dueTodayLabel: 'Due today',
  todayAmount: '$0.00',
  startAmount: '$9.99/mo',
  cancelNote: 'Cancel anytime in Settings.',
} as const;

// ── Step 3 · Free vs On It ──────────────────────────────────────────────────
// TRUE rows only — each matches what the code enforces (free_invoice_limit() /
// free_estimate_limit() / free_expense_limit(), recurring expenses and PDF
// exports paid-only). `true` = included, `false` = not included.
export type PlanCell = string | boolean;

export interface PlanRow {
  label: string;
  free: PlanCell;
  paid: PlanCell;
  /** Shown only once recaps launch (lib/recaps-live). */
  recapsOnly?: boolean;
}

export const PLAN_ROWS: readonly PlanRow[] = [
  { label: 'Invoices', free: '3 free', paid: 'Unlimited' },
  { label: 'Expenses & receipt scans', free: '5 free', paid: 'Unlimited' },
  { label: 'Estimates', free: '3 free', paid: 'Unlimited' },
  { label: 'Voice invoicing', free: true, paid: true },
  { label: 'Online pay page', free: true, paid: true },
  { label: 'Recurring expenses', free: false, paid: true },
  { label: 'Income & expense reports (PDF)', free: false, paid: true },
  // Two weekly recaps are the free plan's (lib/recap/quota: FREE_RECAPS);
  // monthly recaps and everything past the two are paid-only.
  { label: 'Weekly & monthly recaps', free: '2 weekly', paid: true, recapsOnly: true },
];

/** The table's rows for this build: the recaps row rides the recaps switch. */
export function planRows(recapsLive: boolean): PlanRow[] {
  return PLAN_ROWS.filter((r) => !r.recapsOnly || recapsLive);
}

/** One tier only: there is no second price anywhere on this wall. */
export const PRICE_MONTHLY = '$9.99';
