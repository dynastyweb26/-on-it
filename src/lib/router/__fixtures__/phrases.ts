// ═══ Chat router · labelled phrases (manual accuracy run) ═══
//
// Ten per route, weighted toward the nasty build cases. Not a CI test: the
// expected label is what the product wants, and only the real model can be
// measured against it. Run scripts/router-accuracy.ts to score it.
import type { RouterRoute } from '../decide';

export interface Labelled {
  text: string;
  route: RouterRoute;
  /** Why this one is here, when the label is not obvious. */
  note?: string;
}

export const ROUTER_PHRASES: Labelled[] = [
  // ── ask: the one lookup that exists today ────────────────────────────────
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
  { text: 'invoice ZZ Test A $50 for a repair', route: 'build' },
  { text: "Maria hasn't paid, bill her again", route: 'build', note: 'reads like an ask, is an instruction' },
  { text: 'invoice the client who hasn’t paid for the roof', route: 'build', note: 'unpaid words, building intent' },
  { text: 'who owes me 50 for the fence', route: 'build', note: 'a figure means a new invoice' },
  { text: 'make an estimate for Ana: water heater swap, 1800', route: 'build' },
  { text: 'change the tax to 8 percent', route: 'build' },
  { text: 'add a line for the filter, 35', route: 'build' },
  { text: 'log 60 bucks for gas at Shell', route: 'build', note: 'expense' },
  { text: 'same as last time for Bob', route: 'build', note: 'ambiguous → build' },

  // ── unsupported: account questions nothing can answer yet ────────────────
  { text: 'how much did I spend on gas?', route: 'unsupported' },
  { text: "what's my profit this month?", route: 'unsupported' },
  { text: 'how much do I owe in taxes?', route: 'unsupported' },
  { text: 'what did I spend at Home Depot last month?', route: 'unsupported' },
  { text: "what's my total income this year?", route: 'unsupported' },
  { text: 'how much is in my bank account?', route: 'unsupported' },
  { text: 'what are my biggest expenses?', route: 'unsupported' },
  { text: 'how much did I make last week?', route: 'unsupported' },
  { text: 'am I actually making money on these jobs?', route: 'unsupported' },
  { text: "what's my net profit for the quarter?", route: 'unsupported' },
  { text: 'how much should I charge for a water heater install?', route: 'unsupported', note: 'pricing advice — nothing in the app prices a job' },
];
