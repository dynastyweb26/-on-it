// ═══ Invoice/quote attachments (client helpers) ═══
// The image-prep side of the feature: compress a picked photo with the shared
// receipt pipeline (D3: 2000px longest edge, JPEG ≤ 1.2 MB) and the pure
// renumbering planner the hosts use when an attachment is removed.
import { prepareImage } from '@/lib/receipt';
import { ATTACHMENT_MAX } from '@/lib/pdf/attachment-pages';

export { ATTACHMENT_MAX };

/** Longest edge after downscale — job-site photos want more detail than a receipt. */
const MAX_EDGE = 2000;
/** Target compressed size (D3). */
const TARGET_BYTES = 1_200 * 1024;

export interface PreparedAttachment {
  /** Compressed JPEG, ready to upload. */
  blob: Blob;
  /** Full-size object URL for the editor thumbnail (caller revokes it). */
  previewUrl: string;
  /** Output pixel size — the PDF fits each image from these. */
  width: number;
  height: number;
  bytes: number;
}

/** Pick → decode (HEIC-aware) → downscale → JPEG. Throws with a message that is
 *  safe to show the user verbatim. */
export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  const p = await prepareImage(file, {
    maxEdge: MAX_EDGE,
    targetBytes: TARGET_BYTES,
    hash: false,
    oversizeMessage: 'That image is over 25 MB. Try a smaller one.',
  });
  return { blob: p.blob, previewUrl: p.previewUrl, width: p.width, height: p.height, bytes: p.bytes };
}

/** The survivors of removing `removeId`, renumbered 0..n-1 in order.
 *
 *  The host applies this with a delete + re-insert (never a run of sequential
 *  position updates, which would collide with unique(invoice_id, position) at
 *  the DB layer). Pure, so the ordering is unit-tested without a database. */
export function planAttachmentPositions(
  current: readonly { id: string }[],
  removeId?: string,
): { id: string; position: number }[] {
  return current
    .filter((a) => a.id !== removeId)
    .map((a, position) => ({ id: a.id, position }));
}
