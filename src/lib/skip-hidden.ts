// Skip notices the owner already added by hand from the Books banner (3·5):
// hidden on this device only (skipKey = item + skipped date, so a later skip
// on the same item shows again). Client-only; storage failures hide nothing.
const KEY = 'onit-skip-hidden';

export function readHiddenSkips(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]); } catch { return new Set(); }
}

export function hideSkip(key: string): Set<string> {
  try {
    const kept = [key, ...[...readHiddenSkips()].filter((k) => k !== key)].slice(0, 100);
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch { /* storage blocked: the notice stays */ }
  return readHiddenSkips();
}
