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
 *  when present (never a re-download just to print), else from storage. The
 *  order is the list order, so position and PDF order can't drift. */
export async function toPdfAttachments(
  supabase: Db, items: readonly EditorAttachment[],
): Promise<PdfAttachment[]> {
  const out: PdfAttachment[] = [];
  for (const it of items.slice(0, ATTACHMENT_MAX)) {
    try {
      let blob = it.blob ?? null;
      if (!blob && it.storagePath) {
        const { data } = await supabase.storage.from(ATTACHMENT_BUCKET).download(it.storagePath);
        blob = data ?? null;
      }
      if (!blob) continue;
      const dataUrl = await blobToDataUrl(blob);
      const size = it.width && it.height ? { width: it.width, height: it.height } : await measureBlob(blob);
      out.push({ dataUrl, width: size.width, height: size.height });
    } catch { /* skip an image that can't be read; the rest still print */ }
  }
  return out;
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
