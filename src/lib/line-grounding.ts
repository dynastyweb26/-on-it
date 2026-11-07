// Grounding check: a NEW line item must trace to something the user said.
//
// The model re-emits the whole line_items array every turn, and nothing checked
// what it added. On Nov 7 2026 it appended a "Trash Removal $1,000" line Cyril
// never mentioned, then inflated it to $3,700 chasing a target total.
//
// A line item is "new" when it matches no draft line. A priced new line is
// grounded when its unit price, or qty x unit price, appears as a number in the
// user's own messages (digits, "1.5k", or spoken words like "two fifty"). A
// priceless new line ("Car wash") is grounded when it shares a content word with
// the user's messages. The model's own prior replies are never a source, since
// that is where an invented line first appears.
//
// Scope: this only vets lines the model APPENDED. A derived edit to an existing
// line ("decrease the first item by 600") is a different problem (edit ops).
// Pure: no I/O.
import { calculateLineAmount } from './financials';

export interface GroundItem {
  description: string;
  qty: number;
  unit_price: number | null;
}

export interface GroundResult<T extends GroundItem> {
  items: T[];
  rejected: T[];
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Every number the user's text states: digits (with commas, decimals, a "k"
 *  suffix) and spoken number words ("two fifty" = 250, "twelve hundred" = 1200,
 *  "a grand" = 1000). Generous on purpose: a missed spoken form would reject a
 *  real line, which is worse than letting an odd one through. */
export function numbersInText(text: string): Set<number> {
  const out = new Set<number>();
  const lower = text.toLowerCase();

  for (const m of lower.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/g)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    out.add(round2(n));
    if (m[2]) out.add(round2(n * 1000));
  }

  for (const run of spokenRuns(lower)) {
    out.add(round2(runTotal(run)));
    // "two fifty" reads as 250: a units word followed by a tens word is a
    // hundreds-and-tens spoken price.
    if (run.length === 2 && run[0] >= 1 && run[0] <= 9 && run[1] >= 10 && run[1] % 10 === 0 && run[1] < 100) {
      out.add(run[0] * 100 + run[1]);
    }
    for (const v of run) if (v > 0) out.add(v);
  }
  return out;
}

/** Runs of adjacent number words in lowercase text, as raw parts (hundred is
 *  -100, thousand/grand is -1000). Shared with the reply guard. */
export function spokenRuns(lower: string): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length) runs.push(run);
    run = [];
  };
  for (const w of lower.split(/[^a-z]+/).filter(Boolean)) {
    if (w in UNITS) run.push(UNITS[w]);
    else if (w in TENS) run.push(TENS[w]);
    else if (w === 'hundred') run.push(-100);
    else if (w === 'thousand' || w === 'grand') run.push(-1000);
    else if (w === 'and' || w === 'a' || w === 'an') {
      // connector: neither opens nor closes a run
    } else flush();
  }
  flush();
  return runs;
}

/** The value of one spoken run: "twenty five hundred fifty" = 2550,
 *  "six thousand one hundred" = 6100. */
export function runTotal(run: number[]): number {
  let total = 0;
  let current = 0;
  for (const v of run) {
    if (v === -100) current = (current || 1) * 100;
    else if (v === -1000) { total += (current || 1) * 1000; current = 0; }
    else current += v;
  }
  return total + current;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'its', 'her', 'his', 'their', 'our']);
const stems = (s: string) =>
  new Set(
    s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)).map((w) => w.slice(0, 5)),
  );

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** True when `item` is a line the draft already had (same description, or the
 *  same slot at the same price: a rename, not an addition). */
function isExisting(item: GroundItem, index: number, draft: GroundItem[]): boolean {
  const d = norm(item.description);
  if (draft.some((x) => norm(x.description) === d)) return true;
  const slot = draft[index];
  return !!slot && slot.unit_price != null && slot.unit_price === item.unit_price;
}

/** Split `items` into the ones that may stay and the NEW ones the user never
 *  supported. `userTexts` is the user's own turns only. */
export function groundNewLineItems<T extends GroundItem>(
  items: T[],
  draftItems: GroundItem[],
  userTexts: string[],
): GroundResult<T> {
  const said = numbersInText(userTexts.join(' \n '));
  const saidStems = stems(userTexts.join(' '));
  const kept: T[] = [];
  const rejected: T[] = [];

  items.forEach((item, i) => {
    if (isExisting(item, i, draftItems)) {
      kept.push(item);
      return;
    }
    let grounded: boolean;
    if (item.unit_price == null) {
      const own = stems(item.description);
      grounded = [...own].some((s) => saidStems.has(s));
    } else {
      grounded =
        said.has(round2(item.unit_price)) ||
        said.has(round2(calculateLineAmount(item.qty, item.unit_price)));
    }
    (grounded ? kept : rejected).push(item);
  });

  return { items: kept, rejected };
}

/** The one sentence the app adds when it dropped lines the user never gave. */
export function rejectedNote(rejected: GroundItem[]): string {
  if (!rejected.length) return '';
  const names = rejected.map((r) => `"${r.description.trim().slice(0, 40)}"`).join(', ');
  return `I left out ${names} because I didn't hear it from you. Tell me if you want it added.`;
}
