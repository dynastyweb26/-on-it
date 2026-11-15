// ═══ Tool · edit_document_details (write) ═══
//
// The detail screen writes invoices.due_date and invoices.notes directly, gated
// on the document being a draft; an estimate stays editable until it is signed,
// revoked or converted (isOwnerEditable + guard_locked_estimate_edits). This tool
// writes exactly those two columns inside exactly that window. Line items,
// amounts and money are not part of its input at all.
import { z } from 'zod';
import { defineWriteTool } from '../contract';
import { ConfirmBatchProps } from '@/lib/templates/props';
import { docNoun } from '@/lib/documents';
import { resolveClient } from '../read';
import {
  asDoc,
  changeLine,
  clip,
  docByNumber,
  docLabelOf,
  docsMatching,
  formatDay,
  isDay,
  manySentence,
  wasConverted,
  type LiveDoc,
} from '../write-targets';

export const EDIT_DOCUMENT_DETAILS = 'edit_document_details';

export const EditDocumentDetailsInput = z
  .object({
    number: z.number().int().min(1).max(1_000_000).optional(),
    /** Invoices and estimates number apart: kind settles a shared number. */
    kind: z.enum(['invoice', 'estimate']).optional(),
    client: z.string().min(1).max(120).optional(),
    /** yyyy-mm-dd; an empty string clears the due date. */
    due_date: z.string().max(10).optional(),
    /** An empty string clears the notes. */
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .refine((v) => v.number !== undefined || Boolean(v.client?.trim()), {
    message: 'say which invoice or estimate: its number, or its client',
  })
  .refine((v) => v.due_date !== undefined || v.notes !== undefined, {
    message: 'say what to change: the due date or the notes',
  });

export const EditDocumentDetailsOutput = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

type Resolved = {
  id: string;
  label: string;
  kind: string;
  oldDue: string | null;
  oldNotes: string | null;
  due: string | null;
  notes: string | null;
};

/** Why these two columns cannot change on this document, or null when they can. */
async function detailsProblem(
  ctx: Parameters<typeof wasConverted>[0],
  row: LiveDoc,
): Promise<string | null> {
  const label = docLabelOf(row);
  if (row.kind === 'quote') {
    if (row.approved_at) return `${label} was signed, so its details cannot change.`;
    if (row.revoked_at) return `${label} was revoked, so its details cannot change.`;
    if (await wasConverted(ctx, row.id)) return `${label} was turned into an invoice, so its details cannot change.`;
    return null;
  }
  if (row.status !== 'draft') return `${label} is ${row.status}, so its details cannot change.`;
  return null;
}

export const editDocumentDetailsTool = defineWriteTool({
  name: EDIT_DOCUMENT_DETAILS,
  description:
    'Propose changing the due date and/or the customer-facing notes on ONE invoice or estimate, found by its number (with its kind when an invoice and an estimate share that number) or by its client. Invoices are editable only while they are drafts; estimates until they are signed, revoked or converted. It cannot change line items, prices or amounts. It saves nothing: the app shows a card and the owner confirms.',
  input: EditDocumentDetailsInput,
  output: EditDocumentDetailsOutput,
  type: 'write',
  risk: 'medium',
  defaultTemplate: { id: 'confirm.batch', props: ConfirmBatchProps },
  prepare: async (ctx, args) => {
    if (args.due_date?.trim() && !isDay(args.due_date.trim())) {
      return { ok: false, problem: `"${args.due_date}" is not a date I can read.` };
    }

    let row: LiveDoc | null = null;
    if (args.number !== undefined) {
      const found = await docByNumber(ctx, args.number, args.kind);
      if (!found.ok) return { ok: false, problem: found.problem };
      row = found.doc;
    } else {
      const said = args.client!.trim();
      const resolution = await resolveClient(ctx, said);
      if (resolution.kind === 'none') return { ok: false, problem: `No client named ${said}.` };
      if (resolution.kind === 'many') {
        return { ok: false, problem: manySentence(`More than one client matches "${said}"`, resolution.names) };
      }
      const docs = (await docsMatching(ctx, { clientName: resolution.name }))
        .filter((doc) => !args.kind || docNoun(doc.kind).toLowerCase() === args.kind);
      if (docs.length === 0) return { ok: false, problem: `No invoice or estimate for ${resolution.name}.` };
      if (docs.length > 1) {
        return {
          ok: false,
          problem: manySentence(
            `I found ${docs.length} documents for ${resolution.name}`,
            docs.map((doc) => `${docLabelOf(doc)} · ${doc.status}`),
          ),
        };
      }
      row = docs[0];
    }

    const problem = await detailsProblem(ctx, row);
    if (problem) return { ok: false, problem };

    const label = docLabelOf(row);
    const oldDue = row.due_date ?? null;
    const oldNotes = row.notes ?? null;
    const due = args.due_date !== undefined ? (args.due_date.trim() || null) : oldDue;
    const notes = args.notes !== undefined ? (args.notes.trim() || null) : oldNotes;

    const changes: string[] = [];
    if (due !== oldDue) changes.push(changeLine(`Due date on ${label}:`, formatDay(oldDue), formatDay(due)));
    if (notes !== oldNotes) changes.push(`Notes on ${label}: ${clip(oldNotes, 40)} to ${clip(notes, 40)}`);
    if (changes.length === 0) return { ok: false, problem: `Nothing to change on ${label}.` };

    return {
      ok: true,
      resolved: { id: row.id, label, kind: row.kind, oldDue, oldNotes, due, notes } satisfies Resolved,
      row: {
        icon: 'edit_note',
        summary: changes.join(' · '),
        amount: '',
        tone: 'neutral',
      },
    };
  },
  execute: async (ctx, resolved) => {
    const r = resolved as Resolved;
    const { data, error } = await ctx.db.select<Record<string, unknown>>('invoices', {
      columns: '*',
      eq: { user_id: ctx.userId, id: r.id },
      limit: 1,
    });
    if (error) throw new Error(error.message);
    const raw = data?.[0];
    if (!raw) return { ok: false, problem: 'That document is gone now.' };

    const row = asDoc(raw);
    if (row.deleted_at) return { ok: false, problem: 'That document was deleted.' };
    if (row.kind !== r.kind) return { ok: false, problem: `${r.label} changed since I looked. Ask me again.` };

    const problem = await detailsProblem(ctx, row);
    if (problem) return { ok: false, problem };
    if ((row.due_date ?? null) !== r.oldDue || (row.notes ?? null) !== r.oldNotes) {
      return { ok: false, problem: `${r.label} changed since I looked. Ask me again.` };
    }

    const { error: updateError } = await ctx.db.update(
      'invoices',
      { due_date: r.due, notes: r.notes },
      { eq: { id: r.id } },
    );
    if (updateError) throw new Error(updateError.message);

    return { ok: true, result: { id: r.id, label: r.label } };
  },
  fallback: (result) => `Changed ${result.label}.`,
  fixture: {
    args: { number: 12, due_date: '2026-12-12' },
    result: { id: 'inv-12', label: 'INV-0012' },
  },
  preview: {
    resolved: {
      id: 'owner-draft', label: 'INV-0012', kind: 'invoice',
      oldDue: '2026-12-05', oldNotes: 'Thanks', due: '2026-12-12', notes: 'Thanks',
    },
    row: {
      icon: 'edit_note',
      summary: 'Due date on INV-0012: Dec 5 to Dec 12',
      amount: '',
      tone: 'neutral',
    },
  },
});
