// Pure decisions for the AI states (Board 8, minus the thumbs row and reason
// chips, which wait for feat/ai-logging). No React.
import { FALLBACK } from '../tools/reply';

/** A1: the one question we can always answer. It is a real, supported ask, so
 *  tapping it sends it like typed text. */
export const UNSUPPORTED_CHIP = 'Who hasn’t paid me?';

/** Extras attached to the "I can't look that up yet" reply. Never sent to
 *  /api/parse; it carries the chip because the reply names the same question. */
export function unsupportedReplyExtras(): { skipHistory: true; chips: string[] } {
  return { skipHistory: true, chips: [UNSUPPORTED_CHIP] };
}

export type ChipView = { label: string; disabled: boolean };

/** Suggestion chips appear only under the latest message, so an old answer's
 *  chips never linger, and lock while a turn is in flight. */
export function visibleChips(
  msg: { chips?: string[] },
  isLast: boolean,
  busy: boolean,
): ChipView[] {
  if (!isLast || !msg.chips?.length) return [];
  return msg.chips.map((label) => ({ label, disabled: busy }));
}

/** A2: a failed answer gets a short title above its (verbatim) sentence, so
 *  the lookup failure reads as a failure and not as the assistant talking. */
export function failedBubbleTitle(content: string): string | null {
  if (content === FALLBACK) return 'Couldn’t look that up';
  if (/^You(’|')re offline/.test(content)) return 'You’re offline';
  if (/^Connection hiccup/.test(content)) return 'Connection hiccup';
  // S2: a save that did not land (the invoice or the edit), distinct from offline.
  if (/^Couldn(’|')t save /.test(content)) return 'Didn’t save';
  return null;
}
