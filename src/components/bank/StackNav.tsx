'use client';
// The pointer-device way through the stack: ← / →.
//
// It belongs to the sheet, not to a card, so it renders for every card type —
// an expense, a plain deposit, a STRIPE descriptor, a pending one, one the bank
// removed. `kind` is only reported (data-stack-nav) so a test can prove that:
// nothing here may branch on it, because a card type must never lose the arrows.
import Icon from '@/components/Icon';
import type { StackCardKind } from '@/lib/bank-stack';

export default function StackNav({
  kind, pending, pos, filter, onStep,
}: {
  kind: StackCardKind;
  /** Items in To review; the arrows are inert when there are none. */
  pending: number;
  pos: number;
  filter: 'review' | 'ignored';
  onStep: (dir: 1 | -1) => void;
}) {
  const live = filter === 'review' && pending > 0;
  return (
    <div
      data-stack-nav={kind}
      className="hidden shrink-0 items-center justify-center gap-2 pb-2 pt-3 [@media(hover:hover)]:flex"
    >
      <button
        type="button"
        aria-label="Previous item"
        aria-keyshortcuts="ArrowLeft"
        disabled={!live || pos === 0}
        onClick={() => onStep(-1)}
        className="grid h-11 w-11 place-items-center rounded-full border border-outline-variant bg-surface-container-lowest disabled:opacity-40"
      >
        <Icon name="arrow_back" size={20} />
      </button>
      <button
        type="button"
        aria-label="Next item"
        aria-keyshortcuts="ArrowRight"
        disabled={!live || pos >= pending - 1}
        onClick={() => onStep(1)}
        className="grid h-11 w-11 place-items-center rounded-full border border-outline-variant bg-surface-container-lowest disabled:opacity-40"
      >
        <Icon name="arrow_forward" size={20} />
      </button>
    </div>
  );
}
