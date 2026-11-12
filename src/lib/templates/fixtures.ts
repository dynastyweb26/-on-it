// ═══ AI chat templates · the board's sample data ═══
//
// The exact sample values from each design file's script block, typed against
// ./props. Tests and the design fixtures page use these; no runtime path does.
// Money is a finished string, as the design writes it (RULES.md §5).
import type {
  BreakdownProps,
  CantDoProps,
  ConfirmBatchProps,
  DraftMessageProps,
  DraftMessageState,
  FeedbackCheckinProps,
  FeedbackThumbsProps,
  NavLinkProps,
  RankedListProps,
  StatTilesProps,
  TrendChartProps,
} from './props';

export const RANKED_LIST_FIXTURE = {
  state: 'filled',
  eyebrow: 'Who owes you',
  title: 'Biggest balance first.',
  totalCount: 18,
  rows: [
    {
      name: 'Chenyi',
      secondary: 'INV-0074 · Kitchen remodel',
      amount: '$8,100.00',
      chip: { tone: 'late', label: '34d late' },
    },
    {
      name: 'Maryam',
      secondary: '3 open · Door install',
      amount: '$2,450.00',
      chip: { tone: 'late', label: '12d late' },
    },
    { name: 'Ruth Lawrence', secondary: '2 open · Deck repair', amount: '$295.00' },
    { name: 'Joyn', secondary: 'INV-0081 · Car wash', amount: '$160.00' },
    {
      name: 'Syeda',
      secondary: 'INV-0083 · Therapy sessions',
      amount: '$50.00',
      chip: { tone: 'due', label: 'Due Fri' },
    },
  ],
  total: { label: 'Owed to you · 18 clients', amount: '$77,140.40' },
  hideTotal: false,
} satisfies RankedListProps;

export const STAT_TILES_FIXTURE = {
  state: 'filled',
  eyebrow: 'This month · Nov 1–11',
  title: '',
  tiles: [
    {
      label: 'Collected',
      value: '+$4,210',
      tone: 'in',
      period: 'Nov 1–11',
      change: { dir: 'up', text: 'Up 18% vs Oct' },
    },
    {
      label: 'Spent',
      value: '−$3,598',
      tone: 'out',
      period: 'Nov 1–11',
      change: { dir: 'down', text: 'Down 6% vs Oct' },
    },
    {
      label: 'Net',
      value: '+$612',
      tone: 'in',
      period: 'Nov 1–11',
      change: { dir: 'up', text: 'Up from −$240' },
    },
  ],
} satisfies StatTilesProps;

export const TREND_CHART_FIXTURE = {
  state: 'filled',
  eyebrow: 'In vs out · Last 6 months',
  title: 'Jun – Nov 2026',
  points: [
    { label: 'Jun 2026', full: 'Jun 2026', inc: 2400, out: 1200 },
    { label: 'Jul', full: 'Jul 2026', inc: 3150, out: 1640 },
    { label: 'Aug', full: 'Aug 2026', inc: 1980, out: 2310 },
    { label: 'Sep', full: 'Sep 2026', inc: 14771, out: 3980 },
    { label: 'Oct', full: 'Oct 2026', inc: 4210, out: 3597.61 },
    { label: 'Nov 2026', full: 'Nov 1–11', inc: 2860, out: 1420 },
  ],
} satisfies TrendChartProps;

export const BREAKDOWN_FIXTURE = {
  state: 'filled',
  tone: 'out',
  eyebrow: 'Spent by category · October',
  total: '$5,200.80',
  rows: [
    { name: 'Materials', amount: '$2,140.00', share: 41 },
    { name: 'Fuel', amount: '$860.40', share: 17 },
    { name: 'Tools', amount: '$720.00', share: 14 },
    { name: 'Subcontractors', amount: '$650.00', share: 12 },
    { name: 'Food', amount: '$310.25', share: 6 },
    { name: 'Vehicle', amount: '$280.00', share: 5 },
    { name: 'Other', amount: '$240.15', share: 5, other: true },
  ],
} satisfies BreakdownProps;

export const DRAFT_MESSAGE_FIXTURE = {
  state: 'draft',
  channel: 'Text',
  device: 'phone',
  recipientName: 'Chenyi',
  phone: '(945) 555-0182',
  email: 'chenyi.w@mail.com',
  aboutLabel: 'INV-0074',
  aboutAmount: '$8,100.00 due',
  body:
    'Hi Chenyi, just a reminder that invoice INV-0074 for the kitchen remodel ($8,100.00) was due Oct 8. You can pay by Zelle or card from the link in the invoice. Thanks!',
} satisfies DraftMessageProps;

/**
 * One sample per design state. Text on phone is the base; copied needs the
 * laptop, and sent/error are the Email-only states.
 */
export const DRAFT_MESSAGE_STATE_FIXTURES = {
  draft: DRAFT_MESSAGE_FIXTURE,
  editing: { ...DRAFT_MESSAGE_FIXTURE, state: 'editing' },
  opened: { ...DRAFT_MESSAGE_FIXTURE, state: 'opened', device: 'phone' },
  copied: { ...DRAFT_MESSAGE_FIXTURE, state: 'copied', device: 'laptop' },
  done: { ...DRAFT_MESSAGE_FIXTURE, state: 'done', device: 'phone' },
  openError: { ...DRAFT_MESSAGE_FIXTURE, state: 'openError', device: 'phone' },
  sent: { ...DRAFT_MESSAGE_FIXTURE, state: 'sent', channel: 'Email', device: 'phone' },
  error: { ...DRAFT_MESSAGE_FIXTURE, state: 'error', channel: 'Email', device: 'phone' },
  nocontact: { ...DRAFT_MESSAGE_FIXTURE, state: 'nocontact' },
  loading: { ...DRAFT_MESSAGE_FIXTURE, state: 'loading' },
  cancelled: { ...DRAFT_MESSAGE_FIXTURE, state: 'cancelled' },
} satisfies Record<DraftMessageState, DraftMessageProps>;

export const CONFIRM_BATCH_FIXTURE = {
  state: 'pending',
  actions: [
    { icon: 'payments', summary: 'Record Ruth Lawrence paid · Zelle', amount: '+$270.00', tone: 'in' },
    { icon: 'notifications', summary: 'Remind Tony about INV-0077', amount: '$640.00', tone: 'neutral' },
    { icon: 'receipt_long', summary: 'Log The Home Depot · Supplies', amount: '−$39.70', tone: 'out' },
  ],
} satisfies ConfirmBatchProps;

export const CANT_DO_FIXTURE = {
  state: 'filled',
  line: "I can't split one invoice into monthly payments yet.",
  noAlts: false,
  alternatives: ['Record a partial payment', 'Send a payment reminder'],
} satisfies CantDoProps;

export const NAV_LINK_FIXTURE = {
  state: 'filled',
  items: [{ icon: 'description', title: 'INV-0069 · Ruth Lawrence', line: 'Paid in full · Closed Nov 11' }],
} satisfies NavLinkProps;

export const FEEDBACK_THUMBS_FIXTURE = { state: 'idle' } satisfies FeedbackThumbsProps;

export const FEEDBACK_CHECKIN_FIXTURE = { state: 'open' } satisfies FeedbackCheckinProps;

/** One fixture per id, for the schema tests and the design fixtures page. */
export const TEMPLATE_FIXTURES = {
  'list.ranked': RANKED_LIST_FIXTURE,
  'stat.tiles': STAT_TILES_FIXTURE,
  'chart.trend': TREND_CHART_FIXTURE,
  'chart.breakdown': BREAKDOWN_FIXTURE,
  'draft.message': DRAFT_MESSAGE_FIXTURE,
  'confirm.batch': CONFIRM_BATCH_FIXTURE,
  'cant.do': CANT_DO_FIXTURE,
  'nav.link': NAV_LINK_FIXTURE,
  'feedback.thumbs': FEEDBACK_THUMBS_FIXTURE,
  'feedback.checkin': FEEDBACK_CHECKIN_FIXTURE,
} as const;
