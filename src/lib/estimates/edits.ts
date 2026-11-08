// Which content fields an in-place estimate edit may change, and how a batch of
// them becomes ONE update row.
//
// The list is deliberately small. A chat revise can also re-parse the client's
// name and contact details, but identity is not content: client_name,
// client_address, client_phone and client_email never travel through this route
// (the edit reuses the row's own snapshot). Neither do invoice_number,
// public_token, status, kind or finalize_key — those are server-owned, and a
// revision keeps the same number and link.
import { z } from 'zod';
import { calculateInvoiceTotals, type DepositType, type FinancialLineItem } from '@/lib/financials';

export const EditsBody = z
  .object({
    title: z.string().max(120).nullable().optional(),
    line_items: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
    notes: z.string().max(4000).nullable().optional(),
    tax_rate: z.number().min(0).max(100).optional(),
    deposit_type: z.enum(['none', 'fixed', 'percentage']).nullable().optional(),
    deposit_value: z.number().min(0).nullable().optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  // Strict on purpose: an unknown key (client_email, public_token, …) is a
  // rejected request, not a silently ignored field.
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to save' });

export type EditsInput = z.infer<typeof EditsBody>;

/** The row facts the patch needs (the document's own settings, as stored). */
export type EditableRow = {
  tax_rate: number | string | null;
  deposit_type: string | null;
  deposit_value: number | string | null;
  line_items: unknown;
};

/**
 * One statement's worth of columns. Totals are recomputed from the line items
 * with the tax rate and deposit the save is leaving behind (the new ones when
 * the batch changes them, the row's own otherwise), so the stored totals can
 * never disagree with the stored items.
 */
export function buildEditsPatch(row: EditableRow, edits: EditsInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (edits.title !== undefined) {
    // An empty or whitespace-only heading clears it; the column stays NULL.
    patch.title = (edits.title ?? '').trim() || null;
  }
  if (edits.notes !== undefined) patch.notes = (edits.notes ?? '').trim() || null;
  if (edits.due_date !== undefined) patch.due_date = edits.due_date;
  if (edits.tax_rate !== undefined) patch.tax_rate = edits.tax_rate;
  if (edits.deposit_type !== undefined) patch.deposit_type = edits.deposit_type ?? 'none';
  if (edits.deposit_value !== undefined) patch.deposit_value = edits.deposit_value;
  if (edits.line_items !== undefined) patch.line_items = edits.line_items;

  const touchesTotals = edits.line_items !== undefined
    || edits.tax_rate !== undefined
    || edits.deposit_type !== undefined
    || edits.deposit_value !== undefined;
  if (touchesTotals) {
    const items = (edits.line_items ?? row.line_items ?? []) as FinancialLineItem[];
    const taxRate = edits.tax_rate ?? Number(row.tax_rate ?? 0);
    const depositType = ((edits.deposit_type ?? row.deposit_type ?? 'none') as DepositType);
    const depositValue = edits.deposit_value
      ?? (row.deposit_value == null ? 0 : Number(row.deposit_value));
    const totals = calculateInvoiceTotals(items, taxRate, depositType, depositValue);
    patch.subtotal = totals.subtotal;
    patch.tax_amount = totals.taxAmount;
    patch.total = totals.total;
    patch.deposit_amount = totals.depositAmount;
  }
  return patch;
}
