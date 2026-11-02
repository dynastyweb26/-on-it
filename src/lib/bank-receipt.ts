'use client';
// ═══ The one storage write the bank card makes ═══
//
// Deliberately NOT in components/bank or in the three lib files that
// bank-tracking.test.ts scans: that guard forbids a bank screen from importing
// the Supabase client, and it must stay that way. The card hands this module a
// prepared blob and gets a verdict back.
//
// The object key is `${user_id}/${sha256}.jpg` — the same shape Chat writes
// (ChatView saveExpense) and the only shape the private 'receipts' bucket's
// owner policy admits (foldername[1] = auth.uid()). It is also exactly what
// /api/plaid/review rebuilds server-side from the session, so the client and the
// server agree on the key without the path ever travelling in a request.
//
// Upload happens at "Add to record", never at tap: a card the owner passes on or
// closes stores nothing.
import type { BankReceipt } from './bank-tracking';

export const RECEIPT_BUCKET = 'receipts';

/** `${user_id}/${hash}.jpg`. Pure, so the shape is asserted in tests. */
export function receiptStoragePath(userId: string, hash: string): string {
  return `${userId}/${hash}.jpg`;
}

export type ReceiptUpload =
  /** This attempt stored the object. */
  | 'uploaded'
  /** It was already there (same photo, same key) — never remove it later. */
  | 'exists'
  | 'failed'
  /** No session: the route will refuse anyway. */
  | 'unsigned';

/**
 * Store one prepared receipt. `upsert: false` matches Chat: the bucket has no
 * UPDATE policy, and a re-upload of an identical key means the file is already
 * there, which is not an error.
 *
 * The Supabase client is imported lazily so this module can be imported by a
 * test (and by the provider) without pulling a runtime client in.
 */
export async function uploadBankReceipt(receipt: BankReceipt): Promise<ReceiptUpload> {
  const { createClient } = await import('@/lib/supabase/client');
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return 'unsigned';

  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(receiptStoragePath(userId, receipt.hash), receipt.blob, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (!error) return 'uploaded';
  // The bucket has no UPDATE policy, so "exists" is the already-stored answer.
  if (/exists/i.test(error.message)) return 'exists';
  return 'failed';
}

/** Remove the object THIS attempt uploaded, after the add was refused. Never
 *  called when the upload answered "exists" — that file may belong to another
 *  expense. Best effort: account deletion still empties the whole bucket. */
export async function removeBankReceipt(receipt: BankReceipt): Promise<void> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    await supabase.storage.from(RECEIPT_BUCKET).remove([receiptStoragePath(userId, receipt.hash)]);
  } catch { /* best effort */ }
}
