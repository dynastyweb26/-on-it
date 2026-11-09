// sessionStorage for the remembered signed-out question (per tab, gone when the
// tab closes). Every access is guarded: a blocked or full store is "nothing
// remembered", never an error. The decisions are in signed-out-replay.ts.
import { PENDING_KEY, parsePending, rememberQuestion, type AskSource, type PendingQuestion } from '@/lib/signed-out-replay';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): Store | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

export function writePending(text: string, source: AskSource, now: number, store: Store | null = defaultStore()): void {
  const q = rememberQuestion(text, source, now);
  if (!q || !store) return;
  try { store.setItem(PENDING_KEY, JSON.stringify(q)); } catch { /* storage blocked */ }
}

export function readPending(store: Store | null = defaultStore()): PendingQuestion | null {
  if (!store) return null;
  try { return parsePending(store.getItem(PENDING_KEY)); } catch { return null; }
}

export function clearPending(store: Store | null = defaultStore()): void {
  if (!store) return;
  try { store.removeItem(PENDING_KEY); } catch { /* storage blocked */ }
}

/** Read and remove in one step. The removal comes first in effect: once this
 *  returns a question, no refresh, second render or second tab can get it again. */
export function claimPending(store: Store | null = defaultStore()): PendingQuestion | null {
  const q = readPending(store);
  clearPending(store);
  return q;
}
