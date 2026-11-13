// ═══ AI chat templates · actions out ═══
//
// The design files' callbacks, typed. Props carry data; these are the taps the
// component reports back. Kept apart from ./props so a server response can never
// pretend to carry a function.
import type {
  BreakdownProps,
  DraftMessageChannel,
  RankedListProps,
  NavLinkProps,
} from './props';

/** The six stored reasons (design chips; ./reasons maps the labels). */
export type FeedbackReason =
  | 'wrong_number'
  | 'wrong_record'
  | 'didnt_understand'
  | 'couldnt_do_it'
  | 'too_slow'
  | 'other';

export type RankedListCallbacks = {
  onRowTap?: (row: RankedListProps['rows'][number], index: number) => void;
  onShowAll?: () => void;
  /** The error card's "Try again" button. */
  onRetry?: () => void;
};

export type StatTilesCallbacks = {
  /** The error card's "Try again" button. */
  onRetry?: () => void;
};

export type NavLinkCallbacks = {
  onOpen?: (item: NavLinkProps['items'][number], index: number) => void;
  /** The error card's "Retry" button. */
  onRetry?: () => void;
};

export type TrendChartCallbacks = {
  /** The error card's "Try again" button. */
  onRetry?: () => void;
};

export type BreakdownCallbacks = {
  onRowTap?: (row: BreakdownProps['rows'][number], index: number) => void;
  /** The error card's "Try again" button. */
  onRetry?: () => void;
};

export type CantDoCallbacks = {
  onAlt?: (label: string) => void;
  onRequest?: () => void;
};

export type FeedbackThumbsCallbacks = {
  onVote?: (vote: 'up' | 'down' | null, reasons?: FeedbackReason[], note?: string) => void;
};

export type FeedbackCheckinCallbacks = {
  onDismiss?: () => void;
  onPick?: (choice: 'Not great' | "It's okay" | 'Love it') => void;
};

export type DraftMessageCallbacks = {
  /** Send the body as it stands, including edits the user just made. */
  onSend?: (body: string) => void;
  onOpenMessages?: () => void;
  onCopy?: () => void;
  onMarkDone?: () => void;
  /** Keep the current body when the user finishes editing. */
  onEdit?: (body: string) => void;
  onCancel?: () => void;
  onAddContact?: () => void;
  /** Switch the draft between Text and Email. */
  onChannel?: (channel: DraftMessageChannel) => void;
};

export type ConfirmBatchCallbacks = {
  onPrimary?: () => void;
  onRemove?: (index: number) => void;
  onUndo?: () => void;
  /** The pending footer's Cancel button. */
  onCancel?: () => void;
};
