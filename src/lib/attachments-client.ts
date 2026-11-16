'use client';
// ═══ Invoice-attachment storage + rows (client) ═══
// The browser half of the attachments feature: upload a compressed JPEG into the
// private 'invoice-attachments' bucket, keep the ordering rows in
// public.invoice_attachments, and hand the PDF its images.
//
// Objects live at ${user_id}/${invoice_id}/${uuid}.jpg so the bucket's
// owner-scoped policy (foldername(name)[1] = auth.uid()) admits them. Reads are
// short-lived signed URLs; the PDF fetches the bytes client-side and encodes a
// data URL, so there is no canvas-taint risk.
//
// The type-only import of createClient keeps this module free of a runtime
// framework dependency (a test can pass a fake).
import type { createClient } from '@/lib/supabase/client';
import type { EditorAttachment } from '@/components/AttachmentsEditor';
import { ATTACHMENT_MAX, type PdfAttachment } from '@/lib/pdf/attachment-pages';

export { ATTACHMENT_MAX };

type Db = ReturnType<typeof createClient>;

export const ATTACHMENT_BUCKET = 'invoice-attachments';

/** Thrown when a reorder would rewrite rows the server verified. */
export const ATTACHMENT_RENUMBER_VERIFIED = 'attachment-renumber-verified';

export interface AttachmentRow {
  id: string;
  storage_path: string;
  position: number;
  // Server verification (estimate attachments). Preserved on renumber so a
  // reorder never silently unpublishes a confirmed file.
  mime_type?: string | null;
  size_bytes?: number | null;
  checksum?: string | null;
}

/** Next free slot after the rows already stored (0 when the invoice has none). */
export function nextAttachmentPosition(rows: readonly { position: number }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;
}

/** `${userId}/${invoiceId}/${uuid}.jpg` — folder[1] = uid matches the policy. */
export function attachmentObjectPath(userId: string, invoiceId: string): string {
  return `${userId}/${invoiceId}/${crypto.randomUUID()}.jpg`;
}

export async function listAttachmentRows(supabase: Db, invoiceId: string): Promise<AttachmentRow[]> {
  const { data } = await supabase
    .from('invoice_attachments')
    .select('id, storage_path, position, mime_type, size_bytes, checksum')
    .eq('invoice_id', invoiceId)
    .order('position');
  return (data ?? []) as AttachmentRow[];
}

export async function signedAttachmentUrl(supabase: Db, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** The row trigger's plan refusal (tiers): a NEW attachment needs Plus. */
export const PLAN_ATTACHMENTS = 'PLAN_ATTACHMENTS';

/** A plan refusal from enforce_plus_attachments(), read off PostgREST's hint.
 *  Not a failure: a copy path skips the file and the document still saves. */
export function isPlanRefusal(
  error: { hint?: unknown; message?: unknown } | null | undefined,
): boolean {
  const hint = typeof error?.hint === 'string' ? error.hint : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  return hint === PLAN_ATTACHMENTS || message.includes(PLAN_ATTACHMENTS);
}

/** Why an upload did or did not become a row. `planRequired` is kept apart from
 *  `failed` so the caller can save the document without that file instead of
 *  aborting it. */
export type UploadOutcome =
  | { row: AttachmentRow }
  | { planRequired: true }
  | { failed: true };

/** Upload one compressed JPEG and record its row at `position`. Rolls the object
 *  back if the row insert is refused, so a half-written attachment never
 *  lingers — including when the refusal is the plan gate. */
export async function uploadAttachmentOutcome(
  supabase: Db, userId: string, invoiceId: string, position: number, blob: Blob,
): Promise<UploadOutcome> {
  const path = attachmentObjectPath(userId, invoiceId);
  const up = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) return { failed: true };
  const { data, error } = await supabase
    .from('invoice_attachments')
    .insert({ user_id: userId, invoice_id: invoiceId, storage_path: path, position })
    .select('id, storage_path, position')
    .single();
  if (!data) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
    return isPlanRefusal(error) ? { planRequired: true } : { failed: true };
  }
  return { row: data as AttachmentRow };
}

/** Upload one compressed JPEG and record its row; null when it could not be
 *  saved for any reason (see uploadAttachmentOutcome for the reason). */
export async function uploadAttachment(
  supabase: Db, userId: string, invoiceId: string, position: number, blob: Blob,
): Promise<AttachmentRow | null> {
  const outcome = await uploadAttachmentOutcome(supabase, userId, invoiceId, position, blob);
  return 'row' in outcome ? outcome.row : null;
}

/** Delete one attachment's row and stored object. */
export async function deleteAttachment(supabase: Db, row: AttachmentRow): Promise<void> {
  await supabase.from('invoice_attachments').delete().eq('id', row.id);
  await supabase.storage.from(ATTACHMENT_BUCKET).remove([row.storage_path]);
}

/**
 * Renumber `rows` to 0..n-1 in their current order.
 *
 * A reorder is an UPDATE of positions, never a row rewrite: authenticated holds
 * no UPDATE on invoice_attachments, so the one way is the SECURITY DEFINER
 * reorder_invoice_attachments() (20261116120100). It checks the invoice is the
 * caller's, sets every position in one statement (the unique constraint is
 * deferred so trading places can't collide), and respects the 0..9 slots and
 * the signed/converted-estimate lock. Nothing is deleted or inserted — which is
 * what lets a lapsed user reorder attachments they already have. Returns the
 * rows in their new order.
 */
export async function renumberAttachments(
  supabase: Db, userId: string, invoiceId: string, rows: readonly AttachmentRow[],
): Promise<AttachmentRow[]> {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  // Server-verified rows (estimate attachments) keep their server-owned
  // columns; this helper only ever moves positions now, but the estimate path
  // still owns its order through the routes, so the guard stays.
  if (ordered.some((r) => r.checksum)) throw new Error(ATTACHMENT_RENUMBER_VERIFIED);
  if (ordered.every((r, i) => r.position === i)) return ordered;
  const { error } = await supabase.rpc('reorder_invoice_attachments', {
    p_invoice_id: invoiceId,
    p_ids: ordered.map((r) => r.id),
  });
  if (error) throw error;
  return ordered.map((r, position) => ({ ...r, position }));
}

/** Thrown when an attachment's bytes can't be read while a PDF is being built.
 *  Callers surface it as an error with a retry — a document must never print
 *  missing a picture the user attached. */
export const ATTACHMENT_LOAD_ERROR = 'attachment-load-failed';

/** The editor's list → the PDF's image list. Bytes come from the pending blob
 *  when present (never a re-download just to print), else from the saved
 *  object, else from a seed-time copy's SOURCE object (read-only). The order is
 *  the list order, so position and PDF order can't drift. STRICT: an unreadable
 *  image throws ATTACHMENT_LOAD_ERROR rather than being silently dropped — and
 *  so does a list longer than the cap, which would otherwise print a partial
 *  set. */
export async function toPdfAttachments(
  supabase: Db, items: readonly EditorAttachment[],
): Promise<PdfAttachment[]> {
  if (items.length > ATTACHMENT_MAX) throw new Error(ATTACHMENT_LOAD_ERROR);
  const out: PdfAttachment[] = [];
  for (const it of items) {
    let blob: Blob | null = null;
    try {
      blob = it.blob ?? await downloadAttachmentBlob(supabase, it.storagePath ?? it.copyFromPath);
    } catch { blob = null; }
    if (!blob) throw new Error(ATTACHMENT_LOAD_ERROR);
    try {
      const dataUrl = await blobToDataUrl(blob);
      const size = it.width && it.height ? { width: it.width, height: it.height } : await measureBlob(blob);
      out.push({ dataUrl, width: size.width, height: size.height });
    } catch { throw new Error(ATTACHMENT_LOAD_ERROR); }
  }
  return out;
}

async function downloadAttachmentBlob(supabase: Db, path: string | undefined | null): Promise<Blob | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(ATTACHMENT_BUCKET).download(path);
  return data ?? null;
}

/** Load another document's attachments as seed-time copies: signed-URL
 *  thumbnails (so a revision card shows them and the 6 cap counts) plus the
 *  source path to duplicate later. Reads only — never touches the source. */
export async function loadAttachmentCopies(supabase: Db, sourceInvoiceId: string): Promise<EditorAttachment[]> {
  const rows = await listAttachmentRows(supabase, sourceInvoiceId);
  const items = await Promise.all(rows.map(async (r) => {
    const url = await signedAttachmentUrl(supabase, r.storage_path);
    return url ? ({ id: r.id, previewUrl: url, copyFromPath: r.storage_path } as EditorAttachment) : null;
  }));
  return items.filter(Boolean) as EditorAttachment[];
}

/** Load an invoice's OWN attachments for editing: signed thumbnail + its stored
 *  path and row id (already saved on THIS invoice, so not a copy). */
export async function loadAttachmentItems(supabase: Db, invoiceId: string): Promise<EditorAttachment[]> {
  const rows = await listAttachmentRows(supabase, invoiceId);
  const items = await Promise.all(rows.map(async (r) => {
    const url = await signedAttachmentUrl(supabase, r.storage_path);
    return url ? ({ id: r.id, previewUrl: url, storagePath: r.storage_path, rowId: r.id } as EditorAttachment) : null;
  }));
  return items.filter(Boolean) as EditorAttachment[];
}

export interface MaterializeResult {
  /** `items` with every successfully-duplicated pending entry now saved. */
  items: EditorAttachment[];
  saved: Map<string, { storagePath: string; rowId: string }>;
  /** The id of the first entry that could NOT be materialized (send aborts). */
  failedId?: string;
  /** Copies the plan gate refused (non-Plus, tiers on). The document is saved
   *  without them and keeps going; this is never a failure. */
  attachmentsSkipped: number;
}

/** Duplicate every pending entry — a freshly-picked blob or a seed-time copy —
 *  into a NEW object under `invoiceId`'s folder and insert its row at the next
 *  free position (0..n-1). The copy's SOURCE object/row is never written to.
 *  Stops at the first failure and reports it, so the caller can abort the send
 *  rather than ship a document missing a picture the card showed. */
export async function materializeAttachments(
  supabase: Db, userId: string, invoiceId: string, items: readonly EditorAttachment[],
): Promise<MaterializeResult> {
  const saved = new Map<string, { storagePath: string; rowId: string }>();
  const pending = items.filter((a) => !a.storagePath && (a.blob || a.copyFromPath));
  if (!pending.length) return { items: [...items], saved, attachmentsSkipped: 0 };

  const existing = await listAttachmentRows(supabase, invoiceId);
  let position = nextAttachmentPosition(existing);
  const done = new Map<string, EditorAttachment>();
  // Even on a failure, report what DID save (the caller may keep the successes);
  // the failed entry and everything after it stay pending.
  const partial = () => items.map((a) => done.get(a.id) ?? a);

  for (let i = 0; i < pending.length; i++) {
    const a = pending[i];
    if (position >= ATTACHMENT_MAX) {
      return { items: partial(), saved, failedId: a.id, attachmentsSkipped: 0 };
    }
    const blob = a.blob ?? await downloadAttachmentBlob(supabase, a.copyFromPath);
    if (!blob) return { items: partial(), saved, failedId: a.id, attachmentsSkipped: 0 };
    const outcome = await uploadAttachmentOutcome(supabase, userId, invoiceId, position, blob);
    if ('planRequired' in outcome) {
      // The plan refuses this one and every one after it: save the document
      // without them rather than failing the send. The object this attempt
      // uploaded has already been removed.
      return { items: partial(), saved, attachmentsSkipped: pending.length - i };
    }
    if ('failed' in outcome) {
      return { items: partial(), saved, failedId: a.id, attachmentsSkipped: 0 };
    }
    const row = outcome.row;
    saved.set(a.id, { storagePath: row.storage_path, rowId: row.id });
    // Repoint the thumbnail at the NEW object (the source URL is short-lived).
    const url = await signedAttachmentUrl(supabase, row.storage_path);
    done.set(a.id, {
      ...a, blob: undefined, copyFromPath: undefined,
      storagePath: row.storage_path, rowId: row.id, previewUrl: url ?? a.previewUrl,
    });
    position++;
  }

  return { items: partial(), saved, attachmentsSkipped: 0 };
}

/** Remove every attachment row + object of ONE invoice. Used to roll back a
 *  failed copy — the caller only ever passes the invoice it just created, so the
 *  source is never in scope. */
export async function deleteInvoiceAttachments(supabase: Db, invoiceId: string): Promise<void> {
  const rows = await listAttachmentRows(supabase, invoiceId);
  if (!rows.length) return;
  await supabase.storage.from(ATTACHMENT_BUCKET).remove(rows.map((r) => r.storage_path));
  await supabase.from('invoice_attachments').delete().eq('invoice_id', invoiceId);
}

export interface CopyResult {
  ok: boolean;
  copied: number;
  /** Files the plan gate refused: the target is created without them. */
  attachmentsSkipped: number;
}

/** Copy a document's attachments onto ANOTHER, already-created document (D4:
 *  quote→invoice). Reads the source (list + download) and writes only under
 *  `toInvoiceId`. If any file fails, the copies already made on the target are
 *  removed, so the target is left exactly as it was — the source is never
 *  touched. The caller reports `ok:false` and undoes its own new row. */
export async function copyAttachments(
  supabase: Db, userId: string, fromInvoiceId: string, toInvoiceId: string,
): Promise<CopyResult> {
  const copies = await loadAttachmentCopies(supabase, fromInvoiceId);
  if (!copies.length) return { ok: true, copied: 0, attachmentsSkipped: 0 };
  const res = await materializeAttachments(supabase, userId, toInvoiceId, copies);
  if (res.failedId) {
    try { await deleteInvoiceAttachments(supabase, toInvoiceId); } catch { /* best effort */ }
    return { ok: false, copied: 0, attachmentsSkipped: 0 };
  }
  // A plan refusal is not a failure: the document exists, without those files.
  return { ok: true, copied: res.saved.size, attachmentsSkipped: res.attachmentsSkipped };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

async function measureBlob(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
