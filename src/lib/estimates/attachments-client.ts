'use client';
// ═══ Estimate attachments (owner, client side) ═══
// Every write goes through the estimate routes — never a direct table write and
// never renumberAttachments (its delete + re-insert is refused by the M2 guard
// because mime_type/size_bytes/checksum are server-owned):
//   presign → upload to the signed URL → confirm → PATCH caption / DELETE.
//
// Images are decoded HEIC-aware and compressed with the shared receipt pipeline
// (2000px longest edge, JPEG ≤ 1.2 MB) before upload; PDFs go as-is. The server
// re-checks the real bytes and size, so this is convenience, not enforcement.
import type { createClient } from '@/lib/supabase/client';
import { prepareAttachment } from '@/lib/attachment';
import { ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES, MAX_CAPTION_CHARS } from './limits';
import { isDeliverableAttachment } from './deliverable';

type Db = ReturnType<typeof createClient>;

export type OwnerAttachment = {
  id: string;
  path: string;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: number;
  caption: string | null;
  /** Short-lived signed URL for a photo thumbnail (null for PDFs). */
  previewUrl: string | null;
};

type Row = {
  id: string;
  storage_path: string;
  position: number;
  mime_type: string | null;
  size_bytes: number | null;
  checksum: string | null;
  caption: string | null;
};

const isImage = (mime: string) => mime === 'image/jpeg' || mime === 'image/png';
const isPdf = (mime: string) => mime === 'application/pdf';

async function errorCode(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `http_${res.status}`;
}

function messageFor(code: string): string {
  switch (code) {
    case 'too_large':
      return 'That file is over 10 MB.';
    case 'too_many':
      return 'You can attach up to 10 files.';
    case 'total_too_large':
      return 'Those files add up to more than 25 MB. Remove one and try again.';
    case 'duplicate':
      return 'That file is already attached.';
    case 'locked':
    case 'approved':
      return 'This estimate is locked.';
    case 'rate_limited':
      return 'Too many uploads. Try again in a minute.';
    case 'validation':
    case 'unsupported_type':
    case 'invalid_type':
      return 'Only JPG, PNG or PDF files.';
    case 'image_failed':
      return "Couldn't read that photo. Try another one.";
    default:
      return "Couldn't upload that file. Please try again.";
  }
}

export function readableUploadError(e: unknown): string {
  const code = e instanceof Error ? e.message : '';
  return code ? messageFor(code) : "Couldn't upload that file. Please try again.";
}

/** Only server-confirmed rows (checksum + own folder) are what the client sees,
 *  so the owner's count can never disagree with the public page. */
export async function loadOwnerAttachments(
  supabase: Db,
  userId: string,
  estimateId: string,
): Promise<OwnerAttachment[]> {
  const { data, error } = await supabase
    .from('invoice_attachments')
    .select('id, storage_path, position, mime_type, size_bytes, checksum, caption')
    .eq('invoice_id', estimateId)
    .eq('user_id', userId)
    .order('position');
  if (error) throw error;

  const rows = ((data ?? []) as Row[]).filter((row) =>
    isDeliverableAttachment(
      { id: row.id, storage_path: row.storage_path, checksum: row.checksum },
      userId,
      estimateId,
    ),
  );

  const out: OwnerAttachment[] = [];
  for (const row of rows) {
    const mime = row.mime_type;
    if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'application/pdf') continue;
    let previewUrl: string | null = null;
    if (isImage(mime)) {
      const { data: signed } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(row.storage_path, 60 * 60);
      previewUrl = signed?.signedUrl ?? null;
    }
    out.push({
      id: row.id,
      path: row.storage_path,
      mimeType: mime,
      sizeBytes: Number(row.size_bytes ?? 0),
      caption: row.caption ?? null,
      previewUrl,
    });
  }
  return out;
}

export type PreparedUpload = {
  blob: Blob;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  /** Object URL for a photo (null for a PDF). */
  previewUrl: string | null;
  label: string;
};

/** Pick → (HEIC-aware decode + JPEG compress) or a PDF straight through. */
export async function prepareEstimateFile(file: File): Promise<PreparedUpload> {
  const type = (file.type || '').toLowerCase();
  const name = file.name || 'Attachment';
  const looksPdf = type === 'application/pdf' || /\.pdf$/i.test(name);

  if (looksPdf) {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('too_large');
    return { blob: file, mimeType: 'application/pdf', previewUrl: null, label: name };
  }

  if (type && !type.startsWith('image/') && !/\.(jpe?g|png|heic|heif|webp)$/i.test(name)) {
    throw new Error('unsupported_type');
  }

  try {
    const prepared = await prepareAttachment(file);
    return {
      blob: prepared.blob,
      mimeType: 'image/jpeg',
      previewUrl: prepared.previewUrl,
      label: name,
    };
  } catch (e) {
    // The picker accepted a HEIC and the browser could not convert it, or the
    // image was unreadable. Both surface as the same actionable sentence.
    throw new Error(e instanceof Error && e.message ? 'image_failed' : 'unsupported_type');
  }
}

/** Upload one file through presign → signed PUT (with real progress) → confirm. */
export async function uploadEstimateAttachment({
  estimateId,
  file,
  onProgress,
}: {
  estimateId: string;
  file: PreparedUpload;
  onProgress?: (pct: number) => void;
}): Promise<OwnerAttachment> {
  const presignRes = await fetch(`/api/estimates/${estimateId}/attachments/presign`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mime_type: file.mimeType, size_bytes: file.blob.size }),
  });
  if (!presignRes.ok) throw new Error(await errorCode(presignRes));
  const presign = (await presignRes.json()) as { path: string; token: string; signedUrl: string };

  await putToSignedUrl(presign.signedUrl, file.blob, onProgress);

  const confirmRes = await fetch(`/api/estimates/${estimateId}/attachments/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: presign.path }),
  });
  if (!confirmRes.ok) throw new Error(await errorCode(confirmRes));
  const body = (await confirmRes.json()) as {
    attachment: { id: string; position: number; mimeType: OwnerAttachment['mimeType']; sizeBytes: number };
  };

  return {
    id: body.attachment.id,
    path: presign.path,
    mimeType: body.attachment.mimeType,
    sizeBytes: body.attachment.sizeBytes,
    caption: null,
    previewUrl: file.previewUrl,
  };
}

/** The signed upload endpoint takes the same multipart shape storage-js sends,
 *  but XHR gives us real upload progress for the ring. */
function putToSignedUrl(
  signedUrl: string,
  blob: Blob,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', blob);

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl, true);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return;
      // Hold 100% for the confirm step.
      onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload_failed_${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('upload_failed'));
    xhr.onabort = () => reject(new Error('upload_failed'));
    xhr.send(form);
  });
}

export async function deleteEstimateAttachment(
  estimateId: string,
  attachmentId: string,
): Promise<void> {
  const res = await fetch(`/api/estimates/${estimateId}/attachments/${attachmentId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await errorCode(res));
}

export async function saveAttachmentCaption(
  estimateId: string,
  attachmentId: string,
  caption: string,
): Promise<void> {
  const clipped = caption.slice(0, MAX_CAPTION_CHARS);
  const res = await fetch(`/api/estimates/${estimateId}/attachments/${attachmentId}/caption`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ caption: clipped.trim() || null }),
  });
  if (!res.ok) throw new Error(await errorCode(res));
}

export function isImageAttachment(a: { mimeType: string }): boolean {
  return isImage(a.mimeType);
}

export function isPdfAttachment(a: { mimeType: string }): boolean {
  return isPdf(a.mimeType);
}
