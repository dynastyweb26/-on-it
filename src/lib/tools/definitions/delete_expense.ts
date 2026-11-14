// ═══ Tool · delete_expense (write) ═══
//
// Deleting an expense in the app is a soft delete: expenses.deleted_at is set and
// the row stays for the undo toast (ExpensesPane). This tool does the same, and
// only that: one column, one row, the caller's own.
//
// The card names the expense by vendor and date and shows its amount, which the
// server composes; the amount field stays empty because deleting moves no money.
import { z } from 'zod';
import { defineWriteTool, type ToolContext } from '../contract';
import { ConfirmBatchProps } from '@/lib/templates/props';
import { CATEGORY_LABEL } from '@/lib/expenses';
import { asExpenseRow, expenseCategoryLabel } from '../read';
import { formatDay, isDay, manySentence } from '../write-targets';
import { expensesMatching } from './edit_expense';

export const DELETE_EXPENSE = 'delete_expense';

export const DeleteExpenseInput = z
  .object({
    vendor: z.string().max(120).optional(),
    description: z.string().max(300).optional(),
    spent_on: z.string().max(10).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.vendor?.trim() || v.description?.trim() || v.spent_on?.trim()), {
    message: 'say which expense: its vendor, description or date',
  });

export const DeleteExpenseOutput = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

type Resolved = { id: string; label: string };

const labelOf = (vendor: string | null, description: string | null, day: string): string =>
  [vendor?.trim() || description?.trim() || 'Expense', formatDay(day)].join(' · ');

export const deleteExpenseTool = defineWriteTool({
  name: DELETE_EXPENSE,
  description:
    'Propose deleting ONE logged expense, found by its vendor or description plus the date when the user gave one. The expense is kept in the books but hidden, the same soft delete the app does. It saves nothing: the app shows a card and the owner confirms.',
  input: DeleteExpenseInput,
  output: DeleteExpenseOutput,
  type: 'write',
  risk: 'medium',
  defaultTemplate: { id: 'confirm.batch', props: ConfirmBatchProps },
  prepare: async (ctx, args) => {
    if (args.spent_on?.trim() && !isDay(args.spent_on.trim())) {
      return { ok: false, problem: `"${args.spent_on}" is not a date I can read.` };
    }

    const matches = await expensesMatching(ctx, args);
    if (matches.length === 0) return { ok: false, problem: 'I could not find that expense.' };
    if (matches.length > 1) {
      return {
        ok: false,
        problem: manySentence(
          `I found ${matches.length} expenses`,
          matches.map((row) => labelOf(row.vendor ?? null, row.description ?? null, (row.spent_on ?? '').slice(0, 10))),
        ),
      };
    }

    const row = matches[0];
    const day = (row.spent_on ?? row.created_at ?? '').slice(0, 10);
    const label = labelOf(row.vendor ?? null, row.description ?? null, day);

    return {
      ok: true,
      resolved: { id: row.id, label } satisfies Resolved,
      row: {
        icon: 'delete',
        summary: `Delete expense ${label}`,
        // No figure on a card that moves no money: the category names the row.
        detail: expenseCategoryLabel(row.category),
        amount: '',
        tone: 'neutral',
      },
    };
  },
  execute: async (ctx, resolved) => {
    const r = resolved as Resolved;
    const { data, error } = await ctx.db.select<Record<string, unknown>>('expenses', {
      columns: '*',
      eq: { user_id: ctx.userId, id: r.id },
      limit: 1,
    });
    if (error) throw new Error(error.message);
    const raw = data?.[0];
    if (!raw) return { ok: false, problem: 'That expense is gone now.' };
    const row = asExpenseRow(raw);
    if (row.deleted_at) return { ok: false, problem: 'That expense was already deleted.' };

    const { error: updateError } = await ctx.db.update(
      'expenses',
      { deleted_at: new Date().toISOString() },
      { eq: { id: r.id } },
    );
    if (updateError) throw new Error(updateError.message);

    return { ok: true, result: { id: r.id, label: r.label } };
  },
  fallback: (result) => `Deleted the expense at ${result.label}.`,
  fixture: {
    args: { vendor: 'Shell', spent_on: '2026-11-06' },
    result: { id: 'exp-1', label: 'Shell · Nov 6' },
  },
  preview: {
    resolved: { id: 'owner-expense', label: 'Shell · Nov 6' },
    row: {
      icon: 'delete',
      summary: 'Delete expense Shell · Nov 6',
      detail: CATEGORY_LABEL.fuel,
      amount: '',
      tone: 'neutral',
    },
  },
});
