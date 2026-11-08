// Pure decisions for the picker and form round (Boards 3 and 9). No React.
// A failed load is a different state from an empty list (the P-20 bug): the
// picker names the cause and offers Retry, and it says the user can still type
// a name and use it.
import { classifyError, userMessage } from '../errors';

export type PickerLoad<T> =
  | { state: 'loading' }
  | { state: 'ready'; rows: T[] }
  | { state: 'error'; failure: PickerFailure };

export type PickerFailure = { title: string; body: string };

/** "Couldn't load your clients" + the real cause + what still works. */
export function pickerLoadFailure(plural: string, error: unknown): PickerFailure {
  const kind = classifyError(error);
  const sentence = userMessage(error);
  const stillWorks = 'You can still type a name above and use it.';
  return {
    title: `Couldn’t load your ${plural}`,
    body: kind === 'offline' ? `You’re offline. ${stillWorks}` : `${sentence} ${stillWorks}`,
  };
}

/** The row under a search that matches nothing saved. */
export const USE_NAME_SUB = 'Just this once. Nothing is saved.';

/** A row tap commits and closes, so a second tap has nothing to hit. The guard
 *  is a plain object so a same-frame second tap reads the flag the first one
 *  set (state would still show the old render). */
export function createPickGuard() {
  let claimed = false;
  return {
    /** True for the first caller only. */
    claim(): boolean {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    /** A pick that failed hands the turn back. */
    release(): void {
      claimed = false;
    },
  };
}

/** P-25: the invoice list under "Which invoice?" when nothing is open. */
export const INVOICE_CHOICE_EMPTY = 'No unpaid invoices to link this to.';

// ── Board 9 · P-33 estimate signature ────────────────────────────────

/** "Couldn't approve. Please try again." gets a cause when the cause is the
 *  network; any other failure keeps its existing sentence. */
export function signFailureMessage(error: unknown): string {
  return classifyError(error) === 'offline'
    ? 'You’re offline. Nothing was signed. Approve again when you’re back.'
    : "Couldn't approve. Please try again.";
}
