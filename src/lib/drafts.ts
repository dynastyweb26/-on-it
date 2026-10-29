// ═══ Drafts: unsaved text that survives leaving a form ═══
//
// A draft is the half-filled form, not app data. It is keyed per user AND per
// form (`client:new`, `client:<id>`, `product:new`, …) so two records never
// share one, and so the next account at this device can never read it.
//
// Rules (UX audit #11):
//   - Written as the user types (debounced by the hook in use-form-draft).
//   - Restored quietly: no popup, no navigation. A small note at most.
//   - Cleared on submit and on sign-out. Sign-out clears through the SAME
//     listener that clears the display cache (lib/auth-client.ts).
//   - Never used for passwords, card/bank/routing numbers, or anything
//     payment-related. Those fields are excluded by their forms, not here.
//   - A draft older than a week is dropped on read: a half-typed client from a
//     month ago is a surprise, not a courtesy.

import { webStorage } from '@/lib/cache';

const PREFIX = 'onit-draft:v1';
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60_000;

export interface DraftEntry<T> {
  v: T;
  at: number;
}

export function draftKey(userId: string, scope: string): string {
  return `${PREFIX}:${userId}:${scope}`;
}

/** True when a form has anything worth keeping. Empty forms are not drafted. */
export function hasDraftContent(value: Record<string, unknown> | null | undefined): boolean {
  if (!value) return false;
  return Object.values(value).some((v) => {
    if (typeof v === 'string') return v.trim().length > 0;
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v === 'boolean') return true;
    if (Array.isArray(v)) return v.length > 0;
    return v != null && typeof v === 'object';
  });
}

export function readDraft<T>(userId: string, scope: string): DraftEntry<T> | null {
  const s = webStorage();
  if (!s) return null;
  const key = draftKey(userId, scope);
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as DraftEntry<T>;
    if (!entry || typeof entry.at !== 'number' || !('v' in entry)) {
      s.removeItem(key);
      return null;
    }
    if (Date.now() - entry.at > DRAFT_TTL_MS) {
      s.removeItem(key);
      return null;
    }
    return entry;
  } catch {
    try { s.removeItem(key); } catch { /* ignore */ }
    return null;
  }
}

export function saveDraft<T>(userId: string, scope: string, value: T): void {
  const s = webStorage();
  if (!s) return;
  try {
    s.setItem(draftKey(userId, scope), JSON.stringify({ v: value, at: Date.now() }));
  } catch {
    // Quota or blocked storage: a draft is a convenience, never a failure.
  }
}

export function clearDraft(userId: string, scope: string): void {
  const s = webStorage();
  if (!s) return;
  try { s.removeItem(draftKey(userId, scope)); } catch { /* ignore */ }
}

export function clearAllDrafts(): void {
  const s = webStorage();
  if (!s) return;
  const prefix = `${PREFIX}:`;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) s.removeItem(k);
  } catch { /* ignore */ }
}

/**
 * The one sign-out hook for drafts, called from the same auth listener that
 * clears the cache: the sign-out button, an expired refresh token and a
 * cross-tab sign-out all arrive as SIGNED_OUT.
 */
export function handleDraftAuthChange(event: string | null | undefined): void {
  if (event === 'SIGNED_OUT') clearAllDrafts();
}
