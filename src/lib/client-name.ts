// The client's match key, mirroring the database's generated
// clients.name_key = lower(btrim(name)) (migration 20261003000001).
// btrim() with no second argument strips spaces only — not tabs or newlines —
// so this does the same rather than String.prototype.trim().
export function clientNameKey(name: string): string {
  return name.replace(/^ +| +$/g, '').toLowerCase();
}
