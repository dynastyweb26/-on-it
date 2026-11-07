// What /api/ask says back. Pure, so the "never a guess" rules are unit-tested.
//
//  - The model never states money: any sentence with a "$" amount is dropped and
//    the server-composed sentence from the tool result leads.
//  - If the model did not call the tool, there is no data behind the answer, so
//    the reply is fixed. Model prose is never shown for it. This is enforced
//    here, not in the prompt.
import type { UnpaidSummary } from '@/lib/tools/unpaid';

export const FALLBACK = "I couldn't look that up just now. Ask me again in a moment.";
export const NO_LOOKUP_REPLY = "I can't look that up yet.";

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
