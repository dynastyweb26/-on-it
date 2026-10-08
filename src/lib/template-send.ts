// Template → the chat's draft (merge 2 · 2·12b). The template is a locally
// seeded draft: once it's complete it becomes the chat's `draft` with
// ready = true, and the chat's own pipeline takes over — the background
// pre-build (row + PDF), finalize() at Send (paywall, client upsert, the
// synchronous iOS share), the sent confirmation and history.
import type { ExtractResult, LineItem } from '@/lib/ai';
import { money } from '@/lib/financials';
import { parseExtraInfo } from '@/lib/extra-info';
import { qtyText } from '@/lib/line-units';
import type { TemplateClient, TemplateItem, TemplateKind } from '@/lib/template';

/** The chat draft for a complete template; null while it isn't sendable (Q3). */
export function templateToDraft(
  kind: TemplateKind, client: TemplateClient | null, items: TemplateItem[], extra: string, today: Date = new Date(),
): Partial<ExtractResult> | null {
  const named = items.filter((x) => x.name.trim());
  if (!client || named.length === 0 || named.some((x) => x.unit_price == null)) return null;
  const info = parseExtraInfo(extra, today);
  const line_items: LineItem[] = named.map((x) => ({
    description: x.name.trim(),
    qty: x.qty,
    unit_price: x.unit_price!,
    ...(x.unit ? { unit: x.unit } : {}),
    ...(x.detail ? { detail: x.detail } : {}),
  }));
  return {
    intent: kind,
    intent_explicit: true,
    client_name: client.name,
    client_address: client.address,
    client_phone: client.phone,
    line_items,
    tax_rate: 0,                        // templates go out without tax (§1.4)
    due_date: info.due,                 // null → finalize's +30-day default
    notes: extra.trim() || null,
    deposit_type: info.deposit?.type ?? 'none',
    deposit_value: info.deposit?.value ?? null,
    expense: null,
    missing: [],
    reply: '',
    ready: true,
  };
}

/** The user-turn summary bubble: "Invoice for Mike Davis: Deck staining $450.00, Labor 3 hr × $40.00". */
export function templateSummary(d: Partial<ExtractResult>): string {
  const noun = d.intent === 'quote' ? 'Quote' : 'Invoice';
  const lines = ((d.line_items ?? []) as LineItem[]).map((li) =>
    li.qty === 1 && (!li.unit || li.unit === 'each' || li.unit === 'job')
      ? `${li.description} ${money(li.unit_price)}`
      : `${li.description} ${qtyText(li.qty, li.unit)} × ${money(li.unit_price)}`);
  return `${noun} for ${d.client_name}: ${lines.join(', ')}`;
}

/** Escape LIKE wildcards so a name is matched literally by ilike. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
