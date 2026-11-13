// ═══ Books totals — the one money calculation ═══
//
// The Books tab and any report must not each own a version of "what did I
// make". This module is the single pure calculation:
//
//   collected   = invoice_payments ledger (refunds and disputes are negative
//                 rows, so they net out) + other_income that counts as income
//   spent       = non-deleted expenses
//   net         = collected − spent
//   outstanding = the unpaid remainder of sent/overdue invoices, as of now
//
// Callers still do the reading (and therefore the RLS scoping); this module
// only adds up rows it is handed. It repeats the Books exclusions defensively:
// soft-deleted rows never count, drafts/void/estimates never count as owed, and
// an other_income classification that is not income never counts.
import { roundCurrency } from '@/lib/financials';
import { sumOtherIncome, type OtherIncomeRow } from '@/lib/other-income';

export type BooksPaymentRow = {
  /** A ledger row. Refunds and disputes are negative, as Books counts them. */
  amount: number | string | null;
};

export type BooksExpenseRow = {
  amount: number | string | null;
  deleted_at?: string | null;
};

export type BooksInvoiceRow = {
  total: number | string | null;
  amount_paid?: number | string | null;
  status: string;
  kind?: string | null;
  deleted_at?: string | null;
};

export type BooksTotals = {
  collected: number;
  spent: number;
  net: number;
  outstanding: number;
};

function amountOf(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * The Books figures for a set of already owner-scoped rows. Soft-deleted rows
 * are skipped here too, so a caller that forgot the `.is('deleted_at', null)`
 * filter still cannot inflate a total.
 */
export function booksTotals(input: {
  payments: readonly BooksPaymentRow[];
  otherIncome?: readonly OtherIncomeRow[] | null;
  expenses: readonly BooksExpenseRow[];
  invoices: readonly BooksInvoiceRow[];
}): BooksTotals {
  const collected = roundCurrency(
    input.payments.reduce((sum, row) => sum + amountOf(row.amount), 0)
      + sumOtherIncome(input.otherIncome),
  );

  const spent = roundCurrency(
    input.expenses
      .filter((row) => !row.deleted_at)
      .reduce((sum, row) => sum + amountOf(row.amount), 0),
  );

  const outstanding = roundCurrency(
    input.invoices
      .filter((row) => !row.deleted_at)
      .filter((row) => (row.kind ?? 'invoice') === 'invoice')
      .filter((row) => row.status === 'sent' || row.status === 'overdue')
      .reduce(
        (sum, row) => sum + Math.max(0, amountOf(row.total) - amountOf(row.amount_paid)),
        0,
      ),
  );

  return { collected, spent, net: roundCurrency(collected - spent), outstanding };
}
