'use client';
/* ═══ TourPicker — "How On It works" button + tutorial picker dropdown ═══
   Lists the five tutorials (data.ts), the tab you are on first; picking one
   calls onPick(tab) and the shell plays it in the full-screen overlay (no
   navigation).

   One component, used for every "How On It works" button (header pill on
   phones, sidebar pill from md up). Settings › Help › "Replay the
   walkthrough" opens it by dispatching OPEN_TOUR_PICKER — whichever picker's
   button is currently visible opens, anchored under its own button.

   Accessibility: menu button pattern — aria-haspopup / aria-expanded /
   aria-controls; arrow keys, Home/End move between items; Escape or Tab
   closes; focus returns to the button on Escape and after a pick; an outside
   tap closes it. Every item is ≥44px tall. */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { TutorialTab } from '@/lib/tutorial-seen';
import { TUTORIALS } from './data';
import { tabAt } from './TutorialHost';

export const OPEN_TOUR_PICKER = 'onit-open-tour-picker';

interface Props {
  onPick: (tab: TutorialTab) => void;
  /** Classes for the trigger button (each placement keeps its own look). */
  buttonClassName: string;
  children: ReactNode;
  /** Which edge of the button the menu lines up with. */
  align?: 'left' | 'right';
  /** Called on every tap of the trigger (e.g. to stop the sign-in throb). */
  onButtonPress?: () => void;
}

export default function TourPicker({ onPick, buttonClassName, children, align = 'right', onButtonPress }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const current = tabAt(usePathname());
  const tabs = (Object.keys(TUTORIALS) as TutorialTab[]).sort(
    (a, b) => Number(b === current) - Number(a === current),
  );

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  // Outside tap closes (pointerdown, so it beats any click handler below).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, close]);

  // Settings › Help › "Replay the walkthrough": open the visible picker.
  useEffect(() => {
    const onOpen = () => {
      const b = buttonRef.current;
      if (b && b.getClientRects().length > 0) setOpen(true);
    };
    window.addEventListener(OPEN_TOUR_PICKER, onOpen);
    return () => window.removeEventListener(OPEN_TOUR_PICKER, onOpen);
  }, []);

  function onMenuKey(e: KeyboardEvent) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close(false);
  }

  function onButtonKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); close(true); }
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`relative before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] ${buttonClassName}`}
        onClick={() => { onButtonPress?.(); setOpen((o) => !o); }}
        onKeyDown={onButtonKey}
      >
        {children}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Pick a tutorial to watch"
          onKeyDown={onMenuKey}
          className={`absolute top-full z-[80] mt-2 w-56 max-w-[calc(100vw-32px)] origin-top overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface py-1.5 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Watch a tutorial
          </p>
          {tabs.map((key, i) => (
            <button
              key={key}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="flex min-h-[44px] w-full items-center px-4 text-left text-base font-semibold text-on-background transition-colors hover:bg-surface-container-high focus:bg-surface-container-high focus:outline-none"
              onClick={() => { close(true); onPick(key); }}
            >
              {TUTORIALS[key].name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
