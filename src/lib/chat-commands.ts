// Items 11 and 12: the "?" command and the empty state.
//
// Pure data and matching only — no React, no network. Item 11's card is a LOCAL
// assistant card (RULES): its rows are this constant, it is never an event, and
// the message that triggers it never reaches /api/parse.
//
// Rows are spec 08's groups, minus the two whose phrase has no working path yet
// (noted inline). Each row carries the phrase it drops into the composer.
import type { CommandGroup } from '@/components/chat/CommandCard';

/** The one label for recording a payment: the chip and the "What I can do" row. */
export const RECORD_PAYMENT_LABEL = 'Record a payment';

export const COMMAND_GROUPS: CommandGroup[] = [
  {
    title: 'Create',
    items: [
      { name: 'New estimate', ex: 'Estimate for Ruth, deck repair, $800', icon: 'edit_document' },
      { name: 'New invoice', ex: 'Invoice Maryam $150 for the door install', icon: 'receipt_long' },
    ],
  },
  {
    title: 'Money',
    items: [
      // A button, not a phrase: it opens the record-payment card (no typed example).
      { name: RECORD_PAYMENT_LABEL, action: 'record-payment', icon: 'payments' },
      // In the design, hidden here until a path exists: "Send a reminder" ("Remind
      // Brandon about his invoice") routes to /api/parse as a new job. Reminders
      // reuse Request balance on the invoice, so no chat phrase can run one.
      { name: 'Who owes me', ex: 'Who owes me money?', icon: 'receipt_long' },
    ],
  },
  {
    title: 'Clients',
    items: [
      { name: 'Add a client', ex: 'Add Joe Ortiz, 945-555-0134', icon: 'person_add' },
      // In the design, hidden here: "Look up a client" ("What's Ruth's balance?")
      // has no per-client lookup behind it (/api/ask). Shown rows must work.
    ],
  },
  {
    title: 'Recaps',
    items: [
      { name: 'Daily recap', ex: 'How did today go?', icon: 'light_mode' },
      { name: 'Weekly recap', ex: "How'd I do this week?", icon: 'calendar_month' },
    ],
  },
];

/** The one line above the card. The card says what to do with it. */
export const COMMAND_LEAD = 'Here’s what I can do.';

/** Empty-state hint (item 12). */
export const COMMAND_HINT = 'Send ? to see everything I can do';

/** Every phrase "What I can do" offers: the one pool the starter chips draw from. */
export const STARTER_POOL: readonly string[] = COMMAND_GROUPS.flatMap((g) =>
  // The payment row is a button: its chip carries the button's label, and a tap
  // opens the card instead of filling the composer (see isRecordPaymentChip).
  g.items.map((i) => i.ex ?? RECORD_PAYMENT_LABEL));

/** Is this chip or row the Record a payment button? */
export function isRecordPaymentChip(label: string): boolean {
  return label === RECORD_PAYMENT_LABEL;
}

/**
 * What a chip or a "What I can do" row puts in the input. The label (the example
 * phrase) stays visible exactly as designed; the input gets only the generic
 * lead-in, so the owner types their own names and amounts. A complete question
 * ("Who owes me money?") has nothing to replace and fills whole.
 * One function for both surfaces so they cannot drift. This overrides the
 * design, which fills the whole example (owner decision 2026-11-09).
 */
const LEAD_INS: Readonly<Record<string, string>> = {
  'Estimate for Ruth, deck repair, $800': 'Estimate for ',
  'Invoice Maryam $150 for the door install': 'Invoice ',
  'Add Joe Ortiz, 945-555-0134': 'Add a client: ',
};

export function prefillFor(label: string): string {
  return LEAD_INS[label] ?? label;
}

/** How many sparkle chips show after the greeting. */
export const STARTER_COUNT = 3;

/** Small seedable PRNG (mulberry32), so a pick is reproducible in a test. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The starter chips (design 08): `count` distinct phrases drawn at random from
 * the full "What I can do" list. A chip FILLS the composer so it can be edited;
 * it never sends. Pass `seededRandom(n)` for a reproducible pick; the default
 * is Math.random. Never returns duplicates or more than the pool holds.
 */
export function pickStarterChips(
  rand: () => number = Math.random,
  count: number = STARTER_COUNT,
  pool: readonly string[] = STARTER_POOL,
): string[] {
  const bag = [...new Set(pool)];
  const n = Math.max(0, Math.min(count, bag.length));
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag.slice(0, n);
}

// ── Matching ───────────────────────────────────────────────────────────────

/**
 * Is this message the command? Deliberately narrow: it fires on "?", "help" and
 * the "what can you do" family, and on nothing else. Anything carrying a job
 * ("help me invoice Ruth", a payment sentence) is a normal message and must
 * route exactly as it does today.
 */
export function matchCommand(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;

  // "?", "??", "?!". Nothing else is punctuation-only.
  if (/^[?.!]+$/.test(trimmed)) return true;

  const words = trimmed
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return false;

  // A bare "help" — but never "help me …", which is a job.
  if (words.length === 1 && words[0] === 'help') return true;

  // "what can you do", "what else can you do", "what all can you do",
  // "what do you do", "what can you help me with", "how can you help".
  const joined = words.join(' ');
  return /^(?:so |and |ok(?:ay)? |hey |um )*(?:what|how)(?: (?:all|else))? (?:can|could|do) (?:you|u|ya|it|this)(?: (?:actually |really )?(?:do|help(?: (?:me )?with)?))?$/.test(
    joined,
  );
}
