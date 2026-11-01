// ═══ Bank tracking — mock data + review-stack model (phase 1) ═══
// Phase 1 is UI only. This file is the typed fixture every bank screen reads
// and the pure reducer behind the review stack; there is no API and no Plaid.
//
// HARD RULE: nothing here — or in components/bank — may write to the database.
// Add to record, Already recorded, Don't add and Unlink only move local state,
// and bank-tracking.test.ts fails the build if a bank file so much as imports
// the Supabase client or calls insert/update/upsert/delete/rpc.
import type { ExpenseCategory } from './expenses';

export type BankAccount = {
  id: string;
  /** As the bank prints it: "Chase", "Card". */
  bankName: string;
  /** "Business Checking". */
  label: string;
  /** Last four digits. */
  mask: string;
};

// Only the accounts the mock cards point at. The Bank accounts screen (a later
// step) has its own richer fixture.
export const BANK_ACCOUNTS: BankAccount[] = [
  { id: 'chase-checking', bankName: 'Chase', label: 'Business Checking', mask: '4821' },
  { id: 'chase-card', bankName: 'Card', label: 'Business card', mask: '5510' },
];

/** "Chase ••4821" — the account line under a merchant. */
export function accountLabel(accountId: string): string {
  const account = BANK_ACCOUNTS.find((a) => a.id === accountId);
  return account ? `${account.bankName} ••${account.mask}` : 'Bank account';
}

export type ReviewVariant = 'modified' | 'removed' | 'bounced';

export type ReviewChange = { label: string; from: string; to: string };

export type BankReview = {
  variant: ReviewVariant;
  /** Headline: "Your bank changed this charge". */
  title: string;
  /** The merchant line under it: category or invoice, date, account. */
  meta: string;
  changes: ReviewChange[];
  note: string;
  fixLabel: string;
  keepLabel: string;
  /** The toast the fix shows (copy from the design; no amounts). */
  toast: string;
};

export type BankItem = {
  id: string;
  kind: 'expense' | 'review';
  merchant: string;
  /** Dollars. Editable in the review card — this is fixture state only. */
  amount: number;
  /** yyyy-mm-dd, read as a local date (same convention as expenses.spent_on). */
  date: string;
  accountId: string;
  category: ExpenseCategory;
  /** Already recorded in Expenses: the strip points at it. */
  match?: string;
  /** A receipt is attached (mock: the button flips this). */
  receipt: boolean;
  review?: BankReview;
};

/** open = still to review; ignored = "Don't add", still restorable until the
 *  stack is closed with nothing left to review; added / already are decided;
 *  dropped = an ignored item that became final. */
export type BankItemStatus = 'open' | 'added' | 'already' | 'ignored' | 'dropped';

export type BankFilter = 'review' | 'ignored';

export type BankReviewState = {
  items: BankItem[];
  status: Record<string, BankItemStatus>;
  filter: BankFilter;
};

// ═══ The fixture ═══
// Money out only, matching the prototype's batch (R1–R13) plus one of each
// needs-review variant (R6 modified, R7 removed, R8 bounced). Dates are local
// yyyy-mm-dd; "today" on the design is Oct 30 2026.
export const BANK_ITEMS: BankItem[] = [
  {
    id: 'wm-1028', kind: 'expense', merchant: 'Walmart', amount: 30.38,
    date: '2026-10-28', accountId: 'chase-checking', category: 'food', receipt: false,
  },
  {
    id: 'co-1027', kind: 'expense', merchant: 'Costco Wholesale', amount: 432.98,
    date: '2026-10-27', accountId: 'chase-checking', category: 'supplies', receipt: false,
    match: 'Costco Wholesale · Supplies · Oct 27 · $432.98',
  },
  {
    id: 'lo-1026', kind: 'expense', merchant: "Lowe's", amount: 169.73,
    date: '2026-10-26', accountId: 'chase-checking', category: 'supplies', receipt: false,
  },
  {
    id: 'bj-1023', kind: 'expense', merchant: "BJ's Wholesale Club", amount: 97.54,
    date: '2026-10-23', accountId: 'chase-card', category: 'fuel', receipt: false,
  },
  {
    id: 'rv-modified', kind: 'review', merchant: 'Burlington', amount: 54.49,
    date: '2026-10-28', accountId: 'chase-card', category: 'supplies', receipt: false,
    review: {
      variant: 'modified',
      title: 'Your bank changed this charge',
      meta: 'Supplies · Oct 28 · Card ••5510',
      changes: [{ label: 'Amount', from: '$49.49', to: '$54.49' }],
      note: 'The final total posted higher than the first hold. Your record still says $49.49.',
      fixLabel: 'Update to $54.49',
      keepLabel: 'Keep $49.49',
      toast: 'Updated Oct 28, totals updated.',
    },
  },
  {
    id: 'rv-removed', kind: 'review', merchant: 'Staples', amount: 61.2,
    date: '2026-10-22', accountId: 'chase-card', category: 'supplies', receipt: false,
    review: {
      variant: 'removed',
      title: 'Your bank removed this charge',
      meta: 'Supplies · Oct 22 · Card ••5510',
      changes: [{ label: 'Status', from: 'Posted $61.20', to: 'Removed by bank' }],
      note: 'Pending charges sometimes drop off before they post. It is still in your Books.',
      fixLabel: 'Remove from Books',
      keepLabel: 'Keep it',
      toast: 'Removed from Oct 22, totals updated.',
    },
  },
  {
    id: 'hd-1006', kind: 'expense', merchant: 'The Home Depot', amount: 86.12,
    date: '2026-10-06', accountId: 'chase-card', category: 'supplies', receipt: false,
  },
  {
    id: 'sh-1004', kind: 'expense', merchant: 'Shell', amount: 52.1,
    date: '2026-10-04', accountId: 'chase-card', category: 'fuel', receipt: false,
  },
  {
    id: 'rv-bounced', kind: 'review', merchant: 'Mr. Bob', amount: 1150,
    date: '2026-10-24', accountId: 'chase-checking', category: 'other', receipt: false,
    review: {
      variant: 'bounced',
      title: 'A payment bounced',
      meta: 'INV-1031 · Chase ••4821',
      changes: [{ label: 'Payment', from: 'Received Oct 20', to: 'Returned Oct 24' }],
      note: 'The money went back. Fixing this marks the invoice unpaid again.',
      fixLabel: 'Mark invoice unpaid',
      keepLabel: 'Keep as paid',
      toast: 'Invoice reopened, totals updated.',
    },
  },
];

// ═══ State + reducer ═══
// Everything the stack shows is derived from here; a card action is one
// dispatch and nothing else. Seeded from a copy of the fixture so edits (amount,
// date, category, receipt) never touch the exported constant.
export const seedReviewState = (items: BankItem[] = BANK_ITEMS): BankReviewState => ({
  items: items.map((it) => ({ ...it })),
  status: {},
  filter: 'review',
});

export type BankAction =
  | { type: 'add'; id: string }
  | { type: 'already'; id: string }
  | { type: 'ignore'; id: string }
  /** Restore on an ignored card: it goes back into To review. */
  | { type: 'restore'; id: string }
  /** Replace the batch (preview fixtures only; the app starts empty). */
  | { type: 'seed'; items: BankItem[] }
  /** Closing the stack with nothing left to review makes ignored items final. */
  | { type: 'finalizeIgnored' }
  /** Unlink on a bank-verified row: the item goes back to Unaccounted for. */
  | { type: 'reopen'; id: string }
  | { type: 'edit'; id: string; patch: Partial<Pick<BankItem, 'amount' | 'date' | 'category' | 'receipt'>> }
  | { type: 'filter'; filter: BankFilter };

const STATUS_FOR: Record<'add' | 'already' | 'ignore', BankItemStatus> = {
  add: 'added',
  already: 'already',
  ignore: 'ignored',
};

export function bankReducer(state: BankReviewState, action: BankAction): BankReviewState {
  switch (action.type) {
    case 'add':
    case 'already':
    case 'ignore':
      return { ...state, status: { ...state.status, [action.id]: STATUS_FOR[action.type] } };
    case 'reopen':
    case 'restore':
      return { ...state, status: { ...state.status, [action.id]: 'open' } };
    case 'seed':
      return seedReviewState(action.items);
    case 'finalizeIgnored': {
      // Only when To review is empty: the owner has nothing left to look at, so
      // the ones they passed on stop being restorable and the tab disappears.
      const stillOpen = state.items.some((it) => (state.status[it.id] ?? 'open') === 'open');
      if (stillOpen) return state;
      const status: Record<string, BankItemStatus> = { ...state.status };
      for (const it of state.items) if (status[it.id] === 'ignored') status[it.id] = 'dropped';
      return { ...state, status, filter: 'review' };
    }
    case 'edit':
      return {
        ...state,
        items: state.items.map((it) => (it.id === action.id ? { ...it, ...action.patch } : it)),
      };
    case 'filter':
      return { ...state, filter: action.filter };
    default:
      return state;
  }
}

export const statusOf = (state: BankReviewState, id: string): BankItemStatus =>
  state.status[id] ?? 'open';

/** Cards still in the stack, in fixture order. Closing the sheet keeps them. */
export const reviewQueue = (state: BankReviewState): BankItem[] =>
  state.items.filter((it) => statusOf(state, it.id) === 'open');

export const pendingCount = (state: BankReviewState): number => reviewQueue(state).length;

/** "Don't add" items, still restorable. They count toward nothing else. */
export const ignoredQueue = (state: BankReviewState): BankItem[] =>
  state.items.filter((it) => statusOf(state, it.id) === 'ignored');

export const ignoredCount = (state: BankReviewState): number => ignoredQueue(state).length;

/** Whatever the owner still has to deal with. There is no hidden state any
 *  more: X only closes the sheet, so unresolved items are simply still open. */
export const unaccountedItems = (state: BankReviewState): BankItem[] => reviewQueue(state);

/**
 * The red dot rule: still to review > 0. Decided items (added / already
 * recorded / don't add) never count, and opening the stack never clears it —
 * only resolving everything does.
 */
export const unaccountedCount = (state: BankReviewState): number => pendingCount(state);

export const booksDotVisible = (state: BankReviewState): boolean => unaccountedCount(state) > 0;

/**
 * The bank feature is dead until the flag is on *and* someone is signed in
 * (docs/design/CHANGES.md, "Signed out"): no popup, no red dots, no Settings
 * badge, no Books footnote or reconnect banner while the sign-in sheet covers
 * the shell. Pure, so both halves of the rule are unit-tested.
 */
export function bankActive(flagOn: boolean, signedIn: boolean): boolean {
  return flagOn && signedIn;
}

/** The three things a card can be asked to do. */
export type CardAction = 'add' | 'already' | 'ignore';

/**
 * A card's two buttons, never three (CHANGES.md · item 3). A card whose Possible
 * match strip points at an expense already in the Books offers "Already
 * recorded" instead of "Don't add"; the needs-review variant keeps its Fix /
 * Keep pair. Pure, so the rule is unit-tested rather than buried in JSX.
 */
export function cardActions(item: Pick<BankItem, 'review' | 'match'>): CardAction[] {
  if (item.review) return ['add', 'ignore'];
  return item.match ? ['add', 'already'] : ['add', 'ignore'];
}

/** "3 of 7" — position in the stack, against the whole batch. */
export const counterLabel = (position: number, total: number): string =>
  `${Math.max(1, position)} of ${Math.max(position, total)}`;

/** Clamped single-step move; the stack never wraps. */
export function nextQueueIndex(length: number, index: number, direction: 1 | -1): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, index + direction));
}

export const SWIPE_COMMIT_PX = 80;

/**
 * Rubber band: past the first or last card the offset follows |dx|^0.7, so the
 * card still moves but refuses to leave; everywhere else it tracks the finger.
 */
export function rubberBand(dx: number, atEdge: boolean): number {
  if (!atEdge) return dx;
  return Math.sign(dx) * Math.pow(Math.abs(dx), 0.7);
}

/** Follows the finger: translate(dx) rotate(dx/26°). Reduced motion: no move. */
export function swipeTransform(dx: number, reduce = false): string | undefined {
  if (reduce) return undefined;
  return `translateX(${dx}px) rotate(${(dx / 26).toFixed(2)}deg)`;
}

// ═══ Dates + money ═══
/** yyyy-mm-dd read as LOCAL — new Date('2026-10-06') is UTC midnight. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export const todayIso = (): string => new Date().toLocaleDateString('en-CA');

export function shiftDay(iso: string, days: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

/** "Oct 28". */
export const formatDay = (iso: string): string =>
  parseDay(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** The add confirmation. Copy rule: never carries an amount. */
export const addedToast = (iso: string): string => `Added to ${formatDay(iso)}, totals updated.`;

export const formatMoney = (n: number): string =>
  Number.isFinite(n)
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : '$—';

/**
 * The date row's chips: the bank's date, the day before, and today — de-duped
 * and labelled, so a late October charge can still be moved to today.
 */
export function dateOptions(bankDate: string, today: string = todayIso()): { value: string; label: string }[] {
  const seen = new Set<string>();
  return [bankDate, shiftDay(bankDate, -1), today]
    .filter((v) => (seen.has(v) ? false : (seen.add(v), true)))
    .map((v) => ({ value: v, label: `${formatDay(v)}${v === today ? ' · Today' : ''}` }));
}
