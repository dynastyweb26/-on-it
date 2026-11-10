// Target total: "make sure the new project total is 7500".
//
// The model cannot be trusted to hit a stated total. On Nov 7 2026 it chased
// 7500 by quietly changing prices (a $250 fence repair became $450, a $2.00
// rate became $1.97) and landed on the wrong figure without saying so.
//
// New rule, all in code:
//   1. When a message states a target total, any change the model made to an
//      EXISTING line's qty or price that the user did not state this turn is
//      reverted. ("still 3150 sqft" keeps 3150; a derived $450 does not.)
//   2. If the total is not the target, the app says how far off it is and asks
//      which line should change. It never picks one itself.
//   3. The answer ("the fence repair", "the first one") is applied here, with
//      the sums done in code, and the reply states exactly what changed.
//
// Pure: no I/O. The route only passes data in and uses what comes back.
import { calculateInvoiceTotals, calculateLineAmount, money, roundCurrency } from './financials';
import { numbersInText } from './line-grounding';

export interface TargetItem {
  description: string;
  qty: number;
  unit_price: number | null;
}

export interface TargetResolution<T extends TargetItem> {
  /** The line items to use this turn. */
  items: T[];
  /** The one reply the app writes, or null to keep the normal reply. */
  reply: string | null;
}

const NUM = String.raw`\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?`;
const TARGET_PATTERNS: RegExp[] = [
  // "make sure the (new) (project) total is 7500", "ensure the total comes to 7500"
  new RegExp(String.raw`\b(?:make sure|make certain|ensure|so that|so)\b[^.?!\d$]{0,40}?\btotal\b[^.?!\d$]{0,25}?` + NUM),
  // "new project total is 7500", "estimate total 7500", "final total: 7500"
  new RegExp(String.raw`\b(?:new|project|estimate|invoice|overall|final|grand|whole|job|entire)\s+(?:\w+\s+)?total\b[^.?!\d$]{0,20}?` + NUM),
  // "total should be 7500", "total needs to come to 7500"
  new RegExp(String.raw`\btotal\s+(?:should|needs? to|has to|must|ought to|to)\s+(?:be|come to|equal)\s*` + NUM),
  // "make it come to 7500", "make the total 7500", "bring the total to 7500", "add up to 7500"
  new RegExp(String.raw`\b(?:make (?:the |it |this )?(?:whole |entire )?(?:thing |estimate |invoice |project |total )?(?:come to|total|add up to|equal)|bring (?:the |it )?(?:total )?(?:down |up )?to|add up to)\s*` + NUM),
];

/** The target total a message states, or null. Digits (commas, decimals, "k")
 *  only; a bare "7500" with no total phrasing is not a target. */
export function detectTargetTotal(text: string): number | null {
  const t = text.toLowerCase();
  for (const re of TARGET_PATTERNS) {
    const m = re.exec(t);
    if (!m) continue;
    const n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) continue;
    return roundCurrency(m[2] ? n * 1000 : n);
  }
  return null;
}

const ASK_TAIL = 'Which line should I change?';
const ASK_RE = /your (\$[\d,]+(?:\.\d{2})?) target\. Which line should I change\?/;

/** The target an earlier assistant message was asking about, or null. Only the
 *  app's own ask sentence matches, so the model's prose can never start a flow. */
export function pendingTargetFromAsk(lastAssistant: string): number | null {
  const m = ASK_RE.exec(lastAssistant);
  if (!m) return null;
  const n = Number(m[1].replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const stems = (s: string) =>
  new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3).map((w) => w.slice(0, 5)));
const STOP_PICK = new Set(['the', 'one', 'line', 'item', 'that', 'change', 'chang', 'just', 'please']);

const ORDINALS: Array<[RegExp, number]> = [
  [/\b(?:first|1st)\b/, 0],
  [/\b(?:second|2nd)\b/, 1],
  [/\b(?:third|3rd)\b/, 2],
  [/\b(?:fourth|4th)\b/, 3],
];

/** Which line the user means by their answer, or null when unclear. */
export function pickLine(answer: string, items: TargetItem[]): number | null {
  const a = answer.toLowerCase().trim();
  if (!a || !items.length) return null;
  if (/\blast\b/.test(a)) return items.length - 1;
  for (const [re, idx] of ORDINALS) if (re.test(a) && idx < items.length) return idx;
  const bare = /^(?:the |line |item |number |#)?(\d)(?:st|nd|rd|th)?(?: one| line| item)?\.?$/.exec(a);
  if (bare) {
    const idx = Number(bare[1]) - 1;
    return idx >= 0 && idx < items.length ? idx : null;
  }
  const words = [...stems(a)].filter((s) => !STOP_PICK.has(s));
  if (!words.length) return null;
  const scores = items.map((it) => {
    const own = stems(it.description);
    return words.filter((w) => own.has(w)).length;
  });
  // Exactly one line may match. Naming two lines ("the stairs and fence") is an
  // unclear answer, not a vote for the one with more shared words.
  const hits = scores.flatMap((s, i) => (s > 0 ? [i] : []));
  return hits.length === 1 ? hits[0] : null;
}

/** A short spoken name for a line: text up to the first comma, trimmed. */
export function shortName(description: string): string {
  const head = description.split(',')[0].trim();
  const cut = head.length > 32 ? `${head.slice(0, 30).trimEnd()}...` : head;
  return cut || 'that line';
}

export function priced<T extends TargetItem>(items: T[]): boolean {
  return items.length > 0 && items.every((i) => i.unit_price != null && Number.isFinite(i.unit_price));
}

export function totalOf(items: TargetItem[], taxRate: number): number {
  return calculateInvoiceTotals(
    items.map((i) => ({ qty: i.qty, unit_price: i.unit_price ?? 0 })),
    taxRate,
  ).total;
}

/** Revert qty/price changes the model made to existing lines when the number
 *  was not stated in the user's message. New lines are left alone (grounding
 *  already vetted them). */
export function revertDerivedEdits<T extends TargetItem>(modelItems: T[], draftItems: TargetItem[], message: string): T[] {
  const stated = numbersInText(message);
  const has = (n: number) => stated.has(Math.round(n * 100) / 100);
  return modelItems.map((m, i) => {
    const byName = draftItems.find((d) => norm(d.description) === norm(m.description));
    const slot = draftItems[i];
    const d = byName ?? (slot && slot.unit_price === m.unit_price ? slot : undefined);
    if (!d) return m;
    const next = { ...m };
    if (m.unit_price !== d.unit_price && !(m.unit_price != null && has(m.unit_price))) next.unit_price = d.unit_price;
    if (m.qty !== d.qty && !has(m.qty)) next.qty = d.qty;
    return next;
  });
}

export interface ResolveInput<T extends TargetItem> {
  /** The user's latest message. */
  message: string;
  /** The previous assistant message ('' if none). */
  lastAssistant: string;
  /** The draft's line items as the client sent them. */
  draftItems: T[];
  /** The line items the model returned this turn (after grounding). */
  modelItems: T[];
  taxRate: number;
}

/**
 * Decide what a target-total turn does. Returns null when this turn is not about
 * a target total (the normal path runs untouched).
 */
export function resolveTargetTotal<T extends TargetItem>(input: ResolveInput<T>): TargetResolution<T> | null {
  const { message, lastAssistant, draftItems, modelItems, taxRate } = input;
  const stated = detectTargetTotal(message);

  if (stated != null) {
    const items = revertDerivedEdits(modelItems, draftItems, message);
    if (!priced(items)) return null;
    const total = totalOf(items, taxRate);
    const gap = roundCurrency(stated - total);
    if (Math.abs(gap) < 0.005) return { items, reply: null };
    const way = gap < 0 ? 'over' : 'under';
    return {
      items,
      reply: `Total is ${money(total)}, ${money(Math.abs(gap))} ${way} your ${money(stated)} target. ${ASK_TAIL}`,
    };
  }

  const pending = pendingTargetFromAsk(lastAssistant);
  if (pending == null || !priced(draftItems)) return null;
  const idx = pickLine(message, draftItems);
  if (idx == null) return null;

  const line = draftItems[idx];
  const others = draftItems.reduce(
    (sum, it, i) => (i === idx ? sum : sum + calculateLineAmount(it.qty, it.unit_price ?? 0)),
    0,
  );
  const rate = Number.isFinite(taxRate) && taxRate > 0 ? taxRate : 0;
  const subtotalNeeded = pending / (1 + rate / 100);
  const qty = line.qty || 1;
  const newPrice = roundCurrency((subtotalNeeded - others) / qty);
  const name = shortName(line.description);

  if (newPrice < 0) {
    return {
      items: draftItems,
      reply: `Changing ${name} that much would make it negative. Pick another line, or give me a different total.`,
    };
  }

  const items = draftItems.map((it, i) => (i === idx ? { ...it, unit_price: newPrice } : it));
  const actual = totalOf(items, taxRate);
  const miss = roundCurrency(actual - pending);
  const each = qty !== 1 ? ' each' : '';
  let reply = `Changed ${name} from ${money(line.unit_price ?? 0)} to ${money(newPrice)}${each}. Total: ${money(actual)}.`;
  if (Math.abs(miss) >= 0.005) {
    reply += ` That is ${money(Math.abs(miss))} ${miss > 0 ? 'over' : 'under'} your ${money(pending)} target.`;
  }
  return { items, reply: `${reply} Ready to send?` };
}
