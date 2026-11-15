// ═══ AI Smart · is this message only an affirmation? ═══
//
// "yes", "ok", "do it", "save it" right after a confirm card was offered means
// tap the card — not a new request. The prompt used to say so in words, and the
// model started reading real requests after a card as affirmations ("change
// Ruth Lawrence phone to 555-0199" got no tool call). So the rule lives in code,
// narrow on purpose: at most four words, every one of them an affirmation word.
//
// Anything longer, anything with a name, a number or a verb that is not in this
// list, always goes to the model. Pure: no I/O, unit-tested both ways.

/** The whole message when it is only one of these. */
export const TAP_CONFIRM_REPLY = 'Tap Confirm on the card.';

/** Every word a bare affirmation may be made of. */
const WORDS = new Set([
  'yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure', 'confirm', 'confirmed',
  'do', 'it', 'go', 'ahead', 'save', 'send', 'that', 'sounds', 'good',
  'please', 'alright', 'right', 'correct', 'fine', 'great', 'perfect', 'now',
]);

/** The most words a bare affirmation may have. Longer is always a request. */
export const AFFIRM_WORD_CAP = 4;

/**
 * True only when the message is nothing but an affirmation: at most four words,
 * all of them from the list above. "save service call at 95" and "change Ruth
 * Lawrence phone to 555-0199" are not: the first is five words and neither is
 * made only of these words.
 */
export function isAffirmationOnly(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > AFFIRM_WORD_CAP) return false;
  return words.every((word) => WORDS.has(word));
}
