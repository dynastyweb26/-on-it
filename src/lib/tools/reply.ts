// What /api/ask says back. Pure, so the "never a guess" rules are unit-tested.
//
//  - The model never states money: any sentence with a "$" amount is dropped.
//  - A tool that ran leads. Its own server-composed sentence is the first thing
//    the user reads, whatever the tool is; the model's money-free prose follows.
//  - No tool ran: there is no data behind the answer, so the reply is fixed and
//    the turn carries the cant.do card. Model prose is never shown for it.
import { CantDoProps } from '@/lib/templates/props';

export const FALLBACK = "I couldn't look that up just now. Ask me again in a moment.";
export const NO_LOOKUP_REPLY = "I can't look that up yet.";

/**
 * The reply for an account question no tool can answer yet (spend, profit,
 * taxes). Kept for callers that still show the line as plain text; the live
 * path now composes the same line plus the cant.do card in /api/ask.
 */
export const UNSUPPORTED_REPLY = `${NO_LOOKUP_REPLY} I can tell you who hasn't paid you.`;

/** The one lookup that works today: the cant.do card's own offer. */
export const CANT_DO_ALTERNATIVES = ["Who hasn't paid me"] as const;

/**
 * The card for a question no read tool answered. Built from the same copy as
 * the reply, so the card's line and the sentence under it cannot disagree.
 * Null only if the props do not fit, and then the reply still stands alone.
 */
export function cantDoCard(): { id: 'cant.do'; props: CantDoProps } | null {
  const parsed = CantDoProps.safeParse({
    state: 'filled',
    line: NO_LOOKUP_REPLY,
    noAlts: false,
    alternatives: [...CANT_DO_ALTERNATIVES],
  });
  return parsed.success ? { id: 'cant.do', props: parsed.data } : null;
}

/** Drop any sentence carrying a dollar amount: the app prints money, not the model. */
export function withoutMoney(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/\$\s?\d/.test(sentence))
    .join(' ')
    .trim();
}

export function replyFor(input: {
  modelText: string;
  /** The ok tool's own server-composed sentence, or null when none was made. */
  sentence: string | null;
  /** True when the turn invoked at least one tool, whatever its result. */
  toolCalled: boolean;
  /** The tool's sentence is already the whole answer (an empty unpaid list). */
  sentenceIsWholeAnswer?: boolean;
}): string {
  if (!input.toolCalled) return NO_LOOKUP_REPLY;
  // A tool was called but produced no usable result: say so, never let prose
  // fill in with a guess.
  if (!input.sentence) return FALLBACK;
  // Nothing outstanding: the server sentence is the whole answer. Model prose
  // here only restated it ("You're all caught up. No unpaid invoices...").
  if (input.sentenceIsWholeAnswer) return input.sentence;
  const prose = withoutMoney(input.modelText);
  return prose ? `${input.sentence} ${prose}` : input.sentence;
}
