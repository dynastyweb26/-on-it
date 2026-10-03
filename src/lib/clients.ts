// Saved clients: the Clients tab list (release frames 3a / 3d) reads one row
// per client from client_summaries() (migration 20261003000001).
import { money } from '@/lib/financials';

export type ClientSummary = {
  id: string;
  name: string;
  saved: boolean;
  doc_count: number;
  invoice_count: number;
  quote_count: number;
  open_count: number;
  open_balance: number;
  overdue_count: number;
  overdue_balance: number;
  quotes_out: number;
  total_paid: number;
  last_used_at: string | null;
};

/** PostgREST returns numeric columns as strings; normalise one RPC row. */
export function normalizeSummary(r: Record<string, unknown>): ClientSummary {
  const n = (v: unknown) => Number(v ?? 0) || 0;
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    saved: Boolean(r.saved),
    doc_count: n(r.doc_count),
    invoice_count: n(r.invoice_count),
    quote_count: n(r.quote_count),
    open_count: n(r.open_count),
    open_balance: n(r.open_balance),
    overdue_count: n(r.overdue_count),
    overdue_balance: n(r.overdue_balance),
    quotes_out: n(r.quotes_out),
    total_paid: n(r.total_paid),
    last_used_at: (r.last_used_at as string | null) ?? null,
  };
}

/** The row's status line. Overdue wins, then open, then quotes out. */
export function clientStatus(c: ClientSummary): { text: string; tone: 'overdue' | 'normal' } {
  if (c.overdue_count > 0) return { text: `${c.overdue_count} overdue · ${money(c.overdue_balance)}`, tone: 'overdue' };
  if (c.open_count > 0) return { text: `${c.open_count} open · ${money(c.open_balance)}`, tone: 'normal' };
  if (c.quotes_out > 0) return { text: `${c.quotes_out} ${c.quotes_out === 1 ? 'quote' : 'quotes'} out`, tone: 'normal' };
  if (c.doc_count > 0) return { text: 'Paid up', tone: 'normal' };
  return { text: 'No invoices yet', tone: 'normal' };
}

/** "Dan Okafor" → "DO"; one word → its first two letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export const RAIL_LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

/** The A–Z header a name files under; digits and symbols go under "#". */
export function letterOf(name: string): string {
  const ch = name.trim().charAt(0).normalize('NFD').charAt(0).toUpperCase();
  return ch >= 'A' && ch <= 'Z' ? ch : '#';
}

/** A–Z groups (case-insensitive), "#" last. Empty letters are left out. */
export function groupByLetter<T>(rows: T[], nameOf: (r: T) => string): { letter: string; rows: T[] }[] {
  const sorted = [...rows].sort((a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' }));
  const map = new Map<string, T[]>();
  for (const r of sorted) {
    const l = letterOf(nameOf(r));
    if (!map.has(l)) map.set(l, []);
    map.get(l)!.push(r);
  }
  return RAIL_LETTERS.filter((l) => map.has(l)).map((letter) => ({ letter, rows: map.get(letter)! }));
}

/** Live search: every word of the query must appear in the name. */
export function matchesQuery(name: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hay = name.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** "Mike is on 2 invoices already. Both will link to this client." */
export function usageNote(first: string, invoices: number, quotes: number): string | null {
  const n = invoices + quotes;
  if (n === 0) return null;
  const parts = [
    invoices ? `${invoices} ${invoices === 1 ? 'invoice' : 'invoices'}` : '',
    quotes ? `${quotes} ${quotes === 1 ? 'quote' : 'quotes'}` : '',
  ].filter(Boolean).join(' and ');
  const tail = n === 1 ? 'It will link to this client.' : n === 2 ? 'Both will link to this client.' : `All ${n} will link to this client.`;
  return `${first} is on ${parts} already. ${tail}`;
}
