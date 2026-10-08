// The open template survives leaving Chat, a reload, and iOS killing the
// PWA in the background (merge 2 · 2·11a): its state is written to
// localStorage on every change and restored when Chat opens. It expires
// after 24 h, and is cleared when the template is closed or sent. Scoped to
// the signed-in user (or guest), so a shared device never shows one
// person's half-built invoice to another.
import { isLineUnit } from '@/lib/line-units';
import type { TemplateClient, TemplateItem, TemplateKind } from '@/lib/template';

const KEY = 'onit-template-v1';
const ROW_KEY = 'onit-template-row-v1';
export const TEMPLATE_TTL_MS = 24 * 60 * 60 * 1000;

export type StoredTemplate = {
  v: 1;
  uid: string | null;
  savedAt: number;
  kind: TemplateKind;
  client: TemplateClient | null;
  items: TemplateItem[];
  /** Extra info text (2·12a). */
  extra: string;
};

const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : null);
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Parse + validate a stored value. Anything malformed, stale or another user's → null. */
export function parseStored(raw: string | null, uid: string | null, now: number): StoredTemplate | null {
  if (!raw) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || o.v !== 1 || (o.kind !== 'invoice' && o.kind !== 'quote')) return null;
  if ((o.uid ?? null) !== uid) return null;
  const savedAt = num(o.savedAt);
  if (savedAt == null || now - savedAt > TEMPLATE_TTL_MS || savedAt > now + 60_000) return null;
  const c = o.client as Record<string, unknown> | null;
  const client: TemplateClient | null = c && typeof c === 'object' && str(c.name, 120)
    ? { name: str(c.name, 120)!, id: str(c.id, 64), address: str(c.address, 300), phone: str(c.phone, 30) }
    : null;
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, 50).flatMap((x): TemplateItem[] => {
    if (!x || typeof x !== 'object') return [];
    const r = x as Record<string, unknown>;
    const key = str(r.key, 40);
    if (!key) return [];
    const qty = num(r.qty);
    return [{
      key,
      name: str(r.name, 120) ?? '',
      unit: isLineUnit(r.unit) ? r.unit : null,
      unit_price: num(r.unit_price),
      qty: qty != null && qty > 0 ? qty : 1,
      detail: str(r.detail, 300),
      priceSet: r.priceSet === true,
    }];
  });
  if (items.length === 0) return null;
  return { v: 1, uid, savedAt, kind: o.kind, client, items, extra: str(o.extra, 500) ?? '' };
}

export function loadTemplate(uid: string | null): StoredTemplate | null {
  try {
    const t = parseStored(localStorage.getItem(KEY), uid, Date.now());
    if (!t) localStorage.removeItem(KEY);
    return t;
  } catch { return null; }
}

export function saveTemplate(t: Omit<StoredTemplate, 'v' | 'savedAt'>): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...t, v: 1, savedAt: Date.now() })); } catch { /* storage full / blocked */ }
}

export function clearTemplate(): void {
  try { localStorage.removeItem(KEY); localStorage.removeItem(ROW_KEY); } catch { /* blocked */ }
}

// The template's pre-built draft row (2·12c). A template conversation has no
// messages yet, so the chat's own store doesn't keep it; without this link a
// template restored after leaving Chat would insert a second row at Send, and
// a replaced one couldn't soft-delete its draft. Same uid scope and expiry.
export type TemplateRow = { convoId: string; id: string; no: number };

export function parseStoredRow(raw: string | null, uid: string | null, now: number): TemplateRow | null {
  if (!raw) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || (o.uid ?? null) !== uid) return null;
  const savedAt = num(o.savedAt);
  if (savedAt == null || now - savedAt > TEMPLATE_TTL_MS || savedAt > now + 60_000) return null;
  const convoId = str(o.convoId, 64);
  const id = str(o.id, 64);
  const no = num(o.no);
  return convoId && id && no != null ? { convoId, id, no } : null;
}

export function loadTemplateRow(uid: string | null): TemplateRow | null {
  try { return parseStoredRow(localStorage.getItem(ROW_KEY), uid, Date.now()); } catch { return null; }
}

export function clearTemplateRow(): void {
  try { localStorage.removeItem(ROW_KEY); } catch { /* blocked */ }
}

export function saveTemplateRow(uid: string | null, row: TemplateRow): void {
  try { localStorage.setItem(ROW_KEY, JSON.stringify({ ...row, uid, savedAt: Date.now() })); } catch { /* storage full / blocked */ }
}

/** 2·13a: the confirm's title when a fresh template would replace this one —
 *  only when it has a client or a named item; null = nothing worth keeping. */
export function unfinishedTitle(t: Pick<StoredTemplate, 'kind' | 'client' | 'items'>): string | null {
  if (!t.client && !t.items.some((x) => x.name.trim())) return null;
  const noun = t.kind === 'quote' ? 'quote' : 'invoice';
  return t.client ? `You have an unfinished ${noun} for ${t.client.name}` : `You have an unfinished ${noun}`;
}
