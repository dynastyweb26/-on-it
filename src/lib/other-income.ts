// ═══ Other money received — the classification, once ═══
// Every non-invoice credit the owner sees is one of six things. Two of them are
// income and count in Collected; four are not income and count nowhere.
//
// The vocabulary lives here so the deposit route, the card and the books read
// paths cannot drift apart, and so "which of these counts" has exactly one
// answer in code.
//
// Where each one is stored:
//   customer_payment, other_income      → public.other_income (a real income row)
//   vendor_refund, transfer,
//   loan_or_owner, unknown              → bank_deposit_links.kind = 'classified'
//                                         with this classification
// Nothing in the second group reaches a total: it is recorded, not counted.
// 'unknown' is the owner saying "I do not know yet" — it still counts nowhere.

/** The two classifications that count in Collected. */
export type IncomeClassification = 'customer_payment' | 'other_income';

/** Recorded, classified, counted in no total. */
export type NonIncomeClassification =
  | 'vendor_refund'
  | 'transfer'
  | 'loan_or_owner'
  | 'unknown';

export type DepositClassification = IncomeClassification | NonIncomeClassification;

export type ClassificationOption = {
  value: DepositClassification;
  label: string;
  /** True only for the two that reach Collected. */
  counts: boolean;
};

/**
 * The list, in the order the owner reads it. "Customer payment" first because
 * it is the common case; "Unknown" last because it is the honest one.
 */
export const OTHER_MONEY_RECEIVED: readonly ClassificationOption[] = [
  { value: 'customer_payment', label: 'Customer payment', counts: true },
  { value: 'vendor_refund', label: 'Vendor refund', counts: false },
  { value: 'transfer', label: 'Transfer', counts: false },
  { value: 'loan_or_owner', label: 'Loan or owner money', counts: false },
  { value: 'other_income', label: 'Other income', counts: true },
  { value: 'unknown', label: 'Unknown', counts: false },
];

const BY_VALUE = new Map(OTHER_MONEY_RECEIVED.map((option) => [option.value, option]));

/** True for a value this module accepts at all. */
export function isClassification(value: unknown): value is DepositClassification {
  return typeof value === 'string' && BY_VALUE.has(value as DepositClassification);
}

/**
 * Does this classification count in Collected?
 * An unrecognised value is never income — fail closed, so a typo cannot inflate
 * the owner's income.
 */
export function countsAsIncome(value: string | null | undefined): boolean {
  return isClassification(value) && BY_VALUE.get(value)!.counts;
}

/** The stored label, or the raw value when it is not one of ours. */
export function classificationLabel(value: string | null | undefined): string {
  return (isClassification(value) && BY_VALUE.get(value)!.label) || 'Other money received';
}

/**
 * The line under a chip: what picking it does to the owner's totals.
 * Three possible answers, because there are three outcomes: the two income
 * kinds count, three non-income kinds are recorded and count nowhere, and
 * "Unknown" is the honest one that stays outside every total until decided.
 */
export function classificationNote(value: string | null | undefined): string {
  if (value === 'unknown') return 'Stays unaccounted, outside every total';
  return countsAsIncome(value) ? 'Counts in Collected' : 'Not counted as income';
}

/** The two that go to public.other_income, narrowed for the route. */
export function incomeClassification(
  value: string | null | undefined,
): IncomeClassification | null {
  return value === 'customer_payment' || value === 'other_income' ? value : null;
}

// ── The other_income table ────────────────────────────────────────────────

/** A row as Collected reads it: amount is a numeric string from Postgres. */
export type OtherIncomeRow = {
  amount: string | number | null;
  classification?: string | null;
  deleted_at?: string | null;
};

/** Columns every Collected reader selects. Keep them in one place. */
export const OTHER_INCOME_COLUMNS = 'amount, received_on, classification, deleted_at';

/**
 * The Collected contribution of a set of other_income rows.
 *
 * Soft-deleted rows never count, and a row whose classification is not one of
 * the two income values never counts either. The table's own CHECK already
 * restricts the column to those two, so the second guard is belt and braces:
 * a bad value must not add money, whichever layer let it through.
 */
export function sumOtherIncome(rows: readonly OtherIncomeRow[] | null | undefined): number {
  let total = 0;
  for (const row of rows ?? []) {
    if (row.deleted_at) continue;
    if (row.classification != null && !countsAsIncome(row.classification)) continue;
    const amount = Number(row.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
  }
  // Cents, not floats: the ledger sums are decimal strings of 2 places, and a
  // float tail here would make Collected read $1,204.9999999.
  return Math.round(total * 100) / 100;
}

/** The longest title the table accepts; a deposit's name is longer. */
export const OTHER_INCOME_TITLE_MAX = 200;

/**
 * The other_income row a deposit becomes when the owner classifies it as income.
 * The amount is the deposit's own; the date is the day the money landed.
 */
export function otherIncomeFromDeposit(input: {
  userId: string;
  depositId: string;
  amount: string | number;
  title: string;
  receivedOn: string;
  classification: IncomeClassification;
}) {
  return {
    user_id: input.userId,
    amount: input.amount,
    title: input.title.trim().slice(0, OTHER_INCOME_TITLE_MAX) || 'Bank deposit',
    client_name: null,
    received_on: input.receivedOn,
    note: null,
    deposit_id: input.depositId,
    classification: input.classification,
  };
}
