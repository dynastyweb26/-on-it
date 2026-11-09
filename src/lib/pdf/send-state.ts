// The invoice screen's PDF + send block (alive layer 04, "PDF + send actions").
// Pure: which of the five states the block is in, and the words for its file
// line. The component draws what this decides.
//
//   building  PDF loading; Send stays live and queues the send
//   ready     file built, attached
//   error     the pre-build failed: Retry, plus "Send link only"
//   sending   the share is in flight (or queued behind the build)
//   sent      already out: Resend
export type PdfSendPhase = 'building' | 'ready' | 'error' | 'sending' | 'sent';

export function pdfSendPhase(i: {
  /** The pre-build for the current render has settled (success OR failure). */
  settled: boolean;
  hasFile: boolean;
  /** A share is in flight, or one is queued behind the build. */
  sending: boolean;
  /** The invoice has gone out (status not draft) or was just sent here. */
  sent: boolean;
}): PdfSendPhase {
  if (i.sending) return 'sending';
  if (!i.settled) return 'building';
  if (!i.hasFile) return 'error';
  return i.sent ? 'sent' : 'ready';
}

/** Pages in a PDF, by counting page objects. 0 when it cannot tell (compressed
 *  object streams hide them): the caller then leaves the page count out. */
export function countPdfPages(bytes: Uint8Array): number {
  let text = '';
  const CHUNK = 0x8000;
  for (let o = 0; o < bytes.length; o += CHUNK) text += String.fromCharCode(...bytes.subarray(o, o + CHUNK));
  return (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
}

export function fileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "1 page · 84 KB · attached" */
export function pdfMetaLine(pages: number, bytes: number): string {
  return [pages > 0 ? `${pages} ${pages === 1 ? 'page' : 'pages'}` : null, fileSizeLabel(bytes) || null, 'attached']
    .filter(Boolean).join(' · ');
}
