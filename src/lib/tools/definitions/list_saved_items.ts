// ═══ Tool · list_saved_items (read) ═══
//
// The owner's saved products and services, A–Z with their prices, so the model
// can answer "what do I charge for a service call?" without inventing a price.
// Soft-deleted rows never count; the 25-row cap keeps the full count.
import { z } from 'zod';
import { defineTool } from '../contract';
import { RankedListProps } from '@/lib/templates/props';
import { READ_CAP, matchOf, moneyText, nameMatches, normName } from '../read';

export const LIST_SAVED_ITEMS = 'list_saved_items';

const UNITS = ['each', 'hour', 'sq ft', 'job'] as const;
type Unit = (typeof UNITS)[number];

const UNIT_LABEL: Record<Unit, string> = {
  each: 'each',
  hour: 'per hour',
  'sq ft': 'per sq ft',
  job: 'per job',
};

const UNIT_ALIASES: Record<string, Unit> = {
  item: 'each',
  unit: 'each',
  hourly: 'hour',
  hr: 'hour',
  hours: 'hour',
  square_foot: 'sq ft',
  square_feet: 'sq ft',
  sqft: 'sq ft',
  squarefoot: 'sq ft',
  fixed: 'job',
  flat: 'job',
  project: 'job',
};

export const ListSavedItemsInput = z
  .object({
    text: z.string().max(120).optional(),
    unit: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(READ_CAP).optional(),
  })
  .strict();

const SavedItem = z.object({
  id: z.string(),
  name: z.string(),
  detail: z.string().nullable(),
  unit: z.string(),
  unitPrice: z.string().nullable(),
  useCount: z.number().int().nonnegative(),
  lastUsedAt: z.string().nullable(),
});

export const ListSavedItemsOutput = z.object({
  match: z.enum(['none', 'one', 'many']),
  count: z.number().int().nonnegative(),
  ignored: z.array(z.string()),
  eyebrow: z.string().min(1),
  title: z.string(),
  totalCount: z.number().int().nonnegative(),
  rows: RankedListProps.shape.rows,
  total: RankedListProps.shape.total,
  hideTotal: z.boolean().optional(),
  items: z.array(SavedItem),
});

type ProductRow = {
  id: string;
  name: string;
  unit: string | null;
  unit_price: number | string | null;
  detail: string | null;
  use_count: number | null;
  last_used_at: string | Date | null;
  deleted_at: string | null;
};

function forgivingUnit(value: string | undefined): { unit?: Unit; ignored: string[] } {
  const raw = value?.trim();
  if (!raw) return { ignored: [] };
  const key = normName(raw);
  const exact = UNITS.find((unit) => normName(unit) === key);
  if (exact) return { unit: exact, ignored: [] };
  const alias = UNIT_ALIASES[key.replace(/ /g, '_')];
  if (alias) return { unit: alias, ignored: [] };
  return { ignored: [raw] };
}

const priceText = (row: ProductRow): string => {
  if (row.unit_price == null) return 'No price';
  const price = Number(row.unit_price);
  const unit = (UNITS as readonly string[]).includes(row.unit ?? '') ? (row.unit as Unit) : 'each';
  return unit === 'each' ? moneyText(price) : `${moneyText(price)} ${UNIT_LABEL[unit]}`;
};

const fixtureRows: ProductRow[] = [
  {
    id: 'prod-1', name: 'Service call', unit: 'job', unit_price: 85, detail: 'First hour included',
    use_count: 4, last_used_at: '2026-11-01T00:00:00Z', deleted_at: null,
  },
  {
    id: 'prod-2', name: 'Hourly labor', unit: 'hour', unit_price: 65, detail: null,
    use_count: 12, last_used_at: '2026-11-05T00:00:00Z', deleted_at: null,
  },
];

export const listSavedItemsTool = defineTool({
  name: LIST_SAVED_ITEMS,
  description:
    'Read-only A–Z list of the user’s saved products and services with their prices and units, newest use first only for the count. Supports a text filter over the name and detail and a unit filter (each, hour, sq ft, job); returns at most 25 rows plus the full count. This answers what the user charges — "what do I charge hourly", "what is my rate for a service call" — from the saved item’s price and unit.',
  input: ListSavedItemsInput,
  output: ListSavedItemsOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'list.ranked', props: RankedListProps },
  destination: { screen: 'Products & services', path: '/clients' },
  handler: async (ctx, args) => {
    const unit = forgivingUnit(args.unit);
    const { data, error } = await ctx.db.select<ProductRow>('products', {
      columns: '*',
      eq: { user_id: ctx.userId },
      is: { deleted_at: null },
      order: { column: 'name', ascending: true },
    });
    if (error) throw new Error(error.message);

    const matched = (data ?? [])
      .filter((row) => !row.deleted_at)
      .filter((row) => {
        if (unit.unit && (row.unit ?? 'each') !== unit.unit) return false;
        if (args.text?.trim()) {
          return nameMatches(args.text, [row.name, row.detail].filter(Boolean).join(' '));
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const shown = matched.slice(0, args.limit ?? READ_CAP);
    const count = matched.length;

    return {
      match: matchOf(count),
      count,
      ignored: unit.ignored,
      eyebrow: 'Saved items',
      title: count ? 'A–Z' : '',
      totalCount: count,
      rows: shown.map((row) => ({
        name: row.name,
        secondary: [row.detail, UNIT_LABEL[(row.unit ?? 'each') as Unit] ?? 'each'].filter(Boolean).join(' · '),
        amount: priceText(row),
        ...(row.use_count ? { chip: { tone: 'due' as const, label: `Used ${row.use_count}×` } } : {}),
      })),
      total: {
        label: `${count} ${count === 1 ? 'item' : 'items'}`,
        amount: 'List',
      },
      hideTotal: true,
      items: shown.map((row) => ({
        id: row.id,
        name: row.name,
        detail: row.detail,
        unit: (row.unit ?? 'each'),
        unitPrice: row.unit_price == null ? null : moneyText(Number(row.unit_price)),
        useCount: Math.max(0, Number(row.use_count ?? 0)),
        lastUsedAt: row.last_used_at instanceof Date
          ? row.last_used_at.toISOString()
          : row.last_used_at ?? null,
      })),
    };
  },
  fallback: (result) =>
    result.count === 0
      ? 'No saved items match that.'
      : `${result.count} saved ${result.count === 1 ? 'item' : 'items'}.`,
  fixture: {
    args: { unit: 'job' },
    result: {
      match: 'one',
      count: 1,
      ignored: [],
      eyebrow: 'Saved items',
      title: 'A–Z',
      totalCount: 1,
      rows: [
        { name: 'Service call', secondary: 'First hour included · per job', amount: '$85.00 per job', chip: { tone: 'due', label: 'Used 4×' } },
      ],
      total: { label: '1 item', amount: 'List' },
      hideTotal: true,
      items: [
        { id: 'prod-1', name: 'Service call', detail: 'First hour included', unit: 'job', unitPrice: '$85.00', useCount: 4, lastUsedAt: '2026-11-01T00:00:00Z' },
      ],
    },
  },
});

export const savedItemFixture = fixtureRows;
