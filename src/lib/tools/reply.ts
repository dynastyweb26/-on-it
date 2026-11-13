// What /api/ask says back. Pure, so the "never a guess" rules are unit-tested.
//
//  - The model never states money: any sentence with a "$" amount is dropped and
//    the server-composed sentence from the tool result leads.
//  - If the model did not call the tool, there is no data behind the answer, so
//    the reply is fixed. Model prose is never shown for it. This is enforced
//    here, not in the prompt.
import type { UnpaidSummary } from '@/lib/tools/unpaid';
import { CantDoProps } from '@/lib/templates/props';

export const FALLBACK = "I couldn't look that up just now. Ask me again in a moment.";
export const NO_LOOKUP_REPLY = "I can't look that up yet.";

/**
 * Slice 2: the reply for an account question no tool can answer yet (spend,
 * profit, taxes). It leads with the same line as a missed lookup so the two
 * paths sound identical, then names the one thing that DOES work — the tool the
 * user can ask for right now. The word is "estimate" everywhere in this app.
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
  summary: UnpaidSummary | null;
  toolCalled: boolean;
}): string {
  if (!input.toolCalled) return NO_LOOKUP_REPLY;
  // The tool ran but returned nothing usable: say so, never let prose fill in.
  if (!input.summary) return FALLBACK;
  // Nothing outstanding: the server sentence is the whole answer. Model prose
  // here only restated it ("You're all caught up. No unpaid invoices...").
  if (input.summary.totalCount === 0) return input.summary.sentence;
  const prose = withoutMoney(input.modelText);
  return prose ? `${input.summary.sentence} ${prose}` : input.summary.sentence;
}
