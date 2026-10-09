// Save prompts (UI-REDESIGN-AUDIT §1.5, frames 2a–2c; merge 2 · 2·13, recurring merge 3 · 3·4).
// After a send, a client or item used a second time and not yet saved is
// offered for saving, one prompt at a time from a queue. "Not now" only
// closes the prompt; the next repeat asks again (Q7), so nothing is stored.
import type { LineItem } from '@/lib/ai';
import type { ExpenseCategory } from '@/lib/expenses';
import { money } from '@/lib/financials';
import { anchorFor, firstDueFrom, nextDue, shortDay, type Cadence } from '@/lib/recurring';

export type SavePrompt =
  | { kind: 'client'; key: string; name: string }
  | { kind: 'product'; key: string; name: string; price: number | null }
  /** "Make it recurring?" (§1.5, frame 2c; merge 3 · 3·4): name = the vendor. */
  | { kind: 'recurring'; key: string; name: string; amount: number; cadence: Cadence; category: ExpenseCategory; nextOn: string };

const keyOf = (kind: SavePrompt['kind'], name: string) => `${kind}:${name.trim().toLowerCase()}`;

const isCadence = (v: unknown): v is Cadence => v === 'weekly' || v === 'monthly' || v === 'yearly';

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

/**
 * The recurring prompt from repeat_candidate's row for a just-saved expense.
 * The first charge it will log is the next due date after this one, and never
 * before today (a back-dated receipt must not back-fill).
 */
export function recurringPrompt(
  row: unknown, category: ExpenseCategory, spentOn: string, today: string,
): SavePrompt | null {
  const r = (Array.isArray(row) ? row[0] : row) as { vendor?: unknown; amount?: unknown; cadence?: unknown } | null | undefined;
  const vendor = typeof r?.vendor === 'string' ? r.vendor.trim() : '';
  const amount = Number(r?.amount);
  if (!vendor || !Number.isFinite(amount) || amount <= 0 || !isCadence(r?.cadence)) return null;
  const anchor = anchorFor(r.cadence, spentOn);
  const nextOn = firstDueFrom(nextDue(spentOn, r.cadence, anchor), r.cadence, anchor, today);
  return { kind: 'recurring', key: `${keyOf('recurring', vendor)}:${r.cadence}`, name: vendor, amount, cadence: r.cadence, category, nextOn };
}

/** Add prompts to the queue, skipping any already queued or showing. */
export function enqueue(queue: SavePrompt[], showing: SavePrompt | null, add: SavePrompt[]): SavePrompt[] {
  const seen = new Set([...queue.map((p) => p.key), ...(showing ? [showing.key] : [])]);
  const out = [...queue];
  for (const p of add) if (!seen.has(p.key)) { seen.add(p.key); out.push(p); }
  return out;
}

/** The bot line after a save. */
export function savedLine(p: SavePrompt, today = ''): string {
  if (p.kind === 'recurring') {
    return `Done. ${p.name} is now a ${p.cadence} recurring expense. I'll log ${money(p.amount)} on ${shortDay(p.nextOn, today || p.nextOn)}.`;
  }
  return p.kind === 'client' ? `Saved ${p.name} to Clients.` : `Saved ${p.name} to Products & Services.`;
}
