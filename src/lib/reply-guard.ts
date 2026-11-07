// Reply guard: the model's prose may not state a figure the app did not compute.
//
// The money sentence in /api/parse is built in code from the real line items, so
// it is always arithmetically honest. The prose around it is the model's, and it
// has claimed outcomes that never happened ("I adjusted it to make your total
// 7500" while the card said $10,800). The existing filter only drops sentences
// with a "$" before a digit, so a bare "7500" walked straight through.
//
// Rule: a sentence that carries a figure of 100 or more must match something the
// app actually holds: a line qty, unit price or line amount, the subtotal, tax
// amount, total or deposit, the tax rate, or a digit group from a captured
// contact field (phone, address, zip). Anything else is dropped. The user's own
// words are deliberately NOT an allowed source: the failure is the model echoing
// the target ("7500") as if it were achieved.
//
// Spelled-out figures ("six thousand one hundred") are checked by their whole value.
// Pure: no I/O. Under 100 is left alone so "step 2" or "3 blinds" never trips it.
import { calculateLineAmount } from './financials';
import { runTotal, spokenRuns } from './line-grounding';

export interface GuardItem {
  qty: number;
  unit_price: number | null;
}

export interface GuardFacts {
  items: GuardItem[];
  total: number;
  subtotal?: number;
  taxAmount?: number;
  depositAmount?: number;
  taxRate?: number | null;
  /** Captured contact values; their digit groups (phone, street number, zip) are allowed. */
  contact?: Array<string | null | undefined>;
}

/** Below this a figure is never treated as a money claim. */
export const GUARD_MIN = 100;

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;
// ISO and slashed dates: their digit groups are dates, not money.
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g;

function toNumber(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

function allowedFigures(facts: GuardFacts): Set<number> {
  const out = new Set<number>();
  const add = (n: number | null | undefined) => {
    if (typeof n === 'number' && Number.isFinite(n)) out.add(Math.round(n * 100) / 100);
  };
  for (const it of facts.items) {
    add(it.qty);
    if (it.unit_price != null) {
      add(it.unit_price);
      add(calculateLineAmount(it.qty, it.unit_price));
    }
  }
  add(facts.total);
  add(facts.subtotal);
  add(facts.taxAmount);
  add(facts.depositAmount);
  add(facts.taxRate);
  for (const value of facts.contact ?? []) {
    for (const m of (value ?? '').match(NUMBER_RE) ?? []) add(toNumber(m));
  }
  return out;
}

/** Figures in `sentence` at or above GUARD_MIN that the app does not hold. */
export function ungroundedFigures(sentence: string, allowed: Set<number>): number[] {
  const scan = sentence.replace(DATE_RE, ' ');
  const bad: number[] = [];
  for (const m of scan.match(NUMBER_RE) ?? []) {
    const n = toNumber(m);
    if (!Number.isFinite(n) || n < GUARD_MIN) continue;
    if (!allowed.has(Math.round(n * 100) / 100)) bad.push(n);
  }
  // The reply is written to be read aloud, so the model spells figures out
  // ("six thousand one hundred"). Same rule for those, by their whole value.
  for (const run of spokenRuns(scan.toLowerCase())) {
    const n = runTotal(run);
    if (n >= GUARD_MIN && !allowed.has(Math.round(n * 100) / 100)) bad.push(n);
  }
  return bad;
}

/** Drop every sentence of `reply` that states a figure the app does not hold.
 *  Splits on a terminator followed by whitespace, so "$1,500.00" never splits. */
export function guardReplyFigures(reply: string, facts: GuardFacts): string {
  const allowed = allowedFigures(facts);
  return reply
    .split(/(?<=[.!?])\s+/)
    .filter((s) => ungroundedFigures(s, allowed).length === 0)
    .join(' ')
    .trim();
}
