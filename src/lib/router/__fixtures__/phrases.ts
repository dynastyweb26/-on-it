// ═══ Chat router · labelled phrases (manual accuracy run) ═══
//
// Ten per route, weighted toward the nasty build cases. Not a CI test: the
// expected label is what the product wants, and only the real model can be
// measured against it. Run scripts/router-accuracy.ts to score it.
//
// The label is the route the APP takes, not the model's raw word: an
// out-of-scope account question is labelled `ask`, because under the flag the
// router sends every question to /api/ask and the cant.do card is composed
// there. `unsupported` is still a classification, never a destination.
import type { RouterRoute } from '../decide';

export interface Labelled {
  text: string;
  route: RouterRoute;
  /** Why this one is here, when the label is not obvious. */
  note?: string;
}

/**
 * Lookups spoken as commands: no question mark, so only the verb says it is a
 * lookup. Both the router prompt and the regex fallback must route these to
 * ask; these are the fixtures the fallback is tested against.
 */
export const COMMAND_LOOKUPS: Labelled[] = [
  { text: 'find Ruth', route: 'ask' },
  { text: 'show me my invoices', route: 'ask' },
  { text: 'pull up the Smith estimate', route: 'ask' },
  { text: 'list my payments this month', route: 'ask' },
  { text: 'open the estimate for Smith', route: 'ask' },
  { text: 'look up the Alvarez expenses', route: 'ask' },
  { text: "what about Ruth's estimates", route: 'ask' },
  { text: 'when did Smith pay', route: 'ask' },
];

/** The same verb shapes with build intent: these must never become a lookup. */
export const COMMAND_BUILDS: Labelled[] = [
  { text: 'create an invoice for Smith', route: 'build' },
  { text: 'record a payment from Ruth', route: 'build' },
  { text: 'send the estimate to Smith', route: 'build' },
  { text: 'open a new invoice', route: 'build', note: 'lookup verb, build intent' },
];

export const ROUTER_PHRASES: Labelled[] = [
  // ── ask: lookups, including commands with no question mark ───────────────
  ...COMMAND_LOOKUPS,
  { text: "who hasn't paid me", route: 'ask' },
  { text: 'any unpaid invoices', route: 'ask' },
  { text: 'who owes me', route: 'ask' },
  { text: 'which invoices are overdue', route: 'ask' },
  { text: 'how much do people owe me', route: 'ask' },
  { text: "what's my outstanding balance", route: 'ask' },
  { text: 'anything overdue?', route: 'ask' },
  { text: 'show me my unpaid bills', route: 'ask' },
  { text: "who still hasn't paid", route: 'ask' },
  { text: 'hey can you tell me who owes me', route: 'ask' },

  // ── build: create/edit, plus the traps that look like questions ──────────
  ...COMMAND_BUILDS,
  { text: 'invoice ZZ Test A $50 for a repair', route: 'build' },
  { text: "Maria hasn't paid, bill her again", route: 'build', note: 'reads like an ask, is an instruction' },
  { text: 'invoice the client who hasn’t paid for the roof', route: 'build', note: 'unpaid words, building intent' },
  { text: 'who owes me 50 for the fence', route: 'build', note: 'a figure means a new invoice' },
  { text: 'make an estimate for Ana: water heater swap, 1800', route: 'build' },
  { text: 'change the tax to 8 percent', route: 'build' },
  { text: 'add a line for the filter, 35', route: 'build' },
  { text: 'log 60 bucks for gas at Shell', route: 'build', note: 'expense' },
  { text: 'same as last time for Bob', route: 'build', note: 'ambiguous → build' },

  // ── ask, out of scope: a question /api/ask answers with the cant.do card ──
  { text: 'how much did I spend on gas?', route: 'ask' },
  { text: 'how much did I spend this month', route: 'ask', note: 'spend — no tool totals it yet' },
  { text: 'show me my gas expenses', route: 'ask', note: 'expenses list, asked as a question' },
  { text: 'what do I charge for a service call', route: 'ask', note: 'pricing advice — nothing in the app prices a job' },
  { text: 'can you file my taxes', route: 'ask', note: 'doing a thing no tool does' },
  { text: "what's my profit this month?", route: 'ask' },
  { text: 'how much do I owe in taxes?', route: 'ask' },
  { text: 'what did I spend at Home Depot last month?', route: 'ask' },
  { text: "what's my total income this year?", route: 'ask' },
  { text: 'how much is in my bank account?', route: 'ask' },
  { text: 'what are my biggest expenses?', route: 'ask' },
  { text: 'how much did I make last week?', route: 'ask' },
  { text: 'am I actually making money on these jobs?', route: 'ask' },
  { text: "what's my net profit for the quarter?", route: 'ask' },
  { text: 'how much should I charge for a water heater install?', route: 'ask', note: 'pricing advice — the cant.do card names what does work' },
];
