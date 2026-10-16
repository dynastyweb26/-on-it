// Pasted service notes → invoice parts. A tech pastes a work card like
//
//   10/5 ~ SC WO# 366060664 ~ tortilla warmer will not turn on
//   Upon inspection I found the following:
//   1. Damaged thermostat
//   Tech ~ Dean
//   Hatco thermostat
//   P# 02-16-039 ~ C$56 ~ L$80
//
// and this module sorts it deterministically, so the guarantees don't rest on
// the model: only priced lines become line items, the item text is copied as
// written (part numbers included), the list/sell price is billed and the cost
// price never reaches any field. The model still writes the reply and the
// client name; /api/parse overrides its line items and notes with these.
//
// Sorting of the non-priced text:
//   customer-facing (notes, printed): job title (the reported problem), one
//     "Work performed:" line of the findings, "Reference:" for WO numbers
//   private (private_notes, never printed): tech/manager names, Notes: lines,
//     anything else left over
//   nowhere: cost prices (C$ / cost)
import type { LineUnit } from '@/lib/line-units';

export interface PastedItem {
  description: string;
  qty: number;
  unit_price: number;
  unit: LineUnit;
  detail?: string;
}

export interface PastedNotes {
  items: PastedItem[];
  /** Cost prices seen on the card — billed nowhere, shown nowhere. */
  costPrices: number[];
  /** A list/sell price appeared, so the paste is an invoice, not an expense. */
  hasSellPrice: boolean;
  jobTitle: string | null;
  findings: string[];
  reference: string | null;
  privateLines: string[];
}

const NUM = String.raw`(\d+(?:,\d{3})*(?:\.\d+)?)`;
const SELL_RE = new RegExp(String.raw`(?:\bL\s?\$|\b(?:list|sell)\b\s*[:=]?\s*\$?)\s*${NUM}`, 'gi');
const COST_RE = new RegExp(String.raw`(?:\bC\s?\$|\bcost\b\s*[:=]?\s*\$?)\s*${NUM}`, 'gi');
const PLAIN_RE = new RegExp(String.raw`\$\s*${NUM}`, 'g');

const ROLE_RE = /^(?:techs?|technicians?|mods?|managers?|mgrs?|supervisors?|sup|gm)\b\s*[~:\-–—]*\s*/i;
const NOTES_RE = /^notes?\s*[:~\-–—]/i;
const FILLER_RE = /\b(?:upon|after)\s+(?:inspection|arrival|diagnosis)\b|\bfound the following\b/i;
const FINDING_RE = /^(?:\d+\s*[.)]|[-*•])\s+(.+)$/;
// A short all-caps area tag above its findings ("WIC", "WIF", "RTU 2").
const AREA_RE = /^[A-Z][A-Z0-9 /&-]{0,9}$/;
const WO_RE = /\b(?:WO|W\/O|work\s+order)\s*#?\s*[:\-]?\s*[A-Z0-9-]*\d[A-Z0-9-]*/i;
const DATE_RE = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b\s*/;
const QTY_UNIT_RE = /\b(\d+(?:\.\d+)?)\s*(sq\.?\s?ft\.?|sqft|square\s+f(?:ee|oo)t|sf|hrs?|hours?|ea|each)\b/i;
const SEP_RE = /^[\s~|/·,;:\-–—]+|[\s~|/·,;:\-–—]+$/g;

const toNum = (s: string) => Number(s.replace(/,/g, ''));

function unitFrom(raw: string): LineUnit {
  const u = raw.toLowerCase().replace(/\s+/g, ' ');
  if (/^(?:hrs?|hours?)$/.test(u)) return 'hour';
  if (/^(?:ea|each)$/.test(u)) return 'each';
  return 'sq ft';
}

/** Price tokens on one line: sell, cost, and unlabeled `$N` amounts. */
function pricesOn(line: string): { sell: number[]; cost: number[]; plain: number[]; rest: string } {
  const sell: number[] = [];
  const cost: number[] = [];
  let rest = line
    .replace(SELL_RE, (_, n: string) => { sell.push(toNum(n)); return ' '; })
    .replace(COST_RE, (_, n: string) => { cost.push(toNum(n)); return ' '; });
  const plain: number[] = [];
  rest = rest.replace(PLAIN_RE, (_, n: string) => { plain.push(toNum(n)); return ' '; });
  rest = rest.replace(/\s{2,}/g, ' ').replace(/(?:\s*[~|]\s*)+/g, ' ~ ').replace(SEP_RE, '');
  return { sell, cost, plain, rest };
}

/** True when a message looks like a pasted work card rather than a spoken job:
 *  it carries cost/list price tags, or it is several lines with work-card
 *  structure (findings list, tech/manager line, WO#, "found the following"). */
export function isPastedNotes(text: string): boolean {
  if (/\b[CL]\s?\$\s*\d/.test(text) || /\bcost\s*\/\s*(?:list|sell)\b/i.test(text)) return true;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  return lines.some((l) => FINDING_RE.test(l) || ROLE_RE.test(l) || FILLER_RE.test(l) || WO_RE.test(l));
}

export function parsePastedNotes(text: string): PastedNotes {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const out: PastedNotes = {
    items: [], costPrices: [], hasSellPrice: false,
    jobTitle: null, findings: [], reference: null, privateLines: [],
  };
  // A plain line that may turn out to be the name of the priced line below it.
  let pending: string | null = null;
  let area: string | null = null;
  let headerDone = false;
  const flushPending = () => { if (pending != null) out.privateLines.push(pending); pending = null; };

  for (const line of lines) {
    const p = pricesOn(line);
    out.costPrices.push(...p.cost);
    // Names and narrative go private before any price reading, so a stray
    // "sell" or "$" in a Notes: sentence never becomes a line item.
    if (ROLE_RE.test(line) || NOTES_RE.test(line)) { flushPending(); out.privateLines.push(line); continue; }
    if (p.sell.length) out.hasSellPrice = true;
    // Billed price: the list/sell price; else, with several unlabeled amounts
    // on one line (cost/list written bare), the largest; else the one amount.
    const billed = p.sell.length ? p.sell[p.sell.length - 1]
      : p.plain.length ? Math.max(...p.plain) : null;
    if (!p.sell.length && p.plain.length > 1) out.costPrices.push(...p.plain.filter((n) => n !== billed));

    if (billed != null && Number.isFinite(billed)) {
      headerDone = true;
      let description: string;
      let detail: string | undefined;
      if (pending != null) {
        description = pending;
        detail = p.rest || undefined;
        pending = null;
      } else {
        // A priced finding ("1. Replaced fan motor $120") drops its list marker.
        description = p.rest.match(FINDING_RE)?.[1].trim() ?? p.rest;
      }
      if (!description) continue; // a bare price with nothing to name it
      const qu = (detail ?? description).match(QTY_UNIT_RE) ?? description.match(QTY_UNIT_RE);
      out.items.push({
        description,
        qty: qu ? Number(qu[1]) : 1,
        unit: qu ? unitFrom(qu[2]) : 'each',
        unit_price: billed,
        ...(detail ? { detail } : {}),
      });
      continue;
    }
    if (p.cost.length) {
      // A cost with no sell price: never billed, never shown. The rest of the
      // line (a part number) is private.
      flushPending();
      if (p.rest) out.privateLines.push(p.rest);
      continue;
    }

    if (FILLER_RE.test(line)) { flushPending(); headerDone = true; continue; }
    const f = line.match(FINDING_RE);
    if (f) {
      flushPending();
      headerDone = true;
      out.findings.push(area ? `${area}: ${f[1].trim()}` : f[1].trim());
      continue;
    }
    if (!headerDone) {
      headerDone = true;
      parseHeader(line, out);
      continue;
    }
    if (AREA_RE.test(line) && out.items.length === 0) { flushPending(); area = line; continue; }
    flushPending();
    pending = line;
  }
  flushPending();
  return out;
}

/** "10/5 ~ SC WO# 366060664 ~ tortilla warmer will not turn on" → date and
 *  store code private, WO# to Reference, the problem as the job title. */
function parseHeader(line: string, out: PastedNotes) {
  const parts = line.split(/\s*[~|]\s*/).map((s) => s.trim()).filter(Boolean);
  const titleParts: string[] = [];
  for (let part of parts) {
    const date = part.match(DATE_RE);
    if (date) {
      out.privateLines.push(date[0].trim());
      part = part.slice(date[0].length).trim();
    }
    const wo = part.match(WO_RE);
    if (wo) {
      out.reference = out.reference ? `${out.reference}, ${wo[0].trim()}` : wo[0].trim();
      const left = part.replace(wo[0], ' ').replace(/\s{2,}/g, ' ').replace(SEP_RE, '');
      if (left) out.privateLines.push(left);
      continue;
    }
    if (part) titleParts.push(part);
  }
  // The problem is the last free-text segment; earlier stray ones are private.
  if (titleParts.length) {
    out.jobTitle = titleParts[titleParts.length - 1];
    out.privateLines.push(...titleParts.slice(0, -1));
  }
}

/** Customer-facing notes text, or null when the card had none. */
export function customerNotes(p: PastedNotes): string | null {
  const lines: string[] = [];
  if (p.jobTitle) lines.push(p.jobTitle);
  if (p.findings.length) lines.push(`Work performed: ${p.findings.join('; ')}`);
  if (p.reference) lines.push(`Reference: ${p.reference}`);
  return lines.length ? scrubCostPrices(lines.join('\n'), p.costPrices) || null : null;
}

/** Private notes text (saved on the invoice, never printed), or null. */
export function privateNotes(p: PastedNotes): string | null {
  const t = scrubCostPrices(p.privateLines.join('\n'), p.costPrices);
  return t ? t : null;
}

/** Strip every cost-price token (C$56, cost $56) and any "$" mention of a
 *  known cost figure ("$56", "$27.30") from text bound for any field. A bare
 *  number with no "$" is left alone: it can't be told from a qty or a WO#. */
export function scrubCostPrices(text: string, costPrices: number[]): string {
  let s = text.replace(COST_RE, '');
  for (const c of new Set(costPrices)) {
    const cents = c.toFixed(2);
    // Longest form first so "$27.30" goes whole, not as "$27.3" + "0".
    for (const f of new Set([cents, cents.replace(/0$/, ''), cents.replace(/\.00$/, '')])) {
      s = s.replace(new RegExp(String.raw`\$\s?${f.replace('.', '\\.')}(?!\d|\.\d)`, 'g'), '');
    }
  }
  return s.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1').trim();
}

// ── /api/parse guard ───────────────────────────────────────────────
// The model reads the paste too, but these rules are enforced here so a model
// slip can't bill a cost price, invent a price, or turn the reported problem
// into a line item. Pure: /api/parse calls it, the fixtures test it.

export const LABOR_QUESTION = 'Any labor charge on this?';
export const PRICES_QUESTION = 'What are the prices on this one?';
const LABOR_ITEM_RE = /\b(?:labou?r|service\s+(?:call|charge|fee)|trip\s+(?:charge|fee)|diagnostic|call[\s-]?out)\b/i;

interface GuardItem { description: string; qty: number; unit_price: number | null; unit?: LineUnit | null; detail?: string | null }
interface GuardResult {
  intent: 'invoice' | 'quote' | 'expense' | 'question' | 'other';
  intent_explicit: boolean;
  client_name: string | null;
  line_items: GuardItem[];
  notes: string | null;
  private_notes?: string | null;
  expense: unknown;
  missing: string[];
  reply: string;
  ready: boolean;
}

export interface PasteContext {
  /** This turn's message is itself a paste. */
  latest: PastedNotes | null;
  /** Every paste in the conversation, latest last. */
  all: PastedNotes[];
  costPrices: number[];
  latestUserText: string;
  laborAsked: boolean;
}

/** The paste context for a conversation, or null when nothing was pasted. */
export function pasteContext(
  history: { role: string; content: string }[],
): PasteContext | null {
  const users = history.filter((m) => m.role === 'user').map((m) => m.content);
  const all = users.filter(isPastedNotes).map(parsePastedNotes);
  if (!all.length) return null;
  const latestUserText = users[users.length - 1] ?? '';
  return {
    latest: isPastedNotes(latestUserText) ? parsePastedNotes(latestUserText) : null,
    all,
    costPrices: all.flatMap((p) => p.costPrices),
    latestUserText,
    laborAsked: history.some((m) => m.role === 'assistant' && m.content.includes(LABOR_QUESTION)),
  };
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Step 1, before line-item normalization: on the paste turn the card's priced
 *  lines ARE the line items (whatever the model returned); on later turns a
 *  pasted item keeps its list price and its part number, the reported problem
 *  is never an item, and a cost-price figure the user didn't just say is
 *  dropped. Sets intent and the two notes fields on the paste turn. */
export function applyPasteItems<R extends GuardResult>(result: R, ctx: PasteContext, draftIntent?: string | null): R {
  const titles = new Set(ctx.all.map((p) => norm(p.jobTitle)).filter(Boolean));
  if (ctx.latest) {
    const p = ctx.latest;
    result.line_items = p.items.map((i) => ({ ...i }));
    if (result.intent !== 'quote' && (p.hasSellPrice || p.items.length || result.intent !== 'expense')) {
      const intent = draftIntent === 'quote' ? 'quote' : 'invoice';
      if (result.intent !== intent) { result.intent = intent; result.intent_explicit = true; }
      result.expense = null;
    }
    result.notes = customerNotes(p);
    result.private_notes = privateNotes(p);
  } else {
    const pasted = new Map(ctx.all.flatMap((p) => p.items).map((i) => [norm(i.description), i]));
    const saidNow = (n: number) => [String(n), n.toFixed(2)].some((f) =>
      new RegExp(String.raw`(?<![\d.])${f.replace('.', '\\.')}(?!\d)`).test(ctx.latestUserText));
    const costs = new Set(ctx.costPrices);
    result.line_items = (Array.isArray(result.line_items) ? result.line_items : [])
      .map((li) => {
        const src = pasted.get(norm(li?.description));
        return src ? { ...li, unit_price: src.unit_price, unit: li.unit ?? src.unit, ...(src.detail ? { detail: src.detail } : {}) } : li;
      })
      .filter((li) => !titles.has(norm(li?.description)))
      .filter((li) => {
        if (pasted.has(norm(li?.description))) return true;
        const price = Number(li?.unit_price);
        return !(Number.isFinite(price) && costs.has(price) && !saidNow(price));
      });
  }
  return result;
}

/** Step 2, after the client-name guard: ask for prices when none were found
 *  (never invent one), ask once about labor, and scrub every cost price from
 *  everything the user or their customer can see. */
export function applyPasteReplies<R extends GuardResult>(result: R, ctx: PasteContext): R {
  const items = Array.isArray(result.line_items) ? result.line_items : [];
  const docIntent = result.intent === 'invoice' || result.intent === 'quote';
  const addMissing = (k: string) => { result.missing = Array.from(new Set([...(Array.isArray(result.missing) ? result.missing : []), k])); };
  const onIt = (q: string) => (/^\s*on it!/i.test(result.reply ?? '') || ctx.latest ? `On it! ${q}` : q);

  if (docIntent && items.length === 0) {
    result.ready = false;
    addMissing('price');
    if (ctx.latest) {
      result.reply = onIt(PRICES_QUESTION);
    } else {
      // An answer that names no figure ("look at the prices") asks again with
      // the item named rather than guessing.
      const p = ctx.all[ctx.all.length - 1];
      const what = p.findings[0]?.replace(/^[^:]{1,10}:\s*/, '') ?? p.jobTitle;
      result.reply = what ? `I still need a price. How much for ${what.charAt(0).toLowerCase()}${what.slice(1)}?` : PRICES_QUESTION;
    }
  } else if (docIntent && result.client_name && !ctx.laborAsked
    && items.every((li) => li.unit_price != null && Number.isFinite(Number(li.unit_price)))
    && !items.some((li) => LABOR_ITEM_RE.test(li.description ?? ''))) {
    result.ready = false;
    addMissing('labor');
    result.reply = LABOR_QUESTION;
  }

  const scrub = (s: string | null | undefined) => (typeof s === 'string' ? scrubCostPrices(s, ctx.costPrices) : s ?? null);
  // A reply sentence that names a cost figure goes whole (a scrubbed "The
  // thermostat was." reads worse than nothing). On the paste turn, a model
  // question about bill-vs-expense is replaced: list prices mean invoice.
  let reply = (result.reply ?? '')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => scrubCostPrices(s, ctx.costPrices) === s.trim())
    .join(' ')
    .trim();
  if (ctx.latest && docIntent && /\bexpense\b|\bpaid (?:for )?(?:it|that|this)\b/i.test(reply)) {
    reply = result.client_name ? 'On it!' : "On it! Who's this for?";
  }
  result.reply = reply || (result.client_name ? 'On it!' : "On it! Who's this for?");
  result.notes = scrub(result.notes);
  if (result.private_notes != null) result.private_notes = scrub(result.private_notes);
  result.line_items = items.map((li) => ({
    ...li,
    description: scrub(li.description) ?? '',
    ...(li.detail != null ? { detail: scrub(li.detail) } : {}),
  }));
  return result;
}
