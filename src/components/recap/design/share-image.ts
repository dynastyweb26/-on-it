'use client';
// The Share button (RecapPlayer.dc.html: actShare, exportMode). The affirmation
// slide's 9:16 export (360 x 640, no chrome, logo at the bottom) is drawn into a
// PNG and handed to the system share sheet. Where files can't be shared, the PNG
// is saved instead.

export type ShareRoute = 'share' | 'save';

/** Share sheet when the browser can share this file, else save it. */
export function shareRoute(canShareFiles: boolean): ShareRoute {
  return canShareFiles ? 'share' : 'save';
}

/** Whether an error is the person closing the share sheet. */
export const isShareCancel = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** A short, true reason for the on-screen error. */
export function shareErrorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  return m ? `Couldn’t make the image: ${m}` : 'Couldn’t make the image.';
}

/** Draw the export frame to a PNG (1080 x 1920). */
export async function renderShareImage(frame: HTMLElement): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(frame, { backgroundColor: null, scale: 3, width: 360, height: 640, useCORS: true, logging: false });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the image came out empty'))), 'image/png');
  });
}

/** Open the share sheet (or save the file). Resolves 'cancelled' when the sheet was closed. */
export async function shareImage(blob: Blob, name = 'on-it-recap.png'): Promise<'shared' | 'saved' | 'cancelled'> {
  const file = new File([blob], name, { type: 'image/png' });
  const can = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  if (shareRoute(can) === 'share') {
    try { await navigator.share({ files: [file] }); return 'shared'; }
    catch (e) { if (isShareCancel(e)) return 'cancelled'; throw e; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}
