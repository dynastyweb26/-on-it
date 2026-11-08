// Pure decisions for PopSheet. No React, no DOM: the component reads these and
// the unit tests pin them, so the locked/dismissal rules cannot drift.
//
// The two rules these encode (CLAUDE.md 2, boards D4/C1):
//   1. Dismissal is only legal when nothing is in flight.
//   2. A destructive sheet is an alertdialog, everything else a dialog.

export type SheetActionKind = 'gold' | 'danger' | 'outline' | 'dark' | 'text';

export interface SheetActionSpec {
  label: string;
  kind?: SheetActionKind;
  /** The action that does the work: it spins while pending and locks the sheet. */
  go?: boolean;
  /** The action a dismissal maps to (scrim, ×, Escape, swipe). */
  safe?: boolean;
  busyLabel?: string;
  /** Caller-side gate (e.g. nothing selected yet). */
  disabled?: boolean;
}

export interface SheetState {
  pending: boolean;
  error: boolean;
  /** False while a typed confirm has not matched its word. */
  typedOk: boolean;
  retryLabel?: string;
}

export interface SheetActionView {
  label: string;
  kind: SheetActionKind;
  /** The go action while the request is in flight. */
  busy: boolean;
  disabled: boolean;
  /** Dimmed but not spinning — the board's muted fill. */
  muted: boolean;
}

/** Nothing may close the sheet between the tap and the settled request. */
export function canDismiss(pending: boolean): boolean {
  return !pending;
}

/** Destructive work gets an alertdialog so the screen reader says so. */
export function sheetRole(destructive: boolean | undefined): 'dialog' | 'alertdialog' {
  return destructive ? 'alertdialog' : 'dialog';
}

/** What a dismissal means, written on the × so the control says what it does. */
export function safeActionLabel(actions: readonly SheetActionSpec[]): string {
  return actions.find((a) => a.safe)?.label ?? 'Close';
}

/** Case- and whitespace-insensitive; no word means no gate. */
export function matchesTypedWord(value: string, word: string | undefined): boolean {
  if (!word) return true;
  return value.trim().toUpperCase() === word.trim().toUpperCase();
}

export function resolveSheetActions(
  actions: readonly SheetActionSpec[],
  state: SheetState,
): SheetActionView[] {
  return actions.map((action) => {
    const isGo = action.go === true;
    const busy = state.pending && isGo;
    const blocked = state.pending || (isGo && !state.typedOk) || action.disabled === true;
    // After a failure the go button offers the retry, not the same promise.
    const retry = isGo && state.error && state.retryLabel ? state.retryLabel : null;
    return {
      label: busy ? (action.busyLabel ?? 'Working…') : (retry ?? action.label),
      kind: action.kind ?? 'outline',
      busy,
      disabled: blocked,
      muted: blocked && !busy,
    };
  });
}
