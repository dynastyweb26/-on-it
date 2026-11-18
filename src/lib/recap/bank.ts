// ═══ The recap's two bank slides (07 bank activity, 08 waiting), as data ═══
// The field list is RULE 4 — the design's data-f attributes, nothing more:
//   activity_total        total     payments + expenses recorded this period
//   bank_auto_count       auto      of those, records a bank row produced
//   bank_auto_in_count    autoIn    of those payments / other income
//   bank_auto_out_count   autoOut   of those expenses
//   bank name             name      the connected institution with most activity
//   bank_pending_count    pending   still unaccounted for (money in and out)
//   pending_txn_name/date items     the newest few, for slide 08's list
//   "+N more"             more      the rest of the pending rows
// The design prints no money, so neither does this: counts only.
//
// Pure: rows in, payload fields out, no Supabase, no server-only import. The
// route that calls it reads every row through the viewer's own session client,
// so RLS is the boundary and the service role is never used. The plan +
// connection gate also lives here: a viewer the slides are not for gets NO
// fields (absent, not zeros).
//
// Sources, the same ones the bank screens read:
//   money in   bank_deposits + bank_deposit_links + other_income.deposit_id
//   money out  bank_transactions (review_state added / already)
//   pending    open bank_transactions (the pinned row's rule) + undecided
//              bank_deposits, newest first
import { isOpenBankRow } from '@/lib/plaid/transactions-view';
import { holdsExpense, type ReviewState } from '@/lib/bank-ledger';
import { NAME_MAX, type RecapBank, type RecapBankPendingItem, type RecapPayload } from './payload';
import type { RecapPeriod } from './dates';

/** Slide 08 shows three rows; the rest is the "+N more" pill. */
export const PENDING_MAX = 3;

/** A money-in deposit, with the fields the two slides read. */
export type RecapBankDepositRow = {
  id: string;
  item_id?: string | null;
  name: string | null;
  merchant_name: string | null;
  occurred_on: string;
  removed_at?: string | null;
};

/** A money-out charge, with the two states the open/accounted rules read. */
export type RecapBankTxnRow = {
  id: string;
  item_id?: string | null;
  merchant: string | null;
  description: string;
  occurred_on: string;
  bank_state: string;
  review_state: string;
  removed_at?: string | null;
};

/** A linked bank login: the slide names one institution. */
export type RecapBankItemRow = { id: string; institution_name: string | null };

/** A decision row on a deposit (bank_deposit_links.kind). */
export type RecapBankDepositLinkRow = { deposit_id: string; kind: string };

/** The payload fields this module composes; absent = "not for this viewer". */
export type RecapBankFields = Pick<RecapPayload, 'bank'>;

/** Deposit links that put money in the ledger: a new payment, or an existing
 *  one. Ignored, a non-income classification and a Stripe payout did not. */
const INCOME_LINKS: ReadonlySet<string> = new Set(['recorded', 'linked']);

const cleanName = (value: string | null | undefined): string =>
  String(value ?? '').trim().slice(0, NAME_MAX);

/** The first non-blank name: a merchant, else what the bank printed. */
function nameOf(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const name = cleanName(candidate);
    if (name) return name;
  }
  return '';
}

/** The connected institution with the most bank rows in the period; ties are
 *  settled by name, then id, so the same period always names the same bank. */
export function busiestBankName(
  items: readonly RecapBankItemRow[],
  periodDeposits: readonly RecapBankDepositRow[],
  periodTransactions: readonly RecapBankTxnRow[],
): string {
  const counts = new Map<string, number>();
  for (const row of [...periodDeposits, ...periodTransactions]) {
    if (!row.item_id) continue;
    counts.set(row.item_id, (counts.get(row.item_id) ?? 0) + 1);
  }
  let best: { id: string; name: string; count: number } | null = null;
  for (const item of items) {
    const count = counts.get(item.id) ?? 0;
    const name = cleanName(item.institution_name) || 'Bank account';
    if (!best || count > best.count
      || (count === best.count && name.localeCompare(best.name) < 0)
      || (count === best.count && name === best.name && item.id.localeCompare(best.id) < 0)) {
      best = { id: item.id, name, count };
    }
  }
  return best?.name ?? 'Bank account';
}

/** Still unaccounted for, money in and out, newest first. A charge follows the
 *  pinned "Unaccounted for" rule; a deposit is waiting until the owner decides
 *  it (no link, no other_income row) and the bank has not removed it. */
export function pendingBankRows(input: {
  openDeposits: readonly RecapBankDepositRow[];
  openTransactions: readonly RecapBankTxnRow[];
  decidedDepositIds: ReadonlySet<string>;
}): RecapBankPendingItem[] {
  const rows: { id: string; name: string; date: string }[] = [];
  for (const row of input.openTransactions) {
    if (!isOpenBankRow(row)) continue;
    rows.push({ id: row.id, name: nameOf(row.merchant, row.description), date: row.occurred_on });
  }
  for (const row of input.openDeposits) {
    if (row.removed_at || input.decidedDepositIds.has(row.id)) continue;
    rows.push({ id: row.id, name: nameOf(row.merchant_name, row.name), date: row.occurred_on });
  }
  return rows
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map(({ name, date }) => ({ name, date }));
}

export type RecapBankInput = {
  /** entitlementsFor(tier, plan).canBank — Plus, and a founder. */
  canBank: boolean;
  /** At least one linked bank login that is not removed. */
  connected: boolean;
  period: Pick<RecapPeriod, 'start' | 'end'>;
  /** The stored payload's own counts for the period: collected payments (all
   *  sources) and recorded expenses. The story's numbers, not a recount. */
  recordedIn: number;
  recordedOut: number;
  items: readonly RecapBankItemRow[];
  /** Deposits and charges that may belong to the period. */
  periodDeposits: readonly RecapBankDepositRow[];
  periodTransactions: readonly RecapBankTxnRow[];
  /** Deposits and charges still open, any period (slide 08). */
  openDeposits: readonly RecapBankDepositRow[];
  openTransactions: readonly RecapBankTxnRow[];
  /** Every decision row on the owner's deposits (any period). */
  depositLinks: readonly RecapBankDepositLinkRow[];
  /** Deposits that became other income (an other_income row, not deleted). */
  incomeDepositIds: readonly string[];
};

const countOf = (value: number): number => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The two fields, or none: only a viewer whose plan includes bank activity,
 *  with a connected bank, gets them. */
export function recapBankFields(input: RecapBankInput): RecapBankFields {
  if (!input.canBank || !input.connected) return {};

  const inPeriod = (day: string) => day >= input.period.start && day <= input.period.end;
  const periodDeposits = input.periodDeposits.filter(
    (row) => !row.removed_at && inPeriod(row.occurred_on),
  );
  const periodTransactions = input.periodTransactions.filter(
    (row) => !row.removed_at && row.bank_state !== 'removed' && inPeriod(row.occurred_on),
  );

  // A deposit produced a record only if it became a payment or other income.
  const kindsByDeposit = new Map<string, Set<string>>();
  for (const link of input.depositLinks) {
    const kinds = kindsByDeposit.get(link.deposit_id) ?? new Set<string>();
    kinds.add(link.kind);
    kindsByDeposit.set(link.deposit_id, kinds);
  }
  const incomeDepositIds = new Set(input.incomeDepositIds);
  const becameRecord = (id: string) => incomeDepositIds.has(id)
    || [...(kindsByDeposit.get(id) ?? [])].some((kind) => INCOME_LINKS.has(kind));

  const recordedIn = countOf(input.recordedIn);
  const recordedOut = countOf(input.recordedOut);
  // "Of these": a bank-sourced record can never outnumber the records it is a
  // subset of, so each side is clamped to its own total.
  const autoIn = Math.min(recordedIn, periodDeposits.filter((row) => becameRecord(row.id)).length);
  const autoOut = Math.min(
    recordedOut,
    periodTransactions.filter((row) => holdsExpense(row.review_state as ReviewState)).length,
  );

  const decidedDepositIds = new Set<string>([
    ...incomeDepositIds,
    ...kindsByDeposit.keys(),
  ]);
  const pending = pendingBankRows({
    openDeposits: input.openDeposits,
    openTransactions: input.openTransactions,
    decidedDepositIds,
  });
  const items = pending.slice(0, PENDING_MAX);

  const bank: RecapBank = {
    total: recordedIn + recordedOut,
    auto: autoIn + autoOut,
    autoIn,
    autoOut,
    name: busiestBankName(input.items, periodDeposits, periodTransactions),
    pending: pending.length,
    items,
    more: pending.length - items.length,
  };
  return { bank };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a route response before it joins the payload: every number the
 *  slides print must be a count, never NaN, a string or negative; every pending
 *  row must have a name and a yyyy-mm-dd date. Anything malformed drops the
 *  field, so a bad response cannot print a wrong figure. `more` is derived here
 *  from what arrived, never trusted as sent. */
export function bankFieldsFromJson(body: unknown): RecapBankFields {
  const root = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!root.bank || typeof root.bank !== 'object') return {};
  const raw = root.bank as Record<string, unknown>;

  const count = (value: unknown): number | null =>
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null);

  const total = count(raw.total);
  const auto = count(raw.auto);
  const autoIn = count(raw.autoIn);
  const autoOut = count(raw.autoOut);
  const pending = count(raw.pending);
  const name = typeof raw.name === 'string' ? cleanName(raw.name) : '';
  if (total === null || auto === null || autoIn === null || autoOut === null
    || pending === null || !name) return {};

  const items: RecapBankPendingItem[] = [];
  if (Array.isArray(raw.items)) {
    for (const entry of raw.items) {
      if (items.length === PENDING_MAX) break;
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      const label = typeof item.name === 'string' ? cleanName(item.name) : '';
      const date = typeof item.date === 'string' && DAY_RE.test(item.date) ? item.date : '';
      if (label && date) items.push({ name: label, date });
    }
  }
  // The slide's own invariants: neither count can exceed what it counts.
  if (auto > total || items.length > pending) return {};

  return {
    bank: { total, auto, autoIn, autoOut, name, pending, items, more: pending - items.length },
  };
}
