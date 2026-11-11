// ═══ AI Smart · money is composed by the server, never written by the model ═══
//
// A tool result carries money as { amount, text }: the number for arithmetic,
// the formatted string for reading aloud. Both are built here with money() from
// lib/financials, so no caller ever prints a raw number and no model ever gets
// to invent a figure.
//
// The guard is the enforcement side: model prose may only contain a dollar
// figure that already exists in this turn's server-composed results. A figure
// with no source behind it means the model is narrating money it does not have,
// and that sentence is dropped before the user hears it.
import { z } from 'zod';
import { money, roundCurrency } from '@/lib/financials';

export const MoneySchema = z.object({
  amount: z.number().finite(),
  text: z.string().min(1),
});

export type MoneyField = z.infer<typeof MoneySchema>;

/** One server-composed money field. The only way a number becomes speakable. */
export function moneyField(amount: number): MoneyField {
  const rounded = roundCurrency(amount);
  // Negative zero would print as "-$0.00"; a zero balance is a zero balance.
  const value = Object.is(rounded, -0) ? 0 : rounded;
  return { amount: value, text: money(value) };
}

export function isMoneyField(value: unknown): value is MoneyField {
  if (!value || typeof value !== 'object') return false;
  const field = value as Partial<MoneyField>;
  return typeof field.amount === 'number' && Number.isFinite(field.amount)
    && typeof field.text === 'string';
}

const DOLLAR_RE = /\$\s?(\d[\d,]*(?:\.\d+)?)/g;

/** Every "$1,200.00"-shaped figure in a text, normalised to cents. */
export function dollarFigures(text: string): number[] {
  const out: number[] = [];
  for (const match of text.matchAll(DOLLAR_RE)) {
    const value = Number(match[1].replace(/,/g, ''));
    if (Number.isFinite(value)) out.push(roundCurrency(value));
  }
  return out;
}

/** Every money figure the server composed into a turn's results, recursively. */
export function moneyFigures(value: unknown, seen = new Set<unknown>()): number[] {
  if (value == null) return [];
  if (typeof value === 'string') return dollarFigures(value);
  if (typeof value !== 'object') return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const collected = isMoneyField(value)
    ? [roundCurrency(value.amount)]
    : Array.isArray(value)
      ? value.flatMap((item) => moneyFigures(item, seen))
      : Object.values(value as Record<string, unknown>)
        .flatMap((item) => moneyFigures(item, seen));

  // One figure per value: a amount repeated in the sentence it composed is
  // still one figure the server holds.
  return [...new Set(collected)].sort((a, b) => a - b);
}

export type MoneyGuardResult = {
  ok: boolean;
  /** The safe text: offending sentences removed. Never empty when ok. */
  text: string;
  /** Figures the model stated that no server result backs. */
  offending: number[];
};

const splitSentences = (text: string): string[] =>
  text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

/**
 * Fails model text carrying a dollar figure that is not in `serverResults`.
 * Applies to every AI route: /api/ask passes its tool results, /api/parse passes
 * the totals it computed itself. On failure the offending sentences go, because
 * a reply without a wrong figure is better than a reply with one.
 */
export function guardModelMoney(
  modelText: string,
  serverResults: readonly unknown[],
): MoneyGuardResult {
  const allowed = new Set<number>(serverResults.flatMap((result) => moneyFigures(result)));
  const offending: number[] = [];
  const keep: string[] = [];

  for (const sentence of splitSentences(modelText)) {
    const figures = dollarFigures(sentence).filter((figure) => !allowed.has(figure));
    if (figures.length) offending.push(...figures);
    else keep.push(sentence);
  }

  return {
    ok: offending.length === 0,
    text: keep.join(' ').trim(),
    offending: [...new Set(offending)],
  };
}
