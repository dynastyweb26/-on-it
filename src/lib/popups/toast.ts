// Pure toast timing (design/popups/boards/PopToast.dc.html, Board 7):
// info 2.4 s, undo 6 s with a gold time bar, one at a time. A failed undo does
// not expire — it says what went wrong and waits to be retried or dismissed.

export const TOAST_INFO_MS = 2400;
export const TOAST_UNDO_MS = 6000;

export type ToastState = 'idle' | 'pending' | 'error';

/** An action means it is an undo toast, so it gets the longer window. */
export function toastDuration(hasAction: boolean): number {
  return hasAction ? TOAST_UNDO_MS : TOAST_INFO_MS;
}

/** Only a settled toast expires; pending and failed ones stay put. */
export function toastAutoDismiss(state: ToastState): boolean {
  return state === 'idle';
}

/** Width of the time bar: 100% at the first frame, 0% when the window closes. */
export function timeBarPercent(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  const left = 100 - (elapsedMs / durationMs) * 100;
  return Math.min(100, Math.max(0, left));
}
