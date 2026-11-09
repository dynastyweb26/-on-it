// Items 11 and 12: the "?" command and the empty state.
//
// Pure data and matching only — no React, no network. Item 11's card is a LOCAL
// assistant card (RULES): its rows are this constant, it is never an event, and
// the message that triggers it never reaches /api/parse.
//
// Rows are spec 08's groups, minus the two whose phrase has no working path yet
// (noted inline). Each row carries the phrase it drops into the composer.
import type { CommandGroup } from '@/components/chat/CommandCard';

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
      { name: 'Record a payment', ex: 'Ruth paid $25 Zelle', icon: 'payments' },
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

/** The three starter chips (design 08). A chip FILLS the composer so it can be
 *  edited; it never sends. */
export const STARTER_CHIPS = ['Estimate for Ruth, deck repair, $800', 'Ruth paid $25 Zelle', 'Who owes me money?'];

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
