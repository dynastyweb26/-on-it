// The one line the client page shows under the red "Updated" chip (alive layer
// 06.5): what changed between the version they saw and the one they are looking
// at. Pure. Money is injected so the app's formatting stays the app's.
//   "Therapy Sessions: 1 hr → 2 hr"
//   "Deck repair: $50.00 → $60.00"
//   "Therapy Sessions: 1 hr → 2 hr, and 2 more changes"
import { unitLabel } from '@/lib/line-units';
import type { LineUnit } from '@/lib/line-units';

type Line = { description?: string | null; qty?: number | string | null; unit_price?: number | string | null; unit?: string | null };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const qtyText = (l: Line) => `${num(l.qty)} ${unitLabel((l.unit as LineUnit | null) ?? null)}`;

function describeOne(a: Line | undefined, b: Line | undefined, money: (n: number) => string): string | null {
  if (!a && b) return `${(b.description ?? 'A line').toString().trim() || 'A line'}: added`;
  if (a && !b) return `${(a.description ?? 'A line').toString().trim() || 'A line'}: removed`;
  if (!a || !b) return null;
  const name = (b.description ?? '').toString().trim() || 'A line';
  const parts: string[] = [];
  if ((a.description ?? '') !== (b.description ?? '')) parts.push(`renamed from “${(a.description ?? '').toString().trim()}”`);
  if (num(a.qty) !== num(b.qty) || (a.unit ?? null) !== (b.unit ?? null)) parts.push(`${qtyText(a)} → ${qtyText(b)}`);
  if (num(a.unit_price) !== num(b.unit_price)) parts.push(`${money(num(a.unit_price))} → ${money(num(b.unit_price))}`);
  return parts.length ? `${name}: ${parts.join(', ')}` : null;
}

/** null when no line differs (e.g. only the title or the validity moved). */
export function describeLineChanges(before: Line[], after: Line[], money: (n: number) => string): string | null {
  const out: string[] = [];
  const len = Math.max(before.length, after.length);
  for (let i = 0; i < len; i++) {
    const d = describeOne(before[i], after[i], money);
    if (d) out.push(d);
  }
  if (out.length === 0) return null;
  if (out.length === 1) return out[0];
  return `${out[0]}, and ${out.length - 1} more ${out.length - 1 === 1 ? 'change' : 'changes'}`;
}

/** The whole notice. `who` is the business name (the app does not know the
 *  owner's first name). No pronouns. */
export function updatedNotice(
  who: string,
  previousTotal: number | null,
  total: number,
  detail: string | null,
  money: (n: number) => string,
): { lead: string; bold: string | null; tail: string | null } {
  const lead = `${who.trim() || 'The business'} updated this estimate.`;
  if (previousTotal == null || previousTotal === total) return { lead, bold: null, tail: detail ? `(${detail})` : null };
  return {
    lead,
    bold: `Total changed from ${money(previousTotal)} to ${money(total)}`,
    tail: detail ? `(${detail}).` : '.',
  };
}
