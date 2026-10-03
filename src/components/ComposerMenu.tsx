'use client';
// The composer's "+" menu (UI-REDESIGN-AUDIT §L, composer lock). The chat
// input bar is unchanged; only the gold circle's icon became a "+". Tapping it
// opens this menu: a cream scrim fades over the chat and the options rise out
// of the button, nearest first (45ms apart), stepping right on a shallow arc —
// the Claude Design expand (on-it-motion.html, "Composer › Tap +"), timed with
// MOTION-SPEC's tokens. Closing (×, scrim, Escape or a pick) reverses
// everything together, no stagger.
//
// Rendered inside the gold circle's `relative` wrapper, so the options sit
// right above it. The scrim is `fixed`, which also blocks tab swipes; the menu
// itself opts out explicitly (data-no-tab-swipe). Reduce Motion: the global
// rule lands every animation on its end state.
import { useEffect } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';

export type ComposerPick = 'mic' | 'invoice' | 'quote';

const OPTIONS: { key: ComposerPick; label: string; icon: IconName }[] = [
  { key: 'mic', label: 'Mic', icon: 'mic' },
  { key: 'invoice', label: 'New invoice', icon: 'description' },
  { key: 'quote', label: 'New quote', icon: 'request_quote' },
];
/** Horizontal step per option: the shallow arc (≈12°) the options rise along. */
const ARC_STEP = 10;
export const MENU_CLOSE_MS = 180;

export default function ComposerMenu({ closing, onPick, onClose }: {
  closing: boolean;
  /** Called synchronously inside the option's tap (Mic needs the gesture). */
  onPick: (k: ComposerPick) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div aria-hidden className={`onit-composer-scrim fixed inset-0 z-[45] bg-background/80${closing ? ' is-closing' : ''}`} onClick={onClose} />
      <div role="menu" aria-label="Start something" data-no-tab-swipe="true"
        className="absolute bottom-full left-0 z-[46] mb-3 flex flex-col-reverse items-start gap-2">
        {OPTIONS.map((o, i) => (
          <button key={o.key} type="button" role="menuitem"
            className={`onit-composer-option flex min-h-touch items-center gap-3 whitespace-nowrap rounded-full border border-outline-variant
              bg-surface-container-lowest py-1.5 pl-1.5 pr-5 text-label-lg font-semibold text-on-background shadow-card-raised active:scale-95${closing ? ' is-closing' : ''}`}
            style={{ marginLeft: i * ARC_STEP, animationDelay: closing ? '0ms' : `${i * 45}ms` }}
            onClick={() => onPick(o.key)}>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-primary-container text-on-background">
              <Icon name={o.icon} size={22} filled={o.key === 'mic'} />
            </span>
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}
