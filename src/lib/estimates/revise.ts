// A chat Revise on a sent estimate changes the SAME document (4A): same row,
// number and public link. The card stages the owner's changes and one confirmed
// revise becomes ONE edits call — never an insert, never a new token.
import type { ExtractResult } from '@/lib/ai';
import { requestEstimateEdits, type EstimateEditsOutcome } from './owner-actions';

/** Why a sent estimate cannot be revised, or null when it can. */
export type ReviseBlock = 'signed' | 'converted' | null;

export function reviseBlock(input: { approvedAt?: string | null; converted?: boolean }): ReviseBlock {
  if (input.approvedAt) return 'signed';
  if (input.converted) return 'converted';
  return null;
}

/** The card's own lock line. Verbatim app copy, no new wording. */
export function reviseBlockedLine(block: ReviseBlock): string | null {
  if (block === 'signed') return 'This estimate is signed and locked.';
  if (block === 'converted') return 'This estimate was converted, so it is locked.';
  return null;
}

/**
 * Offered only on a shared, unsigned, unconverted estimate that nobody has paid
 * against. Signed and converted are refused before the tap; the edits route's
 * 409 stays the backup.
 */
export function canReviseEstimate(input: {
  kind: 'invoice' | 'quote';
  status: string | null;
  amountPaid: number;
  approvedAt?: string | null;
  converted?: boolean;
}): boolean {
  if (input.kind !== 'quote') return false;
  if (input.status !== 'sent') return false;
  if (input.amountPaid > 0) return false;
  return reviseBlock(input) === null;
}

/**
 * The content fields a staged revise carries. Client identity (name, address,
 * phone, email) is deliberately absent: it is not content, the row keeps the
 * client it was sent to.
 */
export type RevisionFields = {
  title: string | null;
  line_items: unknown[];
  notes: string | null;
  tax_rate: number;
  deposit_type: 'none' | 'fixed' | 'percentage';
  deposit_value: number | null;
  due_date: string | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function revisionFieldsFromDraft(draft: Partial<ExtractResult>): RevisionFields {
  const r = draft as Record<string, unknown>;
  const tax = Number(r.tax_rate);
  const depositValue = Number(r.deposit_value);
  const deposit = r.deposit_type;
  return {
    title: typeof r.title === 'string' && r.title.trim() ? r.title : null,
    line_items: Array.isArray(r.line_items) ? (r.line_items as unknown[]) : [],
    notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes : null,
    tax_rate: Number.isFinite(tax) ? tax : 0,
    deposit_type: deposit === 'fixed' || deposit === 'percentage' ? deposit : 'none',
    deposit_value: Number.isFinite(depositValue) && depositValue > 0 ? depositValue : null,
    due_date: typeof r.due_date === 'string' && ISO_DAY.test(r.due_date) ? r.due_date : null,
  };
}

/**
 * ONE call per confirmed revision. The edits route turns it into one UPDATE, so
 * bump_estimate_version bumps the version exactly once for the whole revision.
 */
export function saveEstimateRevision(id: string, fields: RevisionFields): Promise<EstimateEditsOutcome> {
  return requestEstimateEdits(id, {
    title: fields.title,
    lineItems: fields.line_items,
    notes: fields.notes,
    taxRate: fields.tax_rate,
    depositType: fields.deposit_type,
    depositValue: fields.deposit_value,
    dueDate: fields.due_date,
  });
}
