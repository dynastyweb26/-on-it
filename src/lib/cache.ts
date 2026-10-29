// ═══ Per-user, timestamped, expiring cache for list metadata ═══
//
// What it is for: a returning user sees the list they saw last time instantly
// while the network answer is fetched behind it. It is a display cache, never a
// source of truth — a failed refresh must leave it on screen rather than
// replace it with an empty list.
//
// Rules (UX audit #3):
//   - Keyed per user. Another account on the same device can never read these.
//   - Every entry carries `at` (when written) and `exp` (when it goes stale).
//   - Cleared from ONE place on sign-out — `handleAuthChange` below, wired to
//     the shared Supabase auth listener in lib/auth-client.ts. SIGNED_OUT fires
//     for the sign-out button, an expired refresh token, and a cross-tab
//     sign-out, so all three clear here.
//   - Never for signed URLs (receipts, vault), payment/bank/payout screens,
//     credentials, or anything that must be exact (amounts are only ever shown
//     with a short expiry and always refreshed behind).
//
// Failures are silent by design: a full/blocked storage must never break a
// screen, so every operation is best-effort and returns null on any problem.

export type CacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** One entry as stored: value, write time (ms), expiry time (ms). */
export interface CacheEntry<T> {
  v: T;
  at: number;
  exp: number;
}

const PREFIX = 'onit-cache:v1';

/** Storage override for tests (and for environments without localStorage). */
let override: CacheStorage | null | undefined;

function store(): CacheStorage | null {
  if (override !== undefined) return override;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    window.localStorage.setItem(`${PREFIX}:probe`, '1');
    window.localStorage.removeItem(`${PREFIX}:probe`);
    return window.localStorage;
  } catch {
    // Safari private mode, or storage disabled by the user.
    return null;
  }
}

export function configureCacheStorage(s: CacheStorage | null): void {
  override = s;
}

export function resetCacheStorage(): void {
  override = undefined;
}

/**
 * The browser storage this app writes display-only data to (the display cache
 * here, form drafts in lib/drafts). Tests inject it with
 * configureCacheStorage() so both share one fake.
 */
export function webStorage(): CacheStorage | null {
  return store();
}

/**
 * How long each kind stays usable. Money moves, so totals and anything that
 * carries payment status are short; plain list metadata can live longer.
 * Nothing here is authoritative: every screen refreshes behind the cached copy.
 */
export const CACHE_TTL = {
  /** Invoice list: carries status + amount_paid. */
  invoices: 5 * 60_000,
  /** Books totals, summary figures: balances. */
  money: 2 * 60_000,
  /** Clients, expenses, recurring, item history: names and metadata. */
  lists: 12 * 60 * 60_000,
} as const;

export function cacheKey(userId: string, name: string): string {
  return `${PREFIX}:${userId}:${name}`;
}

/** The whole entry, for screens that want to show "updated 3m ago". */
export function readCacheEntry<T>(userId: string, name: string): CacheEntry<T> | null {
  const s = store();
  if (!s) return null;
  const key = cacheKey(userId, name);
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.at !== 'number' || typeof entry.exp !== 'number') {
      s.removeItem(key);
      return null;
    }
    if (Date.now() > entry.exp) {
      s.removeItem(key);
      return null;
    }
    return entry;
  } catch {
    // Corrupt JSON: drop it, never throw into a render.
    try { s.removeItem(key); } catch { /* ignore */ }
    return null;
  }
}

export function readCache<T>(userId: string, name: string): T | null {
  return readCacheEntry<T>(userId, name)?.v ?? null;
}

export function writeCache<T>(userId: string, name: string, value: T, ttlMs: number): void {
  const s = store();
  if (!s) return;
  const now = Date.now();
  try {
    s.setItem(cacheKey(userId, name), JSON.stringify({ v: value, at: now, exp: now + ttlMs }));
  } catch {
    // Quota exceeded: the cache is optional, so drop this write.
  }
}

/** Remove every entry for one user (account switch, "clear my data"). */
export function clearUserCache(userId: string): void {
  const s = store();
  if (!s) return;
  const prefix = `${PREFIX}:${userId}:`;
  for (const key of allKeys(s)) {
    if (key.startsWith(prefix)) {
      try { s.removeItem(key); } catch { /* ignore */ }
    }
  }
}

/** Remove every On It cache entry, whoever it belongs to. */
export function clearAllCache(): void {
  const s = store();
  if (!s) return;
  for (const key of allKeys(s)) {
    if (key.startsWith(`${PREFIX}:`)) {
      try { s.removeItem(key); } catch { /* ignore */ }
    }
  }
}

function allKeys(s: CacheStorage): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (k) keys.push(k);
    }
  } catch { /* ignore */ }
  return keys;
}

/**
 * The single sign-out hook, called from lib/auth-client.ts on every auth state
 * change. Supabase reports SIGNED_OUT for the sign-out button, an expired or
 * revoked refresh token, and a sign-out in another tab — all three must drop
 * the cache, because the next person at this device may be someone else.
 * TOKEN_REFRESHED (the normal hourly rotation) must NOT clear it.
 */
export function handleAuthChange(event: string | null | undefined): void {
  if (event === 'SIGNED_OUT') clearAllCache();
}
