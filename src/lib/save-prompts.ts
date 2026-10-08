// Save prompts (UI-REDESIGN-AUDIT §1.5, frames 2a / 2b; merge 2 · 2·13).
// After a send, a client or item used a second time and not yet saved is
// offered for saving, one prompt at a time from a queue. "Not now" only
// closes the prompt; the next repeat asks again (Q7), so nothing is stored.
import type { LineItem } from '@/lib/ai';

export type SavePrompt =
  | { kind: 'client'; key: string; name: string }
  | { kind: 'product'; key: string; name: string; price: number | null };

const keyOf = (kind: SavePrompt['kind'], name: string) => `${kind}:${name.trim().toLowerCase()}`;

/** Client prompt: unsaved, and this is at least its 2nd document (invoices + quotes). */
export function clientPrompt(
  client: { name: string; saved: boolean } | null,
  usage: { invoices: number; quotes: number } | null,
): SavePrompt | null {
  if (!client || client.saved || !usage || usage.invoices + usage.quotes < 2) return null;
  return { kind: 'client', key: keyOf('client', client.name), name: client.name };
}

/** Item prompts from record_product_use's unsaved-and-used-twice names, priced from the sent lines. */
export function productPrompts(names: unknown, lines: LineItem[]): SavePrompt[] {
  if (!Array.isArray(names)) return [];
  const byName = new Map(lines.map((li) => [li.description.trim().toLowerCase(), li]));
  return names.flatMap((n): SavePrompt[] => {
    const name = typeof n === 'string' ? n.trim() : '';
    if (!name) return [];
    const li = byName.get(name.toLowerCase());
    return [{ kind: 'product', key: keyOf('product', name), name, price: li ? li.unit_price : null }];
  });
}

/** Add prompts to the queue, skipping any already queued or showing. */
export function enqueue(queue: SavePrompt[], showing: SavePrompt | null, add: SavePrompt[]): SavePrompt[] {
  const seen = new Set([...queue.map((p) => p.key), ...(showing ? [showing.key] : [])]);
  const out = [...queue];
  for (const p of add) if (!seen.has(p.key)) { seen.add(p.key); out.push(p); }
  return out;
}

/** The bot line after a save. */
export function savedLine(p: SavePrompt): string {
  return p.kind === 'client' ? `Saved ${p.name} to Clients.` : `Saved ${p.name} to Products & Services.`;
}
