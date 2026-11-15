// ═══ Tool · delete_draft (write) ═══
//
// Deleting a draft in the app is a soft delete on the document row, guarded to
// status = 'draft' (InvoicesView / InvoiceDetailScreen). This tool does the same
// and refuses everything else: sent, paid, void, a signed estimate, a converted
// estimate, or a document with any ledger row on it.
//
// Found by its number, or by its client when that client has exactly one draft;
// several drafts are reported so the user can say which.
import { z } from 'zod';
import { defineWriteTool, type ToolContext } from '../contract';
import { ConfirmBatchProps } from '@/lib/templates/props';
import { docNoun } from '@/lib/documents';
import { resolveClient } from '../read';
import {
  asDoc,
  docByNumber,
  docLabelOf,
  docsMatching,
  hasPayment,
  manySentence,
  wasConverted,
  type LiveDoc,
} from '../write-targets';

export const DELETE_DRAFT = 'delete_draft';

export const DeleteDraftInput = z
  .object({
    number: z.number().int().min(1).max(1_000_000).optional(),
    /** Invoices and estimates number apart: kind settles a shared number. */
    kind: z.enum(['invoice', 'estimate']).optional(),
    client: z.string().min(1).max(120).optional(),
  })
  .strict()
  .refine((v) => v.number !== undefined || Boolean(v.client?.trim()), {
    message: 'say which document: its number, or its client',
  });

export const DeleteDraftOutput = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

type Resolved = { id: string; label: string; clientName: string; kind: string };

/** Why this document cannot be deleted, or null when it is a plain draft. */
async function draftProblem(ctx: ToolContext, row: LiveDoc): Promise<string | null> {
  const label = docLabelOf(row);
  if (row.status !== 'draft') return `${label} is ${row.status}, so I cannot delete it.`;
  if (row.kind === 'quote' && row.approved_at) return `${label} was signed, so keep it.`;
  if (await wasConverted(ctx, row.id)) return `${label} was turned into an invoice, so keep it.`;
  if (await hasPayment(ctx, row.id)) return `${label} has a payment on it, so keep it.`;
  return null;
}

export const deleteDraftTool = defineWriteTool({
  name: DELETE_DRAFT,
  description:
    'Propose deleting ONE draft invoice or estimate, found by its number (with its kind when an invoice and an estimate share that number) or by its client. It refuses anything sent, paid, signed, converted or carrying a payment, and says why. Deleting is the app’s soft delete: the row is kept but hidden. It saves nothing: the app shows a card and the owner confirms.',
  input: DeleteDraftInput,
  output: DeleteDraftOutput,
  type: 'write',
  risk: 'medium',
  defaultTemplate: { id: 'confirm.batch', props: ConfirmBatchProps },
  prepare: async (ctx, args) => {
    let row: LiveDoc | null = null;

    if (args.number !== undefined) {
      const found = await docByNumber(ctx, args.number, args.kind);
      if (!found.ok) return { ok: false, problem: found.problem };
      row = found.doc;
      const problem = await draftProblem(ctx, row);
      if (problem) return { ok: false, problem };
    } else {
      const said = args.client!.trim();
      const resolution = await resolveClient(ctx, said);
      if (resolution.kind === 'none') return { ok: false, problem: `No client named ${said}.` };
      if (resolution.kind === 'many') {
        return { ok: false, problem: manySentence(`More than one client matches "${said}"`, resolution.names) };
      }

      const drafts = (await docsMatching(ctx, { clientName: resolution.name }))
        .filter((doc) => doc.status === 'draft')
        .filter((doc) => !args.kind || docNoun(doc.kind).toLowerCase() === args.kind);
      if (drafts.length === 0) return { ok: false, problem: `There is no draft for ${resolution.name}.` };
      if (drafts.length > 1) {
        return {
          ok: false,
          problem: manySentence(
            `I found ${drafts.length} drafts for ${resolution.name}`,
            drafts.map((doc) => docLabelOf(doc)),
          ),
        };
      }
      row = drafts[0];
      const problem = await draftProblem(ctx, row);
      if (problem) return { ok: false, problem };
    }

    const label = docLabelOf(row);
    return {
      ok: true,
      resolved: { id: row.id, label, clientName: row.client_name, kind: row.kind } satisfies Resolved,
      row: {
        icon: 'delete',
        summary: `Delete draft ${label} for ${row.client_name}`,
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
    if (row.deleted_at) return { ok: false, problem: 'That document was already deleted.' };
    if (row.status !== 'draft' || row.kind !== r.kind) {
      return { ok: false, problem: `${r.label} changed since I looked. Ask me again.` };
    }
    const problem = await draftProblem(ctx, row);
    if (problem) return { ok: false, problem };

    const { error: updateError } = await ctx.db.update(
      'invoices',
      { deleted_at: new Date().toISOString() },
      { eq: { id: r.id } },
    );
    if (updateError) throw new Error(updateError.message);

    return { ok: true, result: { id: r.id, label: r.label } };
  },
  fallback: (result) => `Deleted draft ${result.label}.`,
  fixture: {
    args: { number: 12 },
    result: { id: 'inv-12', label: 'INV-0012' },
  },
  preview: {
    resolved: { id: 'owner-draft', label: 'INV-0012', clientName: 'Maria Santos', kind: 'invoice' },
    row: {
      icon: 'delete',
      summary: 'Delete draft INV-0012 for Maria Santos',
      amount: '',
      tone: 'neutral',
    },
  },
});
