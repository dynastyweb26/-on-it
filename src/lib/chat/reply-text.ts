// ═══ Chat · what the bubble says over a card ═══
//
// The cant.do card already prints "I can't look that up yet." in the card. The
// bubble used to print the same sentence above it, so the owner read it twice.
// When that card draws, the bubble keeps only what the card does not say.
import { NO_LOOKUP_REPLY } from '@/lib/tools/reply';

/** The cant.do card's own line, as the message the server composed for it. */
export function bubbleTextFor(reply: string, cardId: string | null | undefined): string {
  if (cardId !== 'cant.do') return reply;
  return reply.split(NO_LOOKUP_REPLY).join('').replace(/\s+/g, ' ').trim();
}
