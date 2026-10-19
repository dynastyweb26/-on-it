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

export interface AttachmentRow {
  id: string;
  storage_path: string;
  position: number;
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
    .select('id, storage_path, position')
    .eq('invoice_id', invoiceId)
    .order('position');
  return (data ?? []) as AttachmentRow[];
}

export async function signedAttachmentUrl(supabase: Db, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** Upload one compressed JPEG and record its row at `position`. Rolls the object
 *  back if the row insert fails, so a half-written attachment never lingers. */
export async function uploadAttachment(
  supabase: Db, userId: string, invoiceId: string, position: number, blob: Blob,
): Promise<AttachmentRow | null> {
  const path = attachmentObjectPath(userId, invoiceId);
  const up = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) return null;
  const { data } = await supabase
    .from('invoice_attachments')
    .insert({ user_id: userId, invoice_id: invoiceId, storage_path: path, position })
    .select('id, storage_path, position')
    .single();
  if (!data) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
    return null;
  }
  return data as AttachmentRow;
}

/** Delete one attachment's row and stored object. */
export async function deleteAttachment(supabase: Db, row: AttachmentRow): Promise<void> {
  await supabase.from('invoice_attachments').delete().eq('id', row.id);
  await supabase.storage.from(ATTACHMENT_BUCKET).remove([row.storage_path]);
}

/**
 * Renumber `rows` to 0..n-1 in their current order. Because
 * unique(invoice_id, position) is checked per statement, a run of sequential
 * position UPDATEs would collide transiently — so this deletes the invoice's
 * rows and re-inserts the survivors (a single set-based rewrite). Object paths
 * are preserved, so the files are untouched. Returns the new rows.
 */
export async function renumberAttachments(
  supabase: Db, userId: string, invoiceId: string, rows: readonly AttachmentRow[],
): Promise<AttachmentRow[]> {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  if (ordered.every((r, i) => r.position === i)) return ordered;
  await supabase.from('invoice_attachments').delete().eq('invoice_id', invoiceId);
  const { data } = await supabase
    .from('invoice_attachments')
    .insert(ordered.map((r, position) => ({
      user_id: userId, invoice_id: invoiceId, storage_path: r.storage_path, position,
    })))
    .select('id, storage_path, position');
  return ((data ?? []) as AttachmentRow[]).sort((a, b) => a.position - b.position);
}

/** The editor's list → the PDF's image list. Bytes come from the pending blob
 *  when present (never a re-download just to print), else from the newly
 *  materialized object, else from a seed-time copy's SOURCE object (read-only).
 *  The order is the list order, so position and PDF order can't drift. */
export async function toPdfAttachments(
  supabase: Db, items: readonly EditorAttachment[],
): Promise<PdfAttachment[]> {
  const out: PdfAttachment[] = [];
  for (const it of items.slice(0, ATTACHMENT_MAX)) {
    try {
      const blob = it.blob ?? await downloadAttachmentBlob(supabase, it.storagePath ?? it.copyFromPath);
      if (!blob) continue;
      const dataUrl = await blobToDataUrl(blob);
      const size = it.width && it.height ? { width: it.width, height: it.height } : await measureBlob(blob);
      out.push({ dataUrl, width: size.width, height: size.height });
    } catch { /* skip an image that can't be read; the rest still print */ }
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

export interface MaterializeResult {
  /** `items` with every successfully-duplicated pending entry now saved. */
  items: EditorAttachment[];
  saved: Map<string, { storagePath: string; rowId: string }>;
  /** The id of the first entry that could NOT be materialized (send aborts). */
  failedId?: string;
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
  if (!pending.length) return { items: [...items], saved };

  const existing = await listAttachmentRows(supabase, invoiceId);
  let position = nextAttachmentPosition(existing);
  const done = new Map<string, EditorAttachment>();

  for (const a of pending) {
    if (position >= ATTACHMENT_MAX) return { items: [...items], saved, failedId: a.id };
    const blob = a.blob ?? await downloadAttachmentBlob(supabase, a.copyFromPath);
    if (!blob) return { items: [...items], saved, failedId: a.id };
    const row = await uploadAttachment(supabase, userId, invoiceId, position, blob);
    if (!row) return { items: [...items], saved, failedId: a.id };
    saved.set(a.id, { storagePath: row.storage_path, rowId: row.id });
    // Repoint the thumbnail at the NEW object (the source URL is short-lived).
    const url = await signedAttachmentUrl(supabase, row.storage_path);
    done.set(a.id, {
      ...a, blob: undefined, copyFromPath: undefined,
      storagePath: row.storage_path, rowId: row.id, previewUrl: url ?? a.previewUrl,
    });
    position++;
  }

  return { items: items.map((a) => done.get(a.id) ?? a), saved };
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
