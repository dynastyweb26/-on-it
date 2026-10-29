// ═══ One ledger row per payment submission ═══
// Record payment writes a row into invoice_payments, and a DB trigger adds it
// to invoices.amount_paid. Two taps, a second tab, or a request retried after
// a lost response would each add the money again — the button guard alone
// cannot close that window, because the duplicate can arrive from the network.
//
// So the client mints ONE key per submission (at the tap) and reuses it for
// every retry of that submission. The pair (user_id, idempotency_key) is
// unique in the database (partial index, key not null), the insert ignores a
// repeat, and we read the row back by key: a repeat returns the ORIGINAL
// result instead of writing a second one.
//
// Pure and dependency-free so the sequence can be tested without a database.
// The applied migration lives in
// supabase/migrations/20261029120000_invoice_payments_idempotency_key.sql.

/** The columns record payment writes. `id` and the trigger are the database's. */
export interface PaymentRowInput {
  invoice_id: string;
  user_id: string;
  amount: number;
  method: string;
  paid_at: string;
  idempotency_key: string;
}

export type PaymentLedgerRow = PaymentRowInput & { id: string };

/** The two database operations, injected so the sequence stays testable. */
export interface PaymentLedgerIO {
  /**
   * Insert unless (user_id, idempotency_key) already exists. A repeat must be a
   * no-op that reports no error (PostgREST `resolution=ignore-duplicates`).
   */
  insertOnce: (row: PaymentRowInput) => Promise<{ error: unknown }>;
  /** Read the row for this key — the original, whether we just wrote it or not. */
  findByKey: (userId: string, key: string) => Promise<PaymentLedgerRow | null>;
}

/**
 * A key for one submission: stable for retries, unique across submissions.
 * `uuid` is injectable so tests can pin the value.
 */
export function newPaymentKey(invoiceId: string, uuid?: string): string {
  const id = uuid ?? (
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
  return `pay-${invoiceId}-${id}`;
}

export interface RecordPaymentResult {
  ok: boolean;
  /** The row in the ledger for this key; the original on a repeat. */
  payment: PaymentLedgerRow | null;
  error?: unknown;
}

/**
 * Write the payment once, then return the row that key owns.
 *
 * A repeat never inserts: the database ignores it, and the read-back returns
 * the first row — so the caller shows the same result, not a second payment.
 * An error is only fatal when no row exists for the key (a real failure, not a
 * repeat whose response was lost).
 */
export async function recordPaymentOnce(
  io: PaymentLedgerIO,
  row: PaymentRowInput,
): Promise<RecordPaymentResult> {
  const { error } = await io.insertOnce(row);
  if (error) {
    // The insert may have landed and only the response been lost: the key
    // decides. A row for this key means the money is recorded exactly once.
    const existing = await io.findByKey(row.user_id, row.idempotency_key);
    if (existing) return { ok: true, payment: existing };
    return { ok: false, payment: null, error };
  }
  const saved = await io.findByKey(row.user_id, row.idempotency_key);
  if (!saved) {
    return { ok: false, payment: null, error: new Error('payment row missing after insert') };
  }
  return { ok: true, payment: saved };
}
