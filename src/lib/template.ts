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
