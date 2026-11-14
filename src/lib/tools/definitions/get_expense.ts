// ═══ Tool · get_expense (read) ═══
//
// One logged expense, by id or by what the owner calls it. A description is
// matched against the vendor, the description and the category label, so
// "Shell" and "gas" both find a fill-up. Ambiguity is returned as the matches,
// never resolved by guessing.
import { z } from 'zod';
import { defineTool } from '../contract';
import { NavLinkProps, RankedListProps } from '@/lib/templates/props';
import {
  ExpenseRow,
  asExpenseRow,
  expenseCategoryLabel,
  expenseDay,
  matchOf,
  moneyText,
  nameMatches,
  num,
  type ExpenseRow as ExpenseRowType,
} from '../read';

export const GET_EXPENSE = 'get_expense';

export const GetExpenseInput = z
  .object({
    id: z.string().max(64).optional(),
    description: z.string().max(120).optional(),
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

export const GetExpenseOutput = z.object({
  match: z.enum(['none', 'one', 'many']),
  count: z.number().int().nonnegative(),
  ignored: z.array(z.string()),
  eyebrow: z.string().min(1),
  title: z.string(),
  items: z.array(z.object({ icon: z.string(), title: z.string(), line: z.string() })),
  rows: RankedListProps.shape.rows,
  totalCount: z.number().int().nonnegative(),
  total: RankedListProps.shape.total,
  expense: Expense.nullable(),
  /** Why there is no expense to show, in words the reply can use. */
  problem: z.enum(['no_filter']).optional(),
});

const fixtureRow = (over: Record<string, unknown> = {}): ExpenseRowType => ({
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

const name = (row: ExpenseRowType) =>
  row.vendor?.trim() || row.description?.trim() || expenseCategoryLabel(row.category);

const line = (row: ExpenseRowType) =>
  `${expenseCategoryLabel(row.category)} · ${expenseDay(row)} · ${moneyText(num(row.amount))}`;

export const getExpenseTool = defineTool({
  name: GET_EXPENSE,
  description:
    'Read-only lookup of ONE logged expense by its id or by a description, vendor or category word (gas finds fuel). One match renders as a link, several as a ranked list of the matches, and no match is a plain-text answer rather than an invented expense.',
  input: GetExpenseInput,
  output: GetExpenseOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'nav.link', props: NavLinkProps },
  alternateTemplate: { id: 'list.ranked', props: RankedListProps },
  templateFor: (result) => {
    if (result.count === 0) return null;
    return result.count === 1 ? 'nav.link' : 'list.ranked';
  },
  destination: { screen: 'Expenses', path: '/expenses' },
  handler: async (ctx, args) => {
    const { data, error } = await ctx.db.select<ExpenseRowType>('expenses', {
      columns: '*',
      eq: { user_id: ctx.userId },
      is: { deleted_at: null },
      order: { column: 'spent_on', ascending: false },
    });
    if (error) throw new Error(error.message);

    const rows = (data ?? []).map(asExpenseRow).filter((row) => !row.deleted_at);
    const exact = args.id ? rows.filter((row) => row.id === args.id) : [];
    const query = args.description?.trim();

    // No id and no word is not a lookup. Matching every row answered "Which
    // one?", which reads as a failed lookup and invites a second list call;
    // say what is missing instead and let the caller ask.
    if (!args.id && !query) {
      return {
        match: 'none' as const,
        count: 0,
        ignored: [],
        eyebrow: 'Expenses',
        title: '',
        items: [],
        rows: [],
        totalCount: 0,
        total: { label: '0 expenses', amount: moneyText(0) },
        expense: null,
        problem: 'no_filter' as const,
      };
    }
    const matched = exact.length
      ? exact
      : rows.filter((row) => {
        if (!query) return true;
        const haystack = [row.vendor, row.description, expenseCategoryLabel(row.category)]
          .filter(Boolean)
          .join(' ');
        return nameMatches(query, haystack);
      });
    matched.sort((a, b) => expenseDay(b).localeCompare(expenseDay(a)));

    const count = matched.length;
    const one = count === 1 ? matched[0] : null;
    const total = matched.reduce((sum, row) => sum + num(row.amount), 0);

    return {
      match: matchOf(count),
      count,
      ignored: [],
      eyebrow: one ? name(one) : 'Expenses',
      title: one ? line(one) : count ? 'Which one?' : '',
      items: one ? [{ icon: 'receipt_long', title: name(one), line: line(one) }] : [],
      rows: matched.map((row) => ({
        name: name(row),
        secondary: line(row),
        amount: moneyText(num(row.amount)),
        ...(row.tax_deductible ? { chip: { tone: 'due' as const, label: 'Deductible' } } : {}),
      })),
      totalCount: count,
      total: {
        label: `${count} ${count === 1 ? 'expense' : 'expenses'}`,
        amount: moneyText(total),
      },
      expense: one
        ? {
          id: one.id,
          vendor: one.vendor ?? null,
          description: one.description ?? null,
          category: one.category ?? 'other',
          categoryLabel: expenseCategoryLabel(one.category),
          spentOn: expenseDay(one),
          amount: moneyText(num(one.amount)),
          taxDeductible: Boolean(one.tax_deductible),
        }
        : null,
    };
  },
  fallback: (result) =>
    result.problem === 'no_filter'
      ? 'Say which expense you mean: a vendor, a description or a category.'
      : result.expense
      ? `${result.expense.vendor ?? result.expense.description ?? result.expense.categoryLabel}, ${result.expense.categoryLabel.toLowerCase()}, ${result.expense.spentOn}: ${result.expense.amount}.`
      : result.count === 0
        ? 'No expense matches that.'
        : `${result.count} expenses match; say which one you mean.`,
  fixture: {
    args: { description: 'Shell' },
    result: {
      match: 'one',
      count: 1,
      ignored: [],
      eyebrow: 'Shell',
      title: 'Fuel · 2026-11-06 · $52.10',
      items: [{ icon: 'receipt_long', title: 'Shell', line: 'Fuel · 2026-11-06 · $52.10' }],
      rows: [
        { name: 'Shell', secondary: 'Fuel · 2026-11-06 · $52.10', amount: '$52.10', chip: { tone: 'due', label: 'Deductible' } },
      ],
      totalCount: 1,
      total: { label: '1 expense', amount: '$52.10' },
      expense: {
        id: 'exp-1',
        vendor: 'Shell',
        description: 'Fill-up',
        category: 'fuel',
        categoryLabel: 'Fuel',
        spentOn: '2026-11-06',
        amount: '$52.10',
        taxDeductible: true,
      },
    },
  },
});

export const expenseFixture = fixtureRow;
