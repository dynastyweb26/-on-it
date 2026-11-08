'use client';
// 2·13a / P-03 / board C3: a fresh template (+ menu, a client's Invoice,
// ?template=) would replace a saved one that has a client or a named item.
// Keep editing brings the saved one back; Start new replaces it (its draft row
// is soft-deleted, drafts only).
//
// The board's shape for this frame is the shared sheet, so this is PopSheet:
// Keep editing is the safe answer (scrim, ×, Escape and a swipe all map to it),
// "Start new" is destructive with a pending label, and a failed discard says the
// draft is still there. The invoice/estimate variant passes the figure card and
// the sub line; the expense variant (D6) keeps its own wording and has none.
import PopSheet from '@/components/popups/PopSheet';

export default function ReplaceTemplateSheet({
  title, onKeep, onStartNew, keepLabel = 'Keep editing', startNewLabel = 'Start new',
  startBusyLabel = 'Discarding…', sub, figure, consequence,
}: {
  title: string;
  onKeep: () => void;
  /** May be async: the sheet stays open, spinning, until it settles. */
  onStartNew: () => void | Promise<void>;
  keepLabel?: string;
  startNewLabel?: string;
  startBusyLabel?: string;
  sub?: string;
  figure?: { label: string; meta?: string; amount: string };
  /** What did NOT happen, prepended to a failure sentence. */
  consequence?: string;
}) {
  return (
    <PopSheet
      open
      destructive
      icon="edit"
      iconTone="gold"
      title={title}
      sub={sub}
      figure={figure}
      retryLabel="Try again"
      actions={[
        { label: keepLabel, kind: 'gold', safe: true },
        { label: startNewLabel, kind: 'danger', go: true, busyLabel: startBusyLabel },
      ]}
      onDismiss={onKeep}
      onConfirm={async () => { await onStartNew(); }}
      consequence={consequence}
    />
  );
}
