// The guided invoice / quote template (UI-REDESIGN-AUDIT §1.4; merge 2 ·
// 2·10–2·12). A template is a locally seeded draft: the user fills a client
// and items by tapping, nothing is parsed, and nothing is written until Send.
import type { LineUnit } from '@/lib/line-units';
import type { ClientSummary } from '@/lib/clients';

export type TemplateKind = 'invoice' | 'quote';

/** The client slot: a saved client, an unsaved history client, or a new name. */
export type TemplateClient = {
  name: string;
  id: string | null;
  address: string | null;
  phone: string | null;
};

/** One item row. name '' = the dashed "Product/Service" slot. */
export type TemplateItem = {
  key: string;
  name: string;
  unit: LineUnit | null;
  unit_price: number | null;
  qty: number;
  detail: string | null;
  /** The price was set on the keypad (2·11a): a restore never overwrites it. */
  priceSet?: boolean;
};

let seq = 0;
export function emptyItem(): TemplateItem {
  seq += 1;
  return { key: `i${Date.now().toString(36)}${seq}`, name: '', unit: null, unit_price: null, qty: 1, detail: null };
}

const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "Used once · Sep 18", "Used 3 times · Sep 18". */
export function usedBeforeLine(count: number, lastIso: string | null): string {
  const n = count <= 1 ? 'Used once' : count === 2 ? 'Used twice' : `Used ${count} times`;
  return lastIso ? `${n} · ${shortDay(lastIso)}` : n;
}

/** Unsaved client history stays in the picker for this many days. */
export const UNSAVED_CLIENT_HISTORY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A history row is visible through day 7; it hides once it is over 7 days old. */
export function clientHistoryVisible(
  lastUsedAt: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!lastUsedAt) return true;
  const usedMs = Date.parse(lastUsedAt);
  // A malformed date should never hide a row by accident.
  if (!Number.isFinite(usedMs)) return true;
  return nowMs - usedMs <= UNSAVED_CLIENT_HISTORY_DAYS * DAY_MS;
}

/** Split unsaved history into the default list and the search-only rows. */
export function splitClientHistory<T extends { last_used_at: string | null }>(
  rows: T[],
  nowMs: number = Date.now(),
): { visible: T[]; hidden: T[] } {
  const visible: T[] = [];
  const hidden: T[] = [];
  for (const row of rows) {
    (clientHistoryVisible(row.last_used_at, nowMs) ? visible : hidden).push(row);
  }
  return { visible, hidden };
}

/** A saved client's line in the Client sheet: "4 invoices", "2 invoices · 1 quote". */
export function clientDocsLine(c: Pick<ClientSummary, 'invoice_count' | 'quote_count'>): string {
  const parts = [
    c.invoice_count ? `${c.invoice_count} ${c.invoice_count === 1 ? 'invoice' : 'invoices'}` : '',
    c.quote_count ? `${c.quote_count} ${c.quote_count === 1 ? 'quote' : 'quotes'}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No invoices yet';
}

/** Does any name in the list equal the query (case- and space-insensitive)? */
export function hasExactName(names: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  return !!q && names.some((n) => n.trim().toLowerCase() === q);
}

/** The client chip's second line (2·10d): what will print on the document. */
export function clientContactLine(c: Pick<TemplateClient, 'address' | 'phone'>): string {
  const address = (c.address ?? '').replace(/\s*\n\s*/g, ', ').trim();
  const phone = (c.phone ?? '').trim();
  const parts = [address, phone].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No address or phone on file';
}
