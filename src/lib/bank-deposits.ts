// ═══ Money in on the client ═══
// The deposit review card reads one preview-only route and posts one decision.
// Everything here is pure so the rules are testable without a browser; the URL
// literal lives in this file, which bank-tracking.test.ts scans, so no bank
// component can call an unlisted endpoint.
//
// The vocabulary is the six-way "Other money received" set (lib/other-income),
// not a "Not income" bucket: a deposit the owner does not count as income has
// to say WHAT it was. Two of the six are income; the rest are recorded and
// count nowhere.
import { formatDay, formatMoney } from './bank-tracking';
import { payoutNote, type StripeVerdict } from './plaid/payouts';
import { countsAsIncome, type DepositClassification } from './other-income';

export const DEPOSITS_URL = '/api/plaid/deposits';

/** What a decision row can say. Mirrors bank_deposit_links.kind. */
export type DepositKind =
  | 'recorded' | 'linked' | 'classified' | 'ignored' | 'stripe_payout';

/** What the card can post. 'classified' carries a classification. */
export type DepositAction = 'record' | 'already' | 'ignored' | 'classified';

export type ApiDeposit = {
  id: string;
  name: string;
  merchant: string | null;
  amount_cents: number;
  occurred_on: string;
  pending: boolean;
  removed: boolean;
  is_stripe_payout: boolean;
  /** Server-derived: a STRIPE descriptor, and nothing more certain than that. */
  payout: StripeVerdict;
  /** A link row or an other_income row already decides this deposit. */
  accounted: boolean;
  link: { kind: DepositKind; payment_id: string | null; classification: string | null } | null;
  suggestion: { invoice_id: string; invoice_number: number | null; reason: 'invoice_number' | 'amount' } | null;
};

export type DepositInvoice = {
  id: string;
  invoice_number: number | null;
  client_name: string | null;
  balance_cents: number;
};

export type DepositPayment = {
  id: string;
  invoice_number: number | null;
  amount_cents: number;
  method: string;
  paid_at: string;
};

export type DepositPlan =
  | { kind: 'none' }
  | { kind: 'rows'; deposits: ApiDeposit[]; invoices: DepositInvoice[]; payments: DepositPayment[] }
  | { kind: 'error' };

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const isDeposit = (value: unknown): value is ApiDeposit => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && row.id.length > 0
    && typeof row.name === 'string'
    && isCount(row.amount_cents)
    && typeof row.occurred_on === 'string';
};

/** 404 is the preview gate; anything else that is not a row list is an error. */
export function depositPlan(status: number, body: unknown): DepositPlan {
  if (status === 404) return { kind: 'none' };
  if (status >= 200 && status < 300) {
    const payload = body as { deposits?: unknown; invoices?: unknown; payments?: unknown } | null;
    if (Array.isArray(payload?.deposits)) {
      return {
        kind: 'rows',
        deposits: payload.deposits.filter(isDeposit),
        invoices: Array.isArray(payload.invoices) ? (payload.invoices as DepositInvoice[]) : [],
        payments: Array.isArray(payload.payments) ? (payload.payments as DepositPayment[]) : [],
      };
    }
  }
  return { kind: 'error' };
}

/** The POST body. No amount, no name: the server rebuilds those from the row. */
export function depositBody(
  depositId: string,
  action: DepositAction,
  extra: {
    invoice_id?: string;
    payment_id?: string;
    classification?: DepositClassification;
  } = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = { deposit_id: depositId, action };
  if (action === 'record' && extra.invoice_id) body.invoice_id = extra.invoice_id;
  if (action === 'already' && extra.payment_id) body.payment_id = extra.payment_id;
  if (action === 'classified' && extra.classification) body.classification = extra.classification;
  return body;
}

/**
 * What the card offers: exactly two stacked buttons, never three (CHANGES.md
 * · item 3 and B). Save applies whichever path is chosen; 'record' here means
 * "submit the chosen path", not "write a new payment" — depositSubmit() maps
 * the path to the real action, and the invoice path is not offered at all for
 * a STRIPE descriptor.
 *
 *   removed      nothing: the ledger is never reversed from here.
 *   every other  Save + Don't add.
 */
export function depositActions(
  deposit: Pick<ApiDeposit, 'removed' | 'payout'>,
): DepositAction[] {
  if (deposit.removed) return [];
  return ['record', 'ignored'];
}

/** The three ways a deposit becomes money the owner can point at. */
export type DepositPath = 'existing' | 'invoice' | 'other';

/** Which paths the card offers, in reading order. */
export function depositPaths(
  deposit: Pick<ApiDeposit, 'removed' | 'payout'>,
): DepositPath[] {
  if (deposit.removed) return [];
  // A STRIPE descriptor never gets "A new payment": the lump is made of card
  // payments already in the ledger, so a second row would count them twice.
  return deposit.payout === 'ambiguous'
    ? ['existing', 'other']
    : ['existing', 'invoice', 'other'];
}

export type DepositChoice = {
  path: DepositPath;
  invoice_id?: string;
  payment_id?: string;
  classification?: DepositClassification;
};

/**
 * The POST one Save makes, or null when the chosen path is not complete (no
 * payment picked, no invoice, no classification). Pure, so the mapping from a
 * card choice to a route action is testable and cannot drift.
 */
export function depositSubmit(
  deposit: Pick<ApiDeposit, 'removed' | 'payout'>,
  choice: DepositChoice,
): { action: DepositAction; extra: { invoice_id?: string; payment_id?: string; classification?: DepositClassification } } | null {
  if (!depositPaths(deposit).includes(choice.path)) return null;
  if (choice.path === 'existing') {
    return choice.payment_id ? { action: 'already', extra: { payment_id: choice.payment_id } } : null;
  }
  if (choice.path === 'invoice') {
    return choice.invoice_id ? { action: 'record', extra: { invoice_id: choice.invoice_id } } : null;
  }
  return choice.classification ? { action: 'classified', extra: { classification: choice.classification } } : null;
}

/** Put an Ignored deposit back in To review: drop the 'ignored' link only. */
export const depositRestoreBody = (depositId: string): Record<string, unknown> =>
  ({ deposit_id: depositId, action: 'restore' });

/** The short note above the buttons, or null. */
export function depositNote(deposit: Pick<ApiDeposit, 'removed' | 'payout'>): string | null {
  if (deposit.removed) return 'Your bank removed this deposit. Nothing in your payments was changed.';
  return payoutNote(deposit.payout ?? 'not_stripe');
}

/** "Matches INV-0042" when a signal fired; the amount and date when none did. */
export function depositSubline(deposit: ApiDeposit): string {
  const money = formatMoney(deposit.amount_cents / 100);
  const when = formatDay(deposit.occurred_on);
  const number = deposit.suggestion?.invoice_number;
  if (deposit.suggestion && Number.isInteger(number) && (number ?? 0) > 0) {
    return `${money} · ${when} · Looks like INV-${String(number).padStart(4, '0')}`;
  }
  return `${money} · ${when} · No invoice matches yet`;
}

export const DEPOSIT_FAILED_TOAST = 'That didn’t save. Try again.';
export const DEPOSIT_PAYOUT_TOAST = 'That might be a Stripe payout, so it is not new income.';
export const DEPOSIT_REMOVED_TOAST = 'Your bank removed that deposit. Nothing was changed.';
export const DEPOSIT_TAKEN_TOAST = 'That payment is already matched to another deposit.';
export const DEPOSIT_DECIDED_TOAST = 'That deposit already has a decision.';

/** One message per refusal code, so the copy cannot drift from the route. */
export function depositRefusalMessage(code: string | null | undefined): string {
  switch (code) {
    case 'payout_not_income':
      return DEPOSIT_PAYOUT_TOAST;
    case 'bad_state':
      return DEPOSIT_REMOVED_TOAST;
    case 'payment_taken':
      return DEPOSIT_TAKEN_TOAST;
    case 'deposit_already_decided':
      return DEPOSIT_DECIDED_TOAST;
    case 'over_limit':
      return 'That is more than the deposit, or more than the invoice still owes.';
    case 'deposit_link_refused':
      return 'That deposit is already matched.';
    default:
      return DEPOSIT_FAILED_TOAST;
  }
}

/** The confirmation after the route ok, before the card is removed. */
export function depositDoneToast(
  action: DepositAction,
  classification?: string | null,
): string {
  if (action === 'ignored') return 'Ignored. It stays out of your totals.';
  if (action === 'already') return 'Linked to the payment already on record.';
  if (action === 'classified') {
    return countsAsIncome(classification)
      ? 'Added to your income.'
      : 'Recorded. It counts in no total.';
  }
  return 'Payment recorded.';
}
