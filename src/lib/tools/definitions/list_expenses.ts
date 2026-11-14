// ═══ Tool · list_expenses (read) ═══
//
// "Show me my expenses" with forgiving filters. The category word is a person's
// word, not a database enum: gas/gasoline/petrol all mean fuel, meals means food,
// and an unknown word is reported in `ignored` instead of failing the turn.
// At most 25 rows plus the full count; money is composed here, once.
import { z } from 'zod';
import { defineTool } from '../contract';
import { RankedListProps } from '@/lib/templates/props';
import {
  READ_CAP,
  asExpenseRow,
  expenseCategoryLabel,
  expenseDay,
  expenseMatches,
  forgivingCategory,
  forgivingFilters,
  matchOf,
  moneyText,
  nameMatches,
  num,
  type ExpenseRow,
} from '../read';

export const LIST_EXPENSES = 'list_expenses';

export const ListExpensesInput = z
  .object({
    category: z.string().max(60).optional(),
    text: z.string().max(120).optional(),
    from: z.string().max(10).optional(),
    to: z.string().max(10).optional(),
    min_amount: z.number().finite().min(0).max(10_000_000).optional(),
    max_amount: z.number().finite().min(0).max(10_000_000).optional(),
    limit: z.number().int().min(1).max(READ_CAP).optional(),
  })
  .strict();

const Expense = z.object({
  id: z.string(),
  vendor: z.string().nullable(),
  description: z.string().nullable(),
  category: z.string(),
  categoryLabel: z.string(),
  spentOn: z.string(),
  amount: z.string(),
  taxDeductible: z.boolean(),
});

export const ListExpensesOutput = z.object({
  match: z.enum(['none', 'one', 'many']),
  count: z.number().int().nonnegative(),
  ignored: z.array(z.string()),
  eyebrow: z.string().min(1),
  title: z.string(),
  totalCount: z.number().int().nonnegative(),
  rows: RankedListProps.shape.rows,
  total: RankedListProps.shape.total,
  expenses: z.array(Expense),
  /** A from/to that was given but is not a date: the list is empty, not wide. */
  dateProblem: z.string().optional(),
});

const fixtureRow = (over: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id: 'exp-1',
  description: 'Fill-up',
  vendor: 'Shell',
  amount: 52.1,
  category: 'fuel',
  tax_deductible: true,
  spent_on: '2026-11-06',
  created_at: '2026-11-06T00:00:00Z',
  deleted_at: null,
  ...over,
});

export const listExpensesTool = defineTool({
  name: LIST_EXPENSES,
  description:
    'Read-only list of the user’s own logged expenses, newest first, with optional category, text, date and amount filters. This answers "what did I spend at Shell" (text) and "show my fuel receipts" (category). Category words are forgiving: gas, gasoline and petrol all mean fuel, meals means food. Dates compare the day the expense was spent, and text searches the vendor and the description. Returns at most 25 rows plus the full count; unknown filter values are reported in `ignored`, never an error. This is a list of individual rows: totals and "how much did I spend on gas?" belong to run_report.',
  input: ListExpensesInput,
  output: ListExpensesOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'list.ranked', props: RankedListProps },
  destination: { screen: 'Expenses', path: '/expenses' },
  handler: async (ctx, args) => {
    const { filters, ignored, badDates } = forgivingFilters({
      from: args.from,
      to: args.to,
      min_amount: args.min_amount,
      max_amount: args.max_amount,
    });
    const category = forgivingCategory(args.category);
    ignored.push(...category.ignored);

    if (badDates.length) {
      // A date we cannot read must never widen the answer to all time.
      return {
        match: 'none' as const,
        count: 0,
        ignored,
        eyebrow: 'Your expenses',
        title: '',
        totalCount: 0,
        rows: [],
        total: { label: '0 expenses', amount: moneyText(0) },
        expenses: [],
        dateProblem: badDates[0],
      };
    }

    const { data, error } = await ctx.db.select<ExpenseRow>('expenses', {
      columns: '*',
      eq: { user_id: ctx.userId },
      is: { deleted_at: null },
      order: { column: 'spent_on', ascending: false },
    });
    if (error) throw new Error(error.message);

    const matched = (data ?? [])
      .map(asExpenseRow)
      .filter((row) => expenseMatches(row, {
        ...filters,
        category: category.category,
        text: args.text?.trim() || undefined,
      }))
      .sort((a, b) => {
        const ad = expenseDay(a);
        const bd = expenseDay(b);
        if (ad !== bd) return ad < bd ? 1 : -1;
        return (b.created_at ?? '').localeCompare(a.created_at ?? '');
      });

    const shown = matched.slice(0, args.limit ?? READ_CAP);
    const total = matched.reduce((sum, row) => sum + num(row.amount), 0);
    const count = matched.length;
    const label = (row: ExpenseRow) => expenseCategoryLabel(row.category);
    const name = (row: ExpenseRow) =>
      row.vendor?.trim() || row.description?.trim() || label(row);

    return {
      match: matchOf(count),
      count,
      ignored,
      eyebrow: 'Your expenses',
      title: count ? 'Newest first.' : '',
      totalCount: count,
      rows: shown.map((row) => {
        const day = expenseDay(row);
        const description = row.vendor && row.description ? `${row.description} · ` : '';
        return {
          name: name(row),
          secondary: `${description}${label(row)} · ${day}`,
          amount: moneyText(num(row.amount)),
          ...(row.tax_deductible ? { chip: { tone: 'due' as const, label: 'Deductible' } } : {}),
        };
      }),
      total: {
        label: `${count} ${count === 1 ? 'expense' : 'expenses'}`,
        amount: moneyText(total),
      },
      expenses: shown.map((row) => ({
        id: row.id,
        vendor: row.vendor ?? null,
        description: row.description ?? null,
        category: row.category ?? 'other',
        categoryLabel: label(row),
        spentOn: expenseDay(row),
        amount: moneyText(num(row.amount)),
        taxDeductible: Boolean(row.tax_deductible),
      })),
    };
  },
  fallback: (result) =>
    result.dateProblem
      ? `No rows: I did not understand the date "${result.dateProblem}".`
      : result.count === 0
        ? 'No expenses match that.'
        : `${result.count} ${result.count === 1 ? 'expense' : 'expenses'}, ${result.total.amount} in total.`,
  fixture: {
    args: { category: 'gas' },
    result: {
      match: 'many',
      count: 2,
      ignored: [],
      eyebrow: 'Your expenses',
      title: 'Newest first.',
      totalCount: 2,
      rows: [
        { name: 'Shell', secondary: 'Fill-up · Fuel · 2026-11-06', amount: '$52.10', chip: { tone: 'due', label: 'Deductible' } },
        { name: 'Exxon', secondary: 'Fuel · 2026-11-03', amount: '$40.00' },
      ],
      total: { label: '2 expenses', amount: '$92.10' },
      expenses: [
        { id: 'exp-1', vendor: 'Shell', description: 'Fill-up', category: 'fuel', categoryLabel: 'Fuel', spentOn: '2026-11-06', amount: '$52.10', taxDeductible: true },
        { id: 'exp-2', vendor: 'Exxon', description: null, category: 'fuel', categoryLabel: 'Fuel', spentOn: '2026-11-03', amount: '$40.00', taxDeductible: false },
      ],
    },
  },
});

// Exported for the unit tests: the same matching rule the handler uses.
export const matchesExpense = (row: ExpenseRow, text: string) =>
  nameMatches(text, [row.vendor, row.description, expenseCategoryLabel(row.category)].filter(Boolean).join(' '));
