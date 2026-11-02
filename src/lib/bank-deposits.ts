// ═══ Money in on the client ═══
// The deposit review card reads one preview-only route and posts one decision.
// Everything here is pure so the rules are testable without a browser; the URL
// literal lives in this file, which bank-tracking.test.ts scans, so no bank
// component can call an unlisted endpoint.
import { formatDay, formatMoney } from './bank-tracking';
import { STRIPE_PAYOUT_NOTE } from './plaid/payouts';

export const DEPOSITS_URL = '/api/plaid/deposits';

export type DepositKind = 'recorded' | 'linked' | 'not_income' | 'stripe_payout';
export type DepositAction = 'record' | 'already' | 'not_income';

export type ApiDeposit = {
  id: string;
  name: string;
  merchant: string | null;
  amount_cents: number;
  occurred_on: string;
  pending: boolean;
  removed: boolean;
  is_stripe_payout: boolean;
  link: { kind: DepositKind; payment_id: string | null } | null;
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
  extra: { invoice_id?: string; payment_id?: string } = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = { deposit_id: depositId, action };
  if (action === 'record' && extra.invoice_id) body.invoice_id = extra.invoice_id;
  if (action === 'already' && extra.payment_id) body.payment_id = extra.payment_id;
  return body;
}

/**
 * What the card offers. A Stripe payout offers ONE action (Not income, stored
 * as stripe_payout). A deposit the bank removed offers none: the ledger is
 * never reversed from here, so there is nothing to decide.
 */
export function depositActions(deposit: Pick<ApiDeposit, 'is_stripe_payout' | 'removed'>): DepositAction[] {
  if (deposit.removed) return [];
  if (deposit.is_stripe_payout) return ['not_income'];
  return ['record', 'already', 'not_income'];
}

/** The short note above the buttons, or null. */
export function depositNote(deposit: Pick<ApiDeposit, 'is_stripe_payout' | 'removed'>): string | null {
  if (deposit.is_stripe_payout) return STRIPE_PAYOUT_NOTE;
  if (deposit.removed) return 'Your bank removed this deposit. Nothing in your payments was changed.';
  return null;
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
export const DEPOSIT_PAYOUT_TOAST = 'That is a Stripe payout, so it is not new income.';
export const DEPOSIT_REMOVED_TOAST = 'Your bank removed that deposit. Nothing was changed.';
export const DEPOSIT_TAKEN_TOAST = 'That payment is already matched to another deposit.';

/** One message per refusal code, so the copy cannot drift from the route. */
export function depositRefusalMessage(code: string | null | undefined): string {
  switch (code) {
    case 'payout_not_income':
      return DEPOSIT_PAYOUT_TOAST;
    case 'bad_state':
      return DEPOSIT_REMOVED_TOAST;
    case 'payment_taken':
      return DEPOSIT_TAKEN_TOAST;
    case 'over_limit':
      return 'That is more than the deposit, or more than the invoice still owes.';
    case 'deposit_link_refused':
      return 'That deposit is already matched.';
    default:
      return DEPOSIT_FAILED_TOAST;
  }
}

/** The confirmation after the route ok, before the card is removed. */
export function depositDoneToast(action: DepositAction): string {
  if (action === 'not_income') return 'Marked as not income.';
  if (action === 'already') return 'Linked to the payment already on record.';
  return 'Payment recorded.';
}
