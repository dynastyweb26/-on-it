// ═══ Chat · an ask that outlives the tab ═══
//
// Switching browser tabs, apps or the app's own bottom tabs unmounts ChatView.
// The fetch itself was never aborted, but its result had nowhere to land, so the
// reply was lost and the owner sent the same message twice.
//
// The request now lives here, keyed by the conversation id, with the question it
// answers. ChatView attaches to it when the chat mounts again and shows the
// thinking row while it is still pending. This module holds no React state and
// does no I/O: the same promise is simply read by whoever is on screen.
import type { AskOutcome } from '@/lib/ask-client';

export type PendingAsk = {
  convoId: string;
  /** The user text this ask answers, so a remount can mark it as asked. */
  question: string;
  startedAt: number;
  promise: Promise<AskOutcome>;
};

const inflight = new Map<string, PendingAsk>();

/**
 * Remember the ask for this conversation until it settles. Returns the same
 * promise, so the caller keeps awaiting it normally. An empty conversation id
 * tracks nothing: an unstored ask cannot be re-attached.
 */
export function trackAsk(
  convoId: string | null | undefined,
  question: string,
  promise: Promise<AskOutcome>,
): Promise<AskOutcome> {
  const id = convoId?.trim();
  if (!id) return promise;
  const entry: PendingAsk = { convoId: id, question, startedAt: Date.now(), promise };
  inflight.set(id, entry);
  void promise
    .then(() => {}, () => {})
    .finally(() => {
      if (inflight.get(id) === entry) inflight.delete(id);
    });
  return promise;
}

/** The ask still running for this conversation, if any. */
export function pendingAsk(convoId: string | null | undefined): PendingAsk | undefined {
  const id = convoId?.trim();
  return id ? inflight.get(id) : undefined;
}

/** True while an ask for this conversation has not settled. */
export function isAskInFlight(convoId: string | null | undefined): boolean {
  return Boolean(pendingAsk(convoId));
}

/** Forget one conversation's ask, or every ask with no argument. Tests only. */
export function clearPendingAsk(convoId?: string | null): void {
  if (convoId === undefined || convoId === null) inflight.clear();
  else inflight.delete(convoId);
}

/**
 * Whether a stored payload may replace what is on screen.
 *
 * A live turn owns the screen: while a request is in flight, or a thinking row
 * is showing, a restore would drop the pending message or the reply about to
 * land. Only a newer payload, with nothing in flight, applies.
 */
export function shouldApplyRestore(input: {
  storedIsNewer: boolean;
  askInFlight: boolean;
  hasThinkingMessage: boolean;
}): boolean {
  if (!input.storedIsNewer) return false;
  if (input.askInFlight) return false;
  if (input.hasThinkingMessage) return false;
  return true;
}
