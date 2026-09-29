/** The ONE send path for every document share: chat, invoice detail, quote
 *  detail, and a converted quote (which is sent from its invoice detail page).
 *
 *  Payload: the PDF file plus a text line that carries the pay link — never the
 *  ShareData `url` field. A file + url pair makes iOS present "1 Link and 1
 *  Document", which WhatsApp and Messages reject. A file + text payload is the
 *  shape the chat send already shipped with successfully; the link rides inside
 *  the text, and it is also printed (and tappable) in the PDF itself, so a
 *  target that drops the text still delivers a payable invoice.
 *
 *  Fallback is by navigator.canShare only (synchronous): file + text, then file
 *  alone. There is no retry-on-error inside a share: once share() rejects, the
 *  tap's user activation is spent, so a second share() would just throw
 *  NotAllowedError. The caller surfaces "didn't open" + Retry instead. */

export type ShareResult =
  | { status: 'shared' }
  | { status: 'cancelled' }                 // user dismissed the sheet — a normal choice
  | { status: 'failed'; name: string }      // blocked / errored — caller must say so
  | { status: 'unsupported' };              // no file share here (desktop) — caller downloads

/** The share text: what it is and who it's for, plus the pay link when there is
 *  one (sent invoices only — quotes and drafts-without-a-link pass none). */
export function shareText(lead: string, clientName: string, payUrl?: string | null): string {
  return payUrl ? `${lead} for ${clientName}. Pay online: ${payUrl}` : `${lead} for ${clientName}`;
}

function canShare(data: ShareData): boolean {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare?.(data);
  } catch {
    return false;
  }
}

/** The richest payload this platform approves for this exact data, or null. */
export function sharePayload(file: File, text: string): ShareData | null {
  const attempts: ShareData[] = [
    { files: [file], title: file.name, text },
    { files: [file], title: file.name },
  ];
  return attempts.find(canShare) ?? null;
}

/** Share a PRE-BUILT PDF. Call it synchronously from the tap handler with
 *  nothing awaited before it: navigator.share() is invoked inside this call, so
 *  the tap's transient user activation (which iOS drops after async work) is
 *  still valid. Never throws; every outcome comes back as a ShareResult, and a
 *  failure is logged by error name. */
export function sharePdf(file: File, text: string): Promise<ShareResult> {
  const data = sharePayload(file, text);
  if (!data) return Promise.resolve({ status: 'unsupported' });
  let pending: Promise<void>;
  try {
    pending = navigator.share(data);
  } catch (err) {
    return Promise.resolve(failure(err));
  }
  return pending.then(
    (): ShareResult => ({ status: 'shared' }),
    (err): ShareResult => {
      if (err instanceof DOMException && err.name === 'AbortError') return { status: 'cancelled' };
      return failure(err);
    },
  );
}

function failure(err: unknown): ShareResult {
  const name = err instanceof Error ? err.name : String(err);
  console.error('share failed', name, err);
  return { status: 'failed', name };
}
