// The one predicate that decides whether an invoice_attachments row may be
// shown on a public estimate.
//
// The table's RLS only proves ownership, and storage_path is only length
// checked, so a client can insert a row pointing anywhere. Public reads, signed
// URLs and the content hash therefore accept a row only when:
//   1. it has a server-computed checksum (confirmed through the upload route), and
//   2. its path is under THIS owner and THIS estimate.
export type AttachmentPathRow = {
  id: string;
  storage_path: string;
  checksum: string | null;
};

const CHECKSUM = /^[0-9a-f]{64}$/;

export function attachmentPrefix(userId: string, estimateId: string): string {
  return `${userId}/${estimateId}/`;
}

export function isDeliverableAttachment(
  row: AttachmentPathRow,
  userId: string,
  estimateId: string,
): boolean {
  if (!row.checksum || !CHECKSUM.test(row.checksum)) return false;
  const prefix = attachmentPrefix(userId, estimateId);
  return (
    typeof row.storage_path === 'string' &&
    row.storage_path.length > prefix.length &&
    row.storage_path.startsWith(prefix)
  );
}

export function deliverableAttachments<T extends AttachmentPathRow>(
  rows: readonly T[],
  userId: string,
  estimateId: string,
): T[] {
  return rows.filter((row) => isDeliverableAttachment(row, userId, estimateId));
}
