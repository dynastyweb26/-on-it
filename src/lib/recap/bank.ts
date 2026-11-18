// ═══ The recap's two bank slides: what the bank did, and what still waits ═══
// Data for the redesign's 'bank' and 'waiting' slides only — the slide UI is
// Claude Code's, from design/recaps/RecapPlayer.dc.html (07 and 08). Pure: rows
// in, payload fields out, no Supabase, no server-only import.
//
// Server-composed, RLS only: the route that calls this reads every row through
// the viewer's own session client, so the owner-only policies are the boundary
// and the service role is never used. The plan + connection gate lives here
// too, so a viewer the slides are not for gets NO fields (absent, not zeros).
//
// Sources, the same ones the bank screens already read:
//   money in   bank_deposits      (positive; a row the bank removed is out)
//   money out  bank_transactions  (positive; a row the bank removed is out)
//   waiting    bank_transactions still open — the pinned "Unaccounted for"
//              row's rule, reused from lib/plaid/transactions-view, so the
//              slide and the row can never disagree
import { isOpenBankRow } from '@/lib/plaid/transactions-view';
import { roundCurrency } from '@/lib/financials';
import type { RecapBankMoney, RecapPayload } from './payload';
import type { RecapPeriod } from './dates';

/** A money-in deposit, stored as the bank's absolute value. */
export type RecapBankDepositRow = {
  amount: number | string;
  occurred_on: string;
  removed_at?: string | null;
};

/** A money-out charge, with the two states the open rule reads. */
export type RecapBankTxnRow = {
  amount: number | string;
  occurred_on: string;
  bank_state: string;
  review_state: string;
  removed_at?: string | null;
};

/** The payload fields this module composes; absent = "not for this viewer". */
export type RecapBankFields = Pick<RecapPayload, 'bank' | 'waiting'>;

const toCents = (value: number | string): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Row count and money total, summed in cents so a float never decides a cent. */
export function countAndTotal(rows: readonly { amount: number | string }[]): RecapBankMoney {
  let cents = 0;
  for (const row of rows) cents += toCents(row.amount);
  return { count: rows.length, total: roundCurrency(cents / 100) };
}

const inPeriod = (period: Pick<RecapPeriod, 'start' | 'end'>, day: string) =>
  day >= period.start && day <= period.end;

/** Money the bank picked up inside the period, each direction on its own. */
export function bankActivity(input: {
  period: Pick<RecapPeriod, 'start' | 'end'>;
  deposits: readonly RecapBankDepositRow[];
  transactions: readonly RecapBankTxnRow[];
}): { in: RecapBankMoney; out: RecapBankMoney } {
  return {
    in: countAndTotal(input.deposits.filter(
      (r) => !r.removed_at && inPeriod(input.period, r.occurred_on),
    )),
    out: countAndTotal(input.transactions.filter(
      (r) => !r.removed_at && r.bank_state !== 'removed' && inPeriod(input.period, r.occurred_on),
    )),
  };
}

/** Still unaccounted for as of now, in any period: the pinned row's own set. */
export const waitingFor = (transactions: readonly RecapBankTxnRow[]): RecapBankMoney =>
  countAndTotal(transactions.filter((r) => isOpenBankRow(r)));

export type RecapBankInput = {
  /** entitlementsFor(tier, plan).canBank — Plus, and a founder. */
  canBank: boolean;
  /** At least one linked bank login that is not removed. */
  connected: boolean;
  period: Pick<RecapPeriod, 'start' | 'end'>;
  /** Deposits that may belong to the period. */
  deposits: readonly RecapBankDepositRow[];
  /** Charges that may belong to the period. */
  transactions: readonly RecapBankTxnRow[];
  /** Charges still open, any period (the waiting slide). */
  open: readonly RecapBankTxnRow[];
};

/** The two fields, or none: only a viewer whose plan includes bank activity,
 *  with a connected bank, gets them. */
export function recapBankFields(input: RecapBankInput): RecapBankFields {
  if (!input.canBank || !input.connected) return {};
  return {
    bank: bankActivity(input),
    waiting: waitingFor(input.open),
  };
}

/** Validate a route response before it joins the payload: a number the slides
 *  print must be a count or a money total — never NaN, a string or negative.
 *  Anything malformed is dropped, so a bad response cannot print a wrong figure. */
export function bankFieldsFromJson(body: unknown): RecapBankFields {
  const money = (value: unknown): RecapBankMoney | null => {
    if (!value || typeof value !== 'object') return null;
    const { count, total } = value as Record<string, unknown>;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return null;
    if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) return null;
    return { count, total: roundCurrency(total) };
  };
  const root = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const region = (root.bank && typeof root.bank === 'object' ? root.bank : null) as Record<string, unknown> | null;
  const inMoney = region ? money(region.in) : null;
  const outMoney = region ? money(region.out) : null;
  const waiting = money(root.waiting);
  return {
    ...(inMoney && outMoney ? { bank: { in: inMoney, out: outMoney } } : {}),
    ...(waiting ? { waiting } : {}),
  };
}
