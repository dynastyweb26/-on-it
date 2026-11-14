// ═══ Tool · edit_expense (write) ═══
//
// The app logs and soft-deletes expenses; this is the first way to CHANGE one.
// It writes the four columns the expense form itself sets (vendor, category,
// spent_on, description) and nothing else: the amount is a money change and is
// deliberately not accepted, so a strict input schema refuses it outright.
//
// The category a person says is forgiving (gas → fuel, meals → food) through the
// same helper list_expenses uses, and an unknown word is a sentence, never a
// silent 'other'.
import { z } from 'zod';
import { defineWriteTool, type ToolContext } from '../contract';
import { ConfirmBatchProps } from '@/lib/templates/props';
import { CATEGORY_LABEL, isExpenseCategory, type ExpenseCategory } from '@/lib/expenses';
import {
  asExpenseRow,
  expenseDay,
  forgivingCategory,
  nameMatches,
  type ExpenseRow,
} from '../read';
import { changeLine, clip, formatDay, isDay, manySentence } from '../write-targets';

export const EDIT_EXPENSE = 'edit_expense';

export const EditExpenseInput = z
  .object({
    /** Who/which: any of these narrow the one expense. */
    vendor: z.string().max(120).optional(),
    description: z.string().max(300).optional(),
    /** yyyy-mm-dd as the user said it. */
    spent_on: z.string().max(10).optional(),
    new_vendor: z.string().max(120).optional(),
    new_description: z.string().max(300).optional(),
    new_category: z.string().max(60).optional(),
    new_date: z.string().max(10).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.vendor?.trim() || v.description?.trim() || v.spent_on?.trim()), {
    message: 'say which expense: its vendor, description or date',
  })
  .refine(
    (v) => v.new_vendor !== undefined || v.new_description !== undefined
      || v.new_category !== undefined || v.new_date !== undefined,
    { message: 'say what to change' },
  );

export const EditExpenseOutput = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

type Resolved = {
  id: string;
  label: string;
  old: { vendor: string | null; description: string | null; category: ExpenseCategory; spent_on: string };
  next: { vendor: string | null; description: string | null; category: ExpenseCategory; spent_on: string };
};

const categoryOf = (row: ExpenseRow): ExpenseCategory =>
  isExpenseCategory(row.category) ? row.category : 'other';

const expenseLabel = (row: ExpenseRow): string =>
  [row.vendor?.trim() || row.description?.trim() || 'Expense', formatDay(expenseDay(row))].join(' · ');

async function liveExpenses(ctx: ToolContext): Promise<ExpenseRow[]> {
  const { data, error } = await ctx.db.select<ExpenseRow>('expenses', {
    columns: '*',
    eq: { user_id: ctx.userId },
    is: { deleted_at: null },
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(asExpenseRow).filter((row) => !row.deleted_at);
}

/** The expenses matching what the user said, in the order the table returned them. */
export async function expensesMatching(
  ctx: ToolContext,
  said: { vendor?: string; description?: string; spent_on?: string },
): Promise<ExpenseRow[]> {
  const vendor = said.vendor?.trim();
  const description = said.description?.trim();
  const day = said.spent_on?.trim();
  return (await liveExpenses(ctx)).filter((row) => {
    if (vendor && !nameMatches(vendor, row.vendor ?? '')) return false;
    if (description && !nameMatches(description, row.description ?? '')) return false;
    if (day && expenseDay(row) !== day) return false;
    return true;
  });
}

export const editExpenseTool = defineWriteTool({
  name: EDIT_EXPENSE,
  description:
    'Propose changing ONE logged expense’s vendor, category, date or description. It cannot change the amount. The expense is found by its vendor or description, plus the date when the user gave one; several matches are reported so the user can say which. It saves nothing: the app shows a card and the owner confirms.',
  input: EditExpenseInput,
  output: EditExpenseOutput,
  type: 'write',
  risk: 'medium',
  defaultTemplate: { id: 'confirm.batch', props: ConfirmBatchProps },
  prepare: async (ctx, args) => {
    if (args.spent_on?.trim() && !isDay(args.spent_on.trim())) {
      return { ok: false, problem: `"${args.spent_on}" is not a date I can read.` };
    }
    if (args.new_date?.trim() && !isDay(args.new_date.trim())) {
      return { ok: false, problem: `"${args.new_date}" is not a date I can read.` };
    }

    let category: ExpenseCategory | undefined;
    if (args.new_category?.trim()) {
      const forgiving = forgivingCategory(args.new_category);
      if (!forgiving.category) {
        return { ok: false, problem: `I do not know the category "${args.new_category.trim()}".` };
      }
      category = forgiving.category;
    }

    const matches = await expensesMatching(ctx, args);
    if (matches.length === 0) return { ok: false, problem: 'I could not find that expense.' };
    if (matches.length > 1) {
      return { ok: false, problem: manySentence(`I found ${matches.length} expenses`, matches.map(expenseLabel)) };
    }

    const row = matches[0];
    const old = {
      vendor: row.vendor?.trim() || null,
      description: row.description?.trim() || null,
      category: categoryOf(row),
      spent_on: expenseDay(row),
    };
    const next = {
      vendor: args.new_vendor !== undefined ? (args.new_vendor.trim() || null) : old.vendor,
      description: args.new_description !== undefined ? (args.new_description.trim() || null) : old.description,
      category: category ?? old.category,
      spent_on: args.new_date?.trim() || old.spent_on,
    };

    const changes: string[] = [];
    if (next.vendor !== old.vendor) changes.push(changeLine('vendor', old.vendor ?? 'none', next.vendor ?? 'none'));
    if (next.description !== old.description) {
      changes.push(changeLine('description', clip(old.description, 40), clip(next.description, 40)));
    }
    if (next.category !== old.category) {
      changes.push(changeLine('category', CATEGORY_LABEL[old.category], CATEGORY_LABEL[next.category]));
    }
    if (next.spent_on !== old.spent_on) {
      changes.push(changeLine('date', formatDay(old.spent_on), formatDay(next.spent_on)));
    }
    if (changes.length === 0) return { ok: false, problem: 'Nothing to change on that expense.' };

    const label = expenseLabel(row);
    return {
      ok: true,
      resolved: { id: row.id, label, old, next } satisfies Resolved,
      row: {
        icon: 'receipt_long',
        summary: `Edit expense ${label}: ${changes.join(' · ')}`,
        amount: '',
        tone: 'neutral',
      },
    };
  },
  execute: async (ctx, resolved) => {
    const r = resolved as Resolved;
    const { data, error } = await ctx.db.select<ExpenseRow>('expenses', {
      columns: '*',
      eq: { user_id: ctx.userId, id: r.id },
      limit: 1,
    });
    if (error) throw new Error(error.message);
    const raw = data?.[0];
    if (!raw) return { ok: false, problem: 'That expense is gone now.' };
    const row = asExpenseRow(raw);
    if (row.deleted_at) return { ok: false, problem: 'That expense was deleted.' };
    if (
      (row.vendor?.trim() || null) !== r.old.vendor
      || (row.description?.trim() || null) !== r.old.description
      || categoryOf(row) !== r.old.category
      || expenseDay(row) !== r.old.spent_on
    ) {
      return { ok: false, problem: `${r.label} changed since I looked. Ask me again.` };
    }

    const { error: updateError } = await ctx.db.update(
      'expenses',
      {
        vendor: r.next.vendor,
        description: r.next.description,
        category: r.next.category,
        spent_on: r.next.spent_on,
      },
      { eq: { id: r.id } },
    );
    if (updateError) throw new Error(updateError.message);

    return { ok: true, result: { id: r.id, label: r.label } };
  },
  fallback: (result) => `Changed the expense at ${result.label}.`,
  fixture: {
    args: { vendor: 'Shell', spent_on: '2026-11-06', new_vendor: 'Chevron' },
    result: { id: 'exp-1', label: 'Shell · Nov 6' },
  },
  preview: {
    resolved: {
      id: 'owner-expense',
      label: 'Shell · Nov 6',
      old: { vendor: 'Shell', description: 'Fill-up', category: 'fuel', spent_on: '2026-11-06' },
      next: { vendor: 'Chevron', description: 'Fill-up', category: 'fuel', spent_on: '2026-11-06' },
    },
    row: {
      icon: 'receipt_long',
      summary: 'Edit expense Shell · Nov 6: vendor Shell to Chevron',
      amount: '',
      tone: 'neutral',
    },
  },
});
