// Saved products & services (release frames 3e / 3f / 3g; migration
// 20261003000002). One row per owner per case-insensitive name.
import { money } from '@/lib/financials';

export const UNITS = ['each', 'hour', 'sq ft', 'job'] as const;
export type Unit = (typeof UNITS)[number];
export const isUnit = (u: unknown): u is Unit => UNITS.includes(u as Unit);

export type Product = {
  id: string;
  name: string;
  unit: Unit;
  unit_price: number | null;
  detail: string | null;
  use_count: number;
  last_used_at: string | null;
};

export const PRODUCT_COLS = 'id, name, unit, unit_price, detail, use_count, last_used_at';

export function normalizeProduct(r: Record<string, unknown>): Product {
  const price = r.unit_price == null ? null : Number(r.unit_price);
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    unit: isUnit(r.unit) ? r.unit : 'each',
    unit_price: price != null && Number.isFinite(price) ? price : null,
    detail: (r.detail as string | null) || null,
    use_count: Number(r.use_count ?? 0) || 0,
    last_used_at: (r.last_used_at as string | null) ?? null,
  };
}

/** "$450.00", "$65.00/hr", "$3.25/sq ft"; null when there is no price. */
export function priceText(p: Pick<Product, 'unit' | 'unit_price'>): string | null {
  if (p.unit_price == null) return null;
  const suffix = p.unit === 'hour' ? '/hr' : p.unit === 'sq ft' ? '/sq ft' : '';
  return money(p.unit_price) + suffix;
}

/** "Hang, level and adjust · per each" */
export function productSubtitle(p: Pick<Product, 'unit' | 'detail'>): string {
  return [p.detail?.trim(), `per ${p.unit}`].filter(Boolean).join(' · ');
}

/** "Used on 3 invoices · last on Oct 2" */
export function usedLine(p: Pick<Product, 'use_count' | 'last_used_at'>): string {
  if (p.use_count <= 0) return 'Not on an invoice yet';
  const n = `Used on ${p.use_count} ${p.use_count === 1 ? 'invoice' : 'invoices'}`;
  if (!p.last_used_at) return n;
  const d = new Date(p.last_used_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${n} · last on ${d}`;
}

/** Price field text → number. '' → null (no price); unreadable or out of range → NaN. */
export function parsePrice(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '');
  if (!t) return null;
  if (!/^\d{1,8}(\.\d{0,2})?$/.test(t)) return NaN;
  const n = Number(t);
  return n <= 10_000_000 ? n : NaN;
}

/** "Deck staining (copy)", then "(copy 2)", … — the first name not taken. */
export function copyName(name: string, taken: Iterable<string>): string {
  const keys = new Set([...taken].map((t) => t.trim().toLowerCase()));
  const base = `${name.trim()} (copy)`;
  if (!keys.has(base.toLowerCase())) return base.slice(0, 120);
  for (let i = 2; i < 1000; i++) {
    const n = `${name.trim()} (copy ${i})`;
    if (!keys.has(n.toLowerCase())) return n.slice(0, 120);
  }
  return base.slice(0, 120);
}
