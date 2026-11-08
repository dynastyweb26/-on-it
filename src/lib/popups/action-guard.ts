// The behaviour behind the three popup primitives (design/popups/boards).
//
// Two rules in the kit are about time, not layout:
//   - busy blocks dismissal and repeat taps, with a ref set BEFORE the request
//     (state alone re-renders a frame too late);
//   - a failure unlocks so the same button can retry.
// TapLock is that ref, and it is a plain class so the decisions are unit-tested
// without a renderer. `usePopAction` wires it to React; PopSheet/PopInline/
// PopToast read it synchronously inside their event handlers.

/** Toast lifetimes: info is a glance, undo is a chance. */
export const TOAST_INFO_MS = 2400;
export const TOAST_UNDO_MS = 6000;

export class TapLock {
  private held = false;

  /** True from the first tap until the request settles. */
  get locked(): boolean {
    return this.held;
  }

  /** Returns false when a request is already in flight — the second tap is a no-op. */
  tryLock(): boolean {
    if (this.held) return false;
    this.held = true;
    return true;
  }

  /** A settled request (success or failure) always unlocks, so Retry works. */
  unlock(): void {
    this.held = false;
  }
}

/**
 * Dismiss = the safe answer, so it is refused while the request runs. `pending`
 * is the rendered state; `lock` is the synchronous one (it can be set before
 * React has re-rendered).
 */
export function canDismiss(pending: boolean, lock?: { locked: boolean } | null): boolean {
  return !pending && !(lock?.locked ?? false);
}

/**
 * A typed confirmation (`TYPE DELETE TO CONFIRM`) passes only on an exact,
 * case- and whitespace-insensitive match. No word = nothing to type.
 */
export function typedConfirmOk(value: string, word?: string | null): boolean {
  const wanted = (word ?? '').trim().toUpperCase();
  if (!wanted) return true;
  return value.trim().toUpperCase() === wanted;
}

/** Info toast 2.4 s; a toast carrying an action (undo) 6 s. */
export function toastLifetime(hasAction: boolean): number {
  return hasAction ? TOAST_UNDO_MS : TOAST_INFO_MS;
}
