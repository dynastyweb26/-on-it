// ═══ "Maria paid me 25 by zelle" — the deterministic half of the payment turn ═══
// The model proposes; this module fills the gaps it can and decides whether the
// proposal is complete enough for a Confirm tap (item 5, safety rules 1–5).
// Nothing here writes money: it only produces what the card shows.
//
// Deterministic on purpose:
//   - The numbers matter too much to leave to a small model alone, and spoken
//     amounts ("twenty-five", "25 bucks") are a narrow, testable grammar.
//   - Every rule below has a test, so a false positive is visible before it can
//     offer to record money.
//
// The model still supplies what this cannot: a client name said as a nickname,
// and which invoice a name refers to. Both are confirmed on the card, never
// written from here.

import type { PaymentMethod } from '@/lib/record-payment';
import { localDateString, yesterdayString } from '@/lib/record-payment';

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

function wordsToNumber(tokens: string[]): number | null {
  let total = 0;
  let saw = false;
  let current = 0;
  for (const raw of tokens) {
    const w = raw.toLowerCase();
    if (w in UNITS) { current += UNITS[w]; saw = true; continue; }
    if (w === 'a' || w === 'an' || w === 'and') continue;
    if (w in TENS) { current += TENS[w]; saw = true; continue; }
    if (w === 'hundred') { current = (current || 1) * 100; saw = true; continue; }
    if (w === 'thousand') { total += (current || 1) * 1000; current = 0; saw = true; continue; }
    // Any other word breaks the run: only adjacent number words count.
    return null;
  }
  return saw ? total + current : null;
}

/**
 * An amount as a person says it: "$25", "25 bucks", "1,250.50", "twenty-five",
 * "twenty five dollars", "a hundred". Null when no amount is stated — never a
 * guess, and never 0 for "free".
 */
export function parseAmount(text: string): number | null {
  if (!text) return null;
  const withSymbol = text.match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  const bare = withSymbol ? null : text.match(/(?<![\w.])(\d[\d,]*(?:\.\d{1,2})?)(?![\w.])/);
  const digits = withSymbol?.[1] ?? bare?.[1];
  if (digits) {
    const n = Number(digits.replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // Spoken numbers: take the run of number words that sits at the tail, before
  // any money cue word. "she paid twenty-five" → twenty + five.
  const cue = /^(dollars?|bucks?|bucks|paid|gave|sent|got|collected)$/;
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    // "twenty-five" is two number words, so hyphens split too.
    .split(/[\s-]+/)
    .filter(Boolean);
  const cueIndex = words.findIndex((w) => cue.test(w) && !/^(paid|gave|sent|got|collected)$/.test(w));
  const scope = cueIndex >= 0 ? words.slice(0, cueIndex) : words;
  const isNumberWord = (w: string) =>
    w in UNITS || w in TENS || w === 'hundred' || w === 'thousand' || w === 'and' || w === 'a' || w === 'an';
  let end = scope.length - 1;
  while (end >= 0 && !isNumberWord(scope[end])) end--;
  if (end < 0) return null;
  let start = end;
  while (start > 0 && isNumberWord(scope[start - 1])) start--;
  const n = wordsToNumber(scope.slice(start, end + 1));
  return n != null && n > 0 ? n : null;
}

/**
 * How the money arrived. Cash and check are no longer offered in the app, so
 * they land as 'other' exactly as the record-payment sheet does; that keeps one
 * spelling in the ledger. Null when the message does not say.
 */
export function parseMethod(text: string): PaymentMethod | null {
  const t = ` ${text.toLowerCase()} `;
  if (/\bzelle\b/.test(t)) return 'zelle';
  if (/\bvenmo\b/.test(t)) return 'venmo';
  if (/\bcash\s?app\b/.test(t)) return 'cashapp';
  if (/\bpaypal\b/.test(t)) return 'paypal';
  if (/\b(card|credit|debit|visa|mastercard|amex)\b/.test(t)) return 'card';
  if (/\b(bank|wire|ach|transfer)\b/.test(t)) return 'bank';
  if (/\b(cash|cheque|check)\b/.test(t)) return 'other';
  return null;
}

/** The day the money landed: only what the message states. Today is the card's default, not a guess here. */
export function parsePaidOn(text: string, now: Date): string | null {
  if (/\byesterday\b/i.test(text)) return yesterdayString(now);
  if (/\btoday\b/i.test(text)) return localDateString(now);
  return null;
}

/**
 * Is this a payment statement at all? Used only to keep a non-payment message
 * off the payment path when the model's intent and the words disagree — the
 * model still owns routing, and a message with no money cue never proposes one.
 */
export function looksLikePayment(text: string, parsed: { amount: number | null; method: PaymentMethod | null }): boolean {
  if (parsed.amount == null && parsed.method == null) return false;
  const t = text.toLowerCase();
  // Money going IN, already received. "Invoice her 200" / "charge 200" is a job.
  const received = /\b(paid|payed|payment|sent|gave|handed|collected|received|got|zelle'd|venmo'd|settled|cleared)\b/;
  if (!received.test(t)) return false;
  return !/\b(invoice|estimate|quote|bid|proposal|charge|bill)\b/.test(t) || /\b(paid|payment|zelle|venmo)\b/.test(t);
}

export interface OpenInvoice {
  id: string;
  invoiceNo: number | null;
  clientName: string;
  total: number;
  amountPaid: number;
  kind: 'invoice' | 'quote';
  /** ISO created_at; the oldest open invoice is the default. */
  createdAt: string;
}

export interface ParsedPaymentStatement {
  amount: number | null;
  method: PaymentMethod | null;
  paidOn: string | null;
  /** The name the message used, as written. */
  clientName: string | null;
}

/** What the card shows, and whether Confirm can be tapped. */
export interface PaymentResolution {
  /** The name to search the invoice list with. */
  clientName: string | null;
  /** Distinct matching client names, in the order they were found. */
  clientChoices: string[];
  /** This client's open invoices (oldest first). */
  invoiceChoices: OpenInvoice[];
  /** The invoice the card starts on: only when exactly one client matches. */
  invoice: OpenInvoice | null;
  /** Fields the card must ask for before Confirm. */
  needs: ('client' | 'invoice' | 'amount' | 'method')[];
  /** What the chosen invoice still owes. 0 when no invoice is chosen. */
  left: number;
  /** The amount is more than the invoice owes: Confirm stays disabled. */
  overpay: boolean;
}

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Turn "who + how much" into the card's starting state. Ambiguity is reported,
 * never resolved silently: two clients matching, or two open invoices for the
 * one client, both come back as choices for the picker row. The oldest open
 * invoice is preselected only when a single client matched.
 */
export function resolvePayment(input: {
  parsed: ParsedPaymentStatement;
  invoices: OpenInvoice[];
}): PaymentResolution {
  const { parsed, invoices } = input;
  const open = invoices.filter((i) => i.kind === 'invoice' && i.amountPaid < i.total);
  const wanted = parsed.clientName ? key(parsed.clientName) : null;

  let matching: OpenInvoice[] = [];
  if (wanted) {
    const exact = open.filter((i) => key(i.clientName) === wanted);
    matching = exact.length > 0
      ? exact
      : open.filter((i) => key(i.clientName).includes(wanted) || wanted.includes(key(i.clientName)));
  }

  const clientChoices: string[] = [];
  for (const inv of matching) {
    const name = inv.clientName.trim();
    if (name && !clientChoices.some((c) => key(c) === key(name))) clientChoices.push(name);
  }

  const singleClient = clientChoices.length === 1;
  const invoiceChoices = singleClient
    ? matching
        .filter((i) => key(i.clientName) === key(clientChoices[0]))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    : [];

  const invoice = singleClient && invoiceChoices.length > 0 ? invoiceChoices[0] : null;
  const left = invoice ? Math.max(0, invoice.total - invoice.amountPaid) : 0;

  const needs: PaymentResolution['needs'] = [];
  if (!wanted || clientChoices.length === 0) needs.push('client');
  // Two matching clients need a choice, but never a made-up one: the picker is
  // the answer, so this is not a "missing field" — it is the client question.
  if (clientChoices.length > 1) needs.push('client');
  if (clientChoices.length === 1 && invoiceChoices.length === 0) needs.push('invoice');
  if (parsed.amount == null) needs.push('amount');
  if (parsed.method == null) needs.push('method');

  const overpay = invoice != null && parsed.amount != null && parsed.amount > left + 1e-9;

  return {
    clientName: singleClient ? clientChoices[0] : parsed.clientName,
    clientChoices,
    invoiceChoices,
    invoice,
    needs,
    left,
    overpay,
  };
}

/** Confirm is only offered for a resolved invoice, an amount, a method, and no overpayment. */
export function canConfirmPayment(r: PaymentResolution): boolean {
  return Boolean(r.invoice) && r.needs.length === 0 && !r.overpay;
}
