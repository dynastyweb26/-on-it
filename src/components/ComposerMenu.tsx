'use client';
// The composer's "+" menu (release frames 1b/1c, motion spec 1d). Tapping "+"
// turns it into × (the button itself, in chat/page.tsx), a cream frost fades
// over the chat (220ms ease; the bar stays sharp above it), and the options
// rise out of the button: each starts 16–40px low at .88 scale and settles in
// 340ms cubic-bezier(.2,1.3,.4,1), nearest the "+" first, 45ms apart.
// Closing (×, scrim, Escape or a pick) reverses everything together with no
// stagger (180ms).
//
// Rendered inside the "+" button's wrapper, so the options sit right above it.
// The scrim is `fixed`, which also blocks tab swipes; the menu itself opts out
// explicitly (data-no-tab-swipe). Reduce Motion: the global rule lands every
// animation on its end state.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';

export type ComposerPick = 'mic' | 'invoice' | 'quote';

// Top to bottom; the last one sits nearest the "+".
const OPTIONS: { key: ComposerPick; label: string; sub: string; icon: IconName; disc: string }[] = [
  { key: 'mic', label: 'Voice', sub: 'Say it, On It writes it', icon: 'mic', disc: 'bg-primary-soft' },
  // Invoice and quote open the guided template in place (merge 2 · 2·12c).
  { key: 'invoice', label: 'New invoice', sub: 'Guided template', icon: 'description', disc: 'bg-primary-container' },
  { key: 'quote', label: 'New quote', sub: 'Guided template', icon: 'request_quote', disc: 'bg-primary-soft' },
];
export const MENU_CLOSE_MS = 180;

export default function ComposerMenu({ closing, onPick, onClose }: {
  closing: boolean;
  /** Called synchronously inside the option's tap (Voice needs the gesture). */
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
      {/* Portaled to <body> so it covers the chat but not the bar: the
          composer is lifted to z-46 while the menu is open. */}
      {createPortal(
        <div aria-hidden className={`onit-composer-scrim fixed inset-0 z-[45] bg-background/85${closing ? ' is-closing' : ''}`} onClick={onClose} />,
        document.body,
      )}
      <div role="menu" aria-label="Start something" data-no-tab-swipe="true"
        className="absolute bottom-full left-0 z-[46] mb-2 flex flex-col items-start gap-2">
        {OPTIONS.map((o, i) => {
          const fromPlus = OPTIONS.length - 1 - i; // 0 = nearest the "+"
          const delay = closing ? 0 : fromPlus * 45;
          return (
            <button key={o.key} type="button" role="menuitem"
              className={`onit-composer-option flex h-14 items-center gap-3 whitespace-nowrap rounded-full border border-outline-variant
                bg-surface-container-lowest pl-2 pr-[22px] text-left text-on-background shadow-[0_10px_26px_rgba(34,30,24,.14)] active:scale-95${closing ? ' is-closing' : ''}`}
              style={{
                ['--rise' as string]: `${16 + fromPlus * 12}px`,
                animationDelay: `${delay}ms, ${delay}ms`,
              }}
              onClick={() => onPick(o.key)}>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${o.disc}`}>
                <Icon name={o.icon} size={22} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-semibold leading-tight">{o.label}</span>
                <span className="text-[12.5px] leading-tight text-on-surface-variant">{o.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
