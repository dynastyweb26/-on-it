// Relative edits: "decrease the first item by 600", "take $50 off the stairs",
// "add 100 to the fence repair".
//
// The model guessed. On Nov 7 2026 "decrease the first item by 600" became
// 600 fewer square feet (the user probably meant dollars), and "reduce first
// item by $100" became a $1.96 rate that landed $2 short.
//
// Rule, all in code:
//   - A "$" or "dollars" means money. On a flat line (qty 1) a bare number is
//     money too, because there is nothing else it can be.
//   - A bare number on a per-unit line (3150 sq ft at $2.00) is ambiguous, so the
//     app asks: dollars, or units? It never guesses.
//   - The answer is applied here, the sums are done here, and the reply says
//     exactly what changed, including a few cents of rounding when a per-unit
//     price cannot land to the cent.
// Pure: no I/O.
import { calculateLineAmount, money, roundCurrency } from './financials';
import { numbersInText } from './line-grounding';
import { pickLine, priced, revertDerivedEdits, shortName, totalOf, type TargetItem, type TargetResolution } from './target-total';

export interface RelativeEdit {
  /** -1 decrease, +1 increase */
  dir: -1 | 1;
  amount: number;
  /** "$" or a "dollars"/"bucks" word was said */
  isMoney: boolean;
  /** What the user called the line: "first item", "the stairs". */
  target: string;
}

const NUM = String.raw`(\$?)\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?\s*(dollars?|bucks|usd)?`;
const DOWN = String.raw`(?:decrease|reduce|lower|cut|drop|subtract|discount)`;
const UP = String.raw`(?:increase|raise|bump up|bump)`;

const BY = (verbs: string) => new RegExp(String.raw`\b(${verbs})\s+(?:the\s+)?(.+?)\s+by\s+` + NUM);
const OFF = new RegExp(String.raw`\b(?:take|knock|cut|drop)\s+` + NUM + String.raw`\s+off\s+(?:of\s+)?(?:the\s+)?(.+)$`);
const ADD = new RegExp(String.raw`\badd\s+` + NUM + String.raw`\s+to\s+(?:the\s+)?(.+)$`);

function toAmount(num: string, k: string | undefined): number {
  const n = Number(num.replace(/,/g, ''));
  return roundCurrency(k ? n * 1000 : n);
}

const cleanTarget = (t: string) =>
  t.replace(/\b(?:please|item|line|one)\b/g, ' ').replace(/[.!?,]+$/g, '').replace(/\s+/g, ' ').trim();

/** A relative edit in `text`, or null. Needs a line target; "reduce the total by
 *  100" or "add fence repair 250" are not relative edits. */
export function detectRelativeEdit(text: string): RelativeEdit | null {
  const t = text.toLowerCase();
  let m = BY(DOWN).exec(t);
  if (m) return build(-1, m[2], m[3], m[4], m[5], m[6]);
  m = BY(UP).exec(t);
  if (m) return build(1, m[2], m[3], m[4], m[5], m[6]);
  m = OFF.exec(t);
  if (m) return build(-1, m[5], m[1], m[2], m[3], m[4]);
  m = ADD.exec(t);
  if (m) return build(1, m[5], m[1], m[2], m[3], m[4]);
  return null;
}

function build(dir: -1 | 1, target: string, dollar: string, num: string, k: string | undefined, word: string | undefined): RelativeEdit | null {
  const amount = toAmount(num, k);
  const tgt = cleanTarget(target);
  if (!Number.isFinite(amount) || amount <= 0 || !tgt || /\btotal\b/.test(tgt)) return null;
  return { dir, amount, isMoney: dollar === '$' || !!word, target: tgt };
}

const unitOf = (item: TargetItem): string => {
  const u = (item as unknown as Record<string, unknown>).unit;
  return typeof u === 'string' && u && u !== 'each' && u !== 'job' ? u : 'units';
};

// The app's own question. The state (direction, amount, line) rides in the
// sentence, so the answer turn needs nothing but the history.
function askText(edit: RelativeEdit, item: TargetItem): string {
  const verb = edit.dir < 0 ? 'Take' : 'Add';
  const prep = edit.dir < 0 ? 'off' : 'to';
  const unit = unitOf(item);
  return `${verb} ${money(edit.amount)} ${prep} ${shortName(item.description)}: dollars, or ${edit.amount} ${unit}? Reply "dollars" or "${unit}".`;
}

interface PendingAsk {
  dir: -1 | 1;
  amount: number;
  name: string;
  unit: string;
}

const ASK_RE = /^(Take|Add) (\$[\d,]+(?:\.\d{2})?) (?:off|to) (.+): dollars, or ([\d,]+(?:\.\d+)?) (.+?)\? Reply "dollars" or "(.+?)"\./;

export function pendingFromAsk(lastAssistant: string): PendingAsk | null {
  const m = ASK_RE.exec(lastAssistant.trim());
  if (!m) return null;
  const amount = Number(m[2].replace(/[$,]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { dir: m[1] === 'Take' ? -1 : 1, amount, name: m[3], unit: m[6] };
}

/** "dollars" or "units", or null when the answer is neither. */
export function answerKind(answer: string, unit: string): 'dollars' | 'units' | null {
  const a = answer.toLowerCase();
  const money = /\bdollars?\b|\$|\bbucks\b|\bprice\b|\bmoney\b|\bamount\b|\bcost\b/.test(a);
  const units = /\b(?:sq|square|feet|foot|ft|units?|qty|quantity|hours?|each)\b/.test(a) || a.includes(unit.toLowerCase());
  if (money === units) return null;
  return money ? 'dollars' : 'units';
}

export interface RelativeInput<T extends TargetItem> {
  message: string;
  lastAssistant: string;
  draftItems: T[];
  modelItems: T[];
  taxRate: number;
}

/** What a relative-edit turn does, or null when this turn is not one. */
export function resolveRelativeEdit<T extends TargetItem>(input: RelativeInput<T>): TargetResolution<T> | null {
  const { message, lastAssistant, draftItems, modelItems, taxRate } = input;
  if (!priced(draftItems)) return null;

  const rel = detectRelativeEdit(message);
  if (rel) {
    const idx = pickLine(rel.target, draftItems);
    if (idx == null) return null;
    // Keep the model's grounded additions and restated numbers; drop its guesses.
    const base = revertDerivedEdits(modelItems, draftItems, message);
    const line = draftItems[idx];
    const at = base.findIndex((b) => b.description.toLowerCase() === line.description.toLowerCase());
    const bi = at >= 0 ? at : idx;
    if (!base[bi]) return null;
    if (rel.isMoney || line.qty === 1) return applyMoney(base, bi, rel.dir, rel.amount, taxRate);
    return { items: base, reply: askText(rel, line) };
  }

  const pending = pendingFromAsk(lastAssistant);
  if (!pending) return null;
  const idx = draftItems.findIndex((d) => shortName(d.description) === pending.name);
  if (idx < 0) return null;
  const kind = answerKind(message, pending.unit);
  if (!kind) return null;
  // The answer turn is a bare answer: start from the draft, not the model.
  return kind === 'dollars'
    ? applyMoney(draftItems, idx, pending.dir, pending.amount, taxRate)
    : applyUnits(draftItems, idx, pending.dir, pending.amount, taxRate);
}

function applyMoney<T extends TargetItem>(items: T[], idx: number, dir: -1 | 1, amount: number, taxRate: number): TargetResolution<T> {
  const line = items[idx];
  const qty = line.qty || 1;
  const oldAmount = calculateLineAmount(qty, line.unit_price ?? 0);
  const wanted = roundCurrency(oldAmount + dir * amount);
  const name = shortName(line.description);
  if (wanted < 0) {
    return { items, reply: `${money(amount)} off ${name} would make it negative. Tell me a smaller amount.` };
  }
  const newPrice = roundCurrency(wanted / qty);
  const next = items.map((it, i) => (i === idx ? { ...it, unit_price: newPrice } : it));
  const gotLine = calculateLineAmount(qty, newPrice);
  const miss = roundCurrency(gotLine - wanted);
  const verb = dir < 0 ? `Took ${money(amount)} off` : `Added ${money(amount)} to`;
  let reply = `${verb} ${name}`;
  reply += qty !== 1 ? `: now ${money(newPrice)} each.` : `: now ${money(newPrice)}.`;
  reply += ` Total: ${money(totalOf(next, taxRate))}.`;
  if (Math.abs(miss) >= 0.005) {
    reply += ` A per-unit price cannot land to the cent, so that line is ${money(Math.abs(miss))} ${miss > 0 ? 'over' : 'under'}.`;
  }
  return { items: next, reply: `${reply} Ready to send?` };
}

function applyUnits<T extends TargetItem>(items: T[], idx: number, dir: -1 | 1, amount: number, taxRate: number): TargetResolution<T> {
  const line = items[idx];
  const name = shortName(line.description);
  const qty = roundCurrency(line.qty + dir * amount);
  if (qty < 0) return { items, reply: `That would make ${name} negative. Tell me a smaller number.` };
  const next = items.map((it, i) => (i === idx ? { ...it, qty } : it));
  const unit = unitOf(line);
  return {
    items: next,
    reply: `Changed ${name} from ${line.qty} to ${qty} ${unit}. Total: ${money(totalOf(next, taxRate))}. Ready to send?`,
  };
}

// Kept so callers can tell what the user stated without re-parsing.
export { numbersInText };
