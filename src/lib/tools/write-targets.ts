// ═══ AI Smart · shared targeting for the write tools ═══
//
// Every write tool has to answer the same two questions before it can propose
// anything: which ONE record did the user mean, and what exactly changes. This
// module holds the parts that would otherwise be copied six times: how a record
// is named, how a day is read, how an old-to-new change is spoken, and how
// several matches are put back to the user as a question.
//
// Nothing here writes. A select plan is scoped to the caller, so RLS plus the
// explicit user_id keep another owner's rows out of every candidate list.
import { formatDocNumber } from '@/lib/documents';
import { normName, toIso } from './read';
import type { ToolContext } from './contract';

/** The document columns these tools read; an estimate is a kind = 'quote' row. */
export type LiveDoc = {
  id: string;
  kind: string;
  invoice_number: number;
  client_name: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  approved_at: string | null;
  converted_from: string | null;
  revoked_at: string | null;
  deleted_at: string | null;
};

export function asDoc(raw: Record<string, unknown>): LiveDoc {
  const n = Number(raw.invoice_number);
  return {
    id: String(raw.id),
    kind: String(raw.kind ?? 'invoice'),
    invoice_number: Number.isFinite(n) ? n : 0,
    client_name: String(raw.client_name ?? ''),
    status: String(raw.status ?? 'draft'),
    due_date: toIso(raw.due_date)?.slice(0, 10) ?? null,
    notes: (raw.notes as string | null) ?? null,
    approved_at: toIso(raw.approved_at),
    converted_from: (raw.converted_from as string | null) ?? null,
    revoked_at: toIso(raw.revoked_at),
    deleted_at: toIso(raw.deleted_at),
  };
}

/** INV-0012 / E-0004: the app's own label for one document. */
export const docLabelOf = (row: Pick<LiveDoc, 'kind' | 'invoice_number'>): string =>
  formatDocNumber(row.kind || 'invoice', row.invoice_number);

/** "Dec 5" from a stored yyyy-mm-dd; "none" when there is no date. */
export function formatDay(value: string | null | undefined): string {
  const iso = (value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'none';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));
}

export const isDay = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** A stored text as one short readable line: "" and null both read "none". */
export function clip(value: string | null | undefined, max = 60): string {
  const text = (value ?? '').trim();
  if (!text) return 'none';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** "Due date on INV-0012: Dec 5 to Dec 12". */
export function changeLine(label: string, before: string, after: string): string {
  return `${label} ${before} to ${after}`;
}

/** One sentence naming up to three matches, so the user can say which. */
export function manySentence(what: string, names: readonly string[]): string {
  const shown = names.slice(0, 3);
  const list = shown.length === 1
    ? shown[0]
    : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  const tail = names.length > shown.length ? ', and more' : '';
  return `${what}: ${list}${tail}. Which one?`;
}

/** Live documents of the caller, narrowed by number and/or exact client name. */
export async function docsMatching(
  ctx: { db: ToolContext['db']; userId: string },
  lookup: { kind?: 'invoice' | 'quote'; number?: number; clientName?: string },
): Promise<LiveDoc[]> {
  const { data, error } = await ctx.db.select<Record<string, unknown>>('invoices', {
    columns: '*',
    eq: { user_id: ctx.userId },
    is: { deleted_at: null },
    order: { column: 'invoice_number', ascending: true },
  });
  if (error) throw new Error(error.message);

  const wanted = lookup.clientName ? normName(lookup.clientName) : null;
  return (data ?? [])
    .map(asDoc)
    .filter((row) => {
      if (row.deleted_at) return false;
      if (lookup.kind && row.kind !== lookup.kind) return false;
      if (lookup.number !== undefined && row.invoice_number !== lookup.number) return false;
      if (wanted !== null && normName(row.client_name) !== wanted) return false;
      return true;
    });
}

/** True when another live document was made from this estimate. */
export async function wasConverted(
  ctx: { db: ToolContext['db']; userId: string },
  estimateId: string,
): Promise<boolean> {
  const { data, error } = await ctx.db.select<{ id: string }>('invoices', {
    columns: 'id',
    eq: { user_id: ctx.userId, converted_from: estimateId },
    is: { deleted_at: null },
    limit: 1,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** True when the document has any ledger row against it, a payment included. */
export async function hasPayment(
  ctx: { db: ToolContext['db']; userId: string },
  invoiceId: string,
): Promise<boolean> {
  const { data, error } = await ctx.db.select<{ id: string }>('invoice_payments', {
    columns: 'id',
    eq: { user_id: ctx.userId, invoice_id: invoiceId },
    limit: 1,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
