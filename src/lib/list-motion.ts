// List motion (merge 2 · 2·14, UI-REDESIGN-AUDIT §4). A newly saved client or
// item glows in its A–Z slot the next time its list shows: whoever saves it
// (the New forms, the chat's save prompt) marks it here, and the list takes
// the mark once. sessionStorage, 2-minute life; failures are silent.
export type EntryList = 'clients' | 'products';

const KEY = 'onit-new-entry';
const TTL_MS = 2 * 60 * 1000;

/** Parse a stored mark: the key for `list` if fresh, else null. */
export function parseEntry(raw: string | null, list: EntryList, now: number): string | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { list?: unknown; key?: unknown; at?: unknown };
    if (o.list !== list || typeof o.key !== 'string' || !o.key || typeof o.at !== 'number') return null;
    return now - o.at <= TTL_MS && o.at <= now + 60_000 ? o.key : null;
  } catch { return null; }
}

/** Clients mark by id; products by name key (an insert doesn't return the id). */
export function markNewEntry(list: EntryList, key: string): void {
  try { sessionStorage.setItem(KEY, JSON.stringify({ list, key, at: Date.now() })); } catch { /* blocked */ }
}

export function takeNewEntry(list: EntryList): string | null {
  try {
    const key = parseEntry(sessionStorage.getItem(KEY), list, Date.now());
    if (key) sessionStorage.removeItem(KEY);
    return key;
  } catch { return null; }
}

/** JS-driven motion checks this; the CSS kill switch only reaches CSS animations. */
export function reducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
