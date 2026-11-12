// ═══ AI chat templates · the props contract ═══
//
// One Zod schema per template id, copied field for field from the `data-props`
// attribute in each design file (design/ai-templates/*.dc.html, branch
// design/ai-templates). The design file is the contract; this module is its
// server-side half, so a tool result that does not fit is refused before it can
// reach a component.
//
// Callbacks (onRowTap, onShowAll, onOpen, onVote, onDismiss, onAlt) are not
// data: a server response can never carry a function, so they are typed in
// ./callbacks and never parsed here.
//
// Copy is not data. The design's fallback strings ("Nobody owes you.", the
// confirm headlines) belong to the component; props carry what the server
// measured, formatted the way RULES.md §5 requires (money is a finished string).
import { z } from 'zod';
import { TEMPLATE_IDS, type TemplateId } from '@/lib/tools/templates';

/** The three tones every template shares (design: tone maps in each script). */
export const Tone = z.enum(['in', 'out', 'neutral']);
export type Tone = z.infer<typeof Tone>;

const State = <T extends readonly [string, ...string[]]>(states: T) => z.enum(states);

// ── list.ranked · RankedList.dc.html ────────────────────────────────────────

export const RankedListProps = z.object({
  state: State(['filled', 'loading', 'empty', 'error']).default('filled'),
  eyebrow: z.string().min(1),
  title: z.string(),
  totalCount: z.number().int().nonnegative(),
  rows: z.array(
    z.object({
      name: z.string().min(1),
      secondary: z.string().min(1),
      /** A finished money string: no sign for owed money. */
      amount: z.string().min(1),
      tone: Tone.optional(),
      chip: z
        .object({ tone: z.enum(['late', 'paid', 'due']), label: z.string().min(1) })
        .optional(),
    }),
  ),
  total: z.object({ label: z.string().min(1), amount: z.string().min(1), tone: Tone.optional() }),
  hideTotal: z.boolean().default(false),
});
export type RankedListProps = z.infer<typeof RankedListProps>;

// ── stat.tiles · StatTiles.dc.html (1 to 3 tiles) ───────────────────────────

export const StatTilesProps = z.object({
  state: State(['filled', 'loading', 'empty', 'error']).default('filled'),
  eyebrow: z.string().min(1),
  title: z.string(),
  tiles: z
    .array(
      z.object({
        label: z.string().min(1),
        /** A finished money string, sign included (`+$4,210`, `−$3,598`). */
        value: z.string().min(1),
        tone: Tone,
        period: z.string(),
        change: z
          .object({ dir: z.enum(['up', 'down', 'flat']), text: z.string().min(1) })
          .optional(),
      }),
    )
    .min(1)
    .max(3),
});
export type StatTilesProps = z.infer<typeof StatTilesProps>;

// ── chart.trend · TrendChart.dc.html ────────────────────────────────────────

export const TrendChartProps = z.object({
  state: State(['filled', 'loading', 'empty', 'error']).default('filled'),
  eyebrow: z.string().min(1),
  title: z.string(),
  /** Numbers, not strings: the readout formats them (RULES §5 exception). */
  points: z
    .array(
      z.object({
        label: z.string().min(1),
        full: z.string().min(1).optional(),
        inc: z.number().finite().nonnegative(),
        out: z.number().finite().nonnegative(),
      }),
    )
    .max(12),
});
export type TrendChartProps = z.infer<typeof TrendChartProps>;
export type TrendPoint = TrendChartProps['points'][number];

// ── chart.breakdown · Breakdown.dc.html ─────────────────────────────────────

export const BreakdownProps = z.object({
  state: State(['filled', 'loading', 'empty', 'error']).default('filled'),
  tone: z.enum(['in', 'out']).default('out'),
  eyebrow: z.string().min(1),
  /** A finished money string without a sign; the card adds one from `tone`. */
  total: z.string().min(1),
  rows: z.array(
    z.object({
      name: z.string().min(1),
      amount: z.string().min(1),
      share: z.number().int().min(0).max(100),
      other: z.boolean().optional(),
    }),
  ),
});
export type BreakdownProps = z.infer<typeof BreakdownProps>;

// ── draft.message · DraftMessage.dc.html ────────────────────────────────────

export const DraftMessageState = State([
  'draft',
  'editing',
  'opened',
  'copied',
  'done',
  'openError',
  'sent',
  'error',
  'nocontact',
  'loading',
  'cancelled',
] as const);
export type DraftMessageState = z.infer<typeof DraftMessageState>;
export type DraftMessageChannel = 'Text' | 'Email';
export type DraftMessageDevice = 'phone' | 'laptop';

export const DraftMessageProps = z.object({
  state: DraftMessageState.default('draft'),
  channel: z.enum(['Text', 'Email']).default('Text'),
  device: z.enum(['phone', 'laptop']).default('phone'),
  recipientName: z.string().min(1),
  phone: z.string(),
  email: z.string(),
  aboutLabel: z.string(),
  /** A finished money string (`$8,100.00 due`). */
  aboutAmount: z.string(),
  /**
   * Server-composed body: every dollar amount inside it is filled in by the
   * server; the model never writes one (RULES.md §6.7).
   */
  body: z.string().min(1),
});
export type DraftMessageProps = z.infer<typeof DraftMessageProps>;

/**
 * The design file's own state/channel reconciliation. Text cannot know whether
 * a message was sent, and Email cannot know it was opened or copied; an
 * Email-only state with Text (or the reverse) becomes its counterpart.
 */
export function resolveDraftMessageState(
  state: DraftMessageState,
  channel: DraftMessageChannel,
  device: DraftMessageDevice = 'phone',
): DraftMessageState {
  if (channel === 'Text') {
    if (state === 'sent') return device === 'laptop' ? 'copied' : 'opened';
    if (state === 'error') return 'openError';
    return state;
  }
  if (state === 'opened' || state === 'copied' || state === 'done' || state === 'openError') {
    return state === 'openError' ? 'error' : 'sent';
  }
  return state;
}

// ── confirm.batch · BatchConfirm.dc.html (2 to 4 actions) ───────────────────

export const ConfirmBatchProps = z.object({
  state: State(['pending', 'confirming', 'done', 'partial', 'loading']).default('pending'),
  failIndex: z.number().int().min(0).optional(),
  actions: z
    .array(
      z.object({
        icon: z.string().min(1),
        summary: z.string().min(1),
        /** A finished money string, sign included when it moves money. */
        amount: z.string(),
        tone: Tone,
      }),
    )
    .min(2)
    .max(4),
});
export type ConfirmBatchProps = z.infer<typeof ConfirmBatchProps>;

// ── cant.do · CantDo.dc.html ────────────────────────────────────────────────

export const CantDoProps = z.object({
  state: State(['filled', 'requested', 'error', 'loading']).default('filled'),
  line: z.string().min(1),
  noAlts: z.boolean().default(false),
  alternatives: z.array(z.string().min(1)).max(2).default([]),
});
export type CantDoProps = z.infer<typeof CantDoProps>;

// ── nav.link · NavLink.dc.html (1 to 3 items) ───────────────────────────────

const NavLinkBaseProps = z.object({
  state: State(['filled', 'loading', 'empty', 'error']).default('filled'),
  /** The empty card's headline; required only when there is nothing to link to. */
  emptyTitle: z.string().min(1).optional(),
  items: z
    .array(
      z.object({
        icon: z.string().min(1),
        title: z.string().min(1),
        line: z.string(),
      }),
    )
    .min(1)
    .max(3),
});

export const NavLinkProps = NavLinkBaseProps.superRefine((props, ctx) => {
  if (props.state === 'empty' && !props.emptyTitle) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['emptyTitle'],
      message: 'emptyTitle is required when state is empty',
    });
  }
});
export type NavLinkProps = z.infer<typeof NavLinkProps>;

// ── feedback.thumbs · Feedback.dc.html ──────────────────────────────────────

export const FeedbackThumbsProps = z.object({
  state: State(['idle', 'up', 'down', 'open', 'openFilled', 'error']).default('idle'),
});
export type FeedbackThumbsProps = z.infer<typeof FeedbackThumbsProps>;

// ── feedback.checkin · CheckIn.dc.html ──────────────────────────────────────

export const FeedbackCheckinProps = z.object({
  state: State(['open', 'picked', 'dismissed']).default('open'),
});
export type FeedbackCheckinProps = z.infer<typeof FeedbackCheckinProps>;

// ── The map the safety suite loops over ─────────────────────────────────────

export const TEMPLATE_PROPS = {
  'list.ranked': RankedListProps,
  'stat.tiles': StatTilesProps,
  'chart.trend': TrendChartProps,
  'chart.breakdown': BreakdownProps,
  'draft.message': DraftMessageProps,
  'confirm.batch': ConfirmBatchProps,
  'cant.do': CantDoProps,
  'nav.link': NavLinkProps,
  'feedback.thumbs': FeedbackThumbsProps,
  'feedback.checkin': FeedbackCheckinProps,
} as const satisfies Record<TemplateId, z.ZodType>;

/**
 * The `state` enum of each design file, in file order. The fixtures page and
 * design/ai-templates/diff.config.json enumerate exactly these; nothing else is
 * a state.
 */
export const TEMPLATE_STATES = {
  'list.ranked': ['filled', 'loading', 'empty', 'error'],
  'stat.tiles': ['filled', 'loading', 'empty', 'error'],
  'chart.trend': ['filled', 'loading', 'empty', 'error'],
  'chart.breakdown': ['filled', 'loading', 'empty', 'error'],
  'draft.message': [
    'draft',
    'editing',
    'opened',
    'copied',
    'done',
    'openError',
    'sent',
    'error',
    'nocontact',
    'loading',
    'cancelled',
  ],
  'confirm.batch': ['pending', 'confirming', 'done', 'partial', 'loading'],
  'cant.do': ['filled', 'requested', 'error', 'loading'],
  'nav.link': ['filled', 'loading', 'empty', 'error'],
  'feedback.thumbs': ['idle', 'up', 'down', 'open', 'openFilled', 'error'],
  'feedback.checkin': ['open', 'picked', 'dismissed'],
} as const satisfies Record<TemplateId, readonly string[]>;

/** Every id has a schema, and every schema belongs to a known id. */
export const TEMPLATE_PROP_IDS = Object.keys(TEMPLATE_PROPS) as TemplateId[];
const missing = TEMPLATE_IDS.filter((id) => !(id in TEMPLATE_PROPS));
if (missing.length) throw new Error(`template ids without a props schema: ${missing.join(', ')}`);

/** Parse one card's data. The caller decides what a refusal means (never a stand-in). */
export function parseTemplateProps<I extends TemplateId>(
  id: I,
  data: unknown,
): z.ZodSafeParseResult<z.infer<(typeof TEMPLATE_PROPS)[I]>> {
  return (
    TEMPLATE_PROPS[id] as unknown as z.ZodType<z.infer<(typeof TEMPLATE_PROPS)[I]>>
  ).safeParse(data);
}
