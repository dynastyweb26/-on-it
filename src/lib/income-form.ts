// ═══ Income form → row ═══
// One other_income row is written by the owner by hand: an amount, a title, a
// date, and optionally a client and a note. Validation lives here so the route
// and the form agree on what is acceptable, and so the caps the database
// enforces are checked before a request is made.
//
// The classification is not the owner's to choose here: a hand-written row is
// "Other income" by definition, which is one of the two that count in
// Collected. A row that came from a bank deposit keeps the classification the
// deposit card gave it.
import { OTHER_INCOME_TITLE_MAX } from './other-income';

export const INCOME_NOTE_MAX = 1000;
export const INCOME_CLIENT_MAX = 200;
/** The database refuses anything else; a hand-typed amount must be positive. */
export const INCOME_AMOUNT_MAX = 9_999_999.99;

export type IncomeInput = {
  amount: number;
  title: string;
  client_name: string | null;
  received_on: string;
  note: string | null;
};

export type IncomeInputResult =
  | { ok: true; value: IncomeInput }
  | { ok: false; code: IncomeErrorCode };

export type IncomeErrorCode =
  | 'amount_invalid'
  | 'title_missing'
  | 'title_too_long'
  | 'client_too_long'
  | 'note_too_long'
  | 'date_invalid';

/** yyyy-mm-dd and a real calendar day (2026-02-30 is not). */
export function isIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Validate a create or an edit. Fields omitted on an edit are not defaulted
 * here — the caller merges the existing row first — so this always sees the
 * complete intended state.
 */
export function parseIncomeInput(body: unknown): IncomeInputResult {
  const row = (body ?? {}) as Record<string, unknown>;
  const amount = typeof row.amount === 'number' ? row.amount : Number(clean(row.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > INCOME_AMOUNT_MAX) {
    return { ok: false, code: 'amount_invalid' };
  }
  // Cents, never a float tail: the column is numeric(12,2).
  const rounded = Math.round(amount * 100) / 100;
  const title = clean(row.title);
  if (!title) return { ok: false, code: 'title_missing' };
  if (title.length > OTHER_INCOME_TITLE_MAX) return { ok: false, code: 'title_too_long' };
  const client = clean(row.client_name);
  if (client.length > INCOME_CLIENT_MAX) return { ok: false, code: 'client_too_long' };
  const note = clean(row.note);
  if (note.length > INCOME_NOTE_MAX) return { ok: false, code: 'note_too_long' };
  const received = row.received_on;
  if (!isIsoDay(received)) return { ok: false, code: 'date_invalid' };
  return {
    ok: true,
    value: {
      amount: rounded,
      title,
      client_name: client || null,
      received_on: received,
      note: note || null,
    },
  };
}

/** The row an insert writes. `user_id` is the session user, never the body's. */
export function incomeInsertRow(userId: string, input: IncomeInput) {
  return {
    user_id: userId,
    amount: input.amount,
    title: input.title,
    client_name: input.client_name,
    received_on: input.received_on,
    note: input.note,
    deposit_id: null,
    classification: 'other_income',
  };
}

/** One sentence per refusal code, shown under the form. */
export function incomeError(code: string | null | undefined): string {
  switch (code) {
    case 'amount_invalid':
      return 'Enter an amount bigger than zero.';
    case 'title_missing':
      return 'Give this income a name.';
    case 'title_too_long':
      return 'That name is too long.';
    case 'client_too_long':
      return 'That client name is too long.';
    case 'note_too_long':
      return 'That note is too long.';
    case 'date_invalid':
      return 'Pick the day the money arrived.';
    default:
      return 'That didn’t save. Try again.';
  }
}

/** The date chips an income form offers: today, yesterday, and the row's own. */
export function incomeDateOptions(rowDate: string | null, today: string): string[] {
  const seen = new Set<string>();
  return [rowDate, today, shiftIso(today, -1)]
    .filter((value): value is string => Boolean(value) && isIsoDay(value))
    .filter((value) => (seen.has(value) ? false : (seen.add(value), true)));
}

/** Shift a yyyy-mm-dd by whole days, read as a local date. */
export function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('en-CA');
}

/**
 * A row that came from a bank deposit belongs to that deposit's decision.
 * Deleting it, or changing its amount, would leave the deposit looking decided
 * while the money it decided about is gone — and the deposit guards and unique
 * indexes still count the soft-deleted row, so nothing could put it back.
 * Those rows may still be re-titled or re-noted; the amount and the delete are
 * undone from Bank activity only.
 */
export function incomeWriteRefusal(
  row: { deposit_id?: string | null } | null | undefined,
  op: 'delete' | 'edit',
  patch?: { amount?: unknown; [key: string]: unknown },
): 'from_deposit' | null {
  if (!row?.deposit_id) return null;
  if (op === 'delete') return 'from_deposit';
  return patch && patch.amount !== undefined ? 'from_deposit' : null;
}
