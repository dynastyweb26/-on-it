'use client';
// Building blocks shared by the saved lists on the Clients tab (release
// frames 3a / 3e): the search bar with its gold +, A–Z sections with a scrub
// rail, a row that long-presses to a menu, and that menu (the row lifts over
// a dimmed list, actions below it). Tab-root rows never swipe: a horizontal
// drag belongs to the tab deck. Nested routes (e.g. recurring) opt in.
// List motion (2·14): search reflow, letter-jump header pulse, new-entry glow,
// undo re-expand, long-press lift; JS-driven motion skips under Reduce Motion.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import SwipeableRow from '@/components/SwipeableRow';
import { RAIL_LETTERS } from '@/lib/clients';
import { reducedMotion } from '@/lib/list-motion';
import { useLongPress } from '@/lib/use-long-press';

export function SearchBar({ value, onChange, placeholder, label, onAdd, addLabel }: {
  value: string; onChange: (v: string) => void; placeholder: string; label: string;
  onAdd: () => void; addLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest px-4">
        <Icon name="search" size={20} className="shrink-0 text-on-surface-variant" />
        <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label}
          className="min-w-0 flex-1 bg-transparent text-body-lg text-on-background outline-none placeholder:text-on-surface-variant" />
      </label>
      <button type="button" aria-label={addLabel} onClick={onAdd} data-coach="clients-add"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary-container text-on-background shadow-card transition active:scale-90">
        <Icon name="add" size={26} />
      </button>
    </div>
  );
}

/** A–Z sticky headers plus the scrub rail (hidden while searching). */
export function AlphaSections<T>({ groups, idPrefix, showRail, renderRow, query = '' }: {
  groups: { letter: string; rows: T[] }[];
  idPrefix: string;
  showRail: boolean;
  renderRow: (row: T) => ReactNode;
  /** The search text: each change reflows the list (fade + 6 px settle). */
  query?: string;
}) {
  const present = new Set(groups.map((g) => g.letter));
  const railRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastJump = useRef('');
  const firstQuery = useRef(true);
  useEffect(() => {
    if (firstQuery.current) { firstQuery.current = false; return; }
    if (reducedMotion()) return;
    listRef.current?.animate?.(
      [{ opacity: 0.55, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: 160, easing: 'cubic-bezier(.2, 0, 0, 1)' },
    );
  }, [query]);
  // Tap or drag a letter → jump to it (or the next letter that has rows).
  function jumpAt(clientY: number) {
    const rail = railRef.current;
    if (!rail) return;
    const r = rail.getBoundingClientRect();
    const i = Math.min(RAIL_LETTERS.length - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * RAIL_LETTERS.length)));
    const target = RAIL_LETTERS.slice(i).find((l) => present.has(l)) ?? [...present].pop();
    if (!target || target === lastJump.current) return;
    lastJump.current = target;
    const header = document.getElementById(`${idPrefix}-letter-${target}`);
    header?.scrollIntoView({ block: 'start' });
    try { navigator.vibrate?.(5); } catch { /* unsupported */ }
    // The landed-on header pulses gold.
    if (!reducedMotion()) {
      header?.querySelector('span')?.animate?.(
        [{ transform: 'scale(1)', color: '#8C6D10' }, { transform: 'scale(1.35)', color: '#D4AF37' }, { transform: 'scale(1)', color: '#8C6D10' }],
        { duration: 240, easing: 'cubic-bezier(.65, 0, .35, 1)' },
      );
    }
  }
  return (
    <div ref={listRef} className="relative mt-2 pr-5">
      {groups.map((g) => (
        <section key={g.letter} aria-label={g.letter}>
          <h2 id={`${idPrefix}-letter-${g.letter}`}
            className="sticky top-0 z-[1] bg-background pb-1 pt-3 text-label-lg font-bold text-[#8C6D10]">
            <span className="inline-block origin-left">{g.letter}</span>
          </h2>
          {g.rows.map(renderRow)}
        </section>
      ))}
      {/* The rail sits beside the list and sticks to the top while it scrolls. */}
      {showRail && (
        <div className="absolute bottom-0 right-0 top-0 w-5">
          <div ref={railRef} aria-hidden data-no-tab-swipe="true"
            className="sticky top-2 flex touch-none select-none flex-col items-center pt-3"
            onPointerDown={(e) => { (e.target as Element).releasePointerCapture?.(e.pointerId); lastJump.current = ''; jumpAt(e.clientY); }}
            onPointerMove={(e) => { if (e.buttons) jumpAt(e.clientY); }}>
            {RAIL_LETTERS.map((l) => (
              <span key={l} className={`w-5 text-center text-[10.5px] font-bold leading-[15px] ${present.has(l) ? 'text-[#8C6D10]' : 'text-[#D6CCB8]'}`}>{l}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A list row: tap opens, long-press opens the menu. Nested routes opt into swipe. */
export function ListRow({ onOpen, onEdit, onDelete, onLongPress, motion, id, children }: {
  onOpen: () => void;
  /** Both are required to opt into SwipeableRow; tab-root rows omit them. */
  onEdit?: () => void;
  onDelete?: () => void;
  onLongPress: (rect: DOMRect) => void;
  /** 'new': slides into its slot and glows; 'expand': re-opens after Undo. */
  motion?: 'new' | 'expand' | null;
  id?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const press = useLongPress(() => { if (ref.current) onLongPress(ref.current.getBoundingClientRect()); });
  const row = (
    <button ref={ref} type="button"
      className={`flex min-h-[64px] w-full items-center gap-3 border-b border-outline-variant/50 py-2.5 text-left active:bg-surface-container${motion === 'new' ? ' onit-new-entry' : ''}`}
      {...press.handlers}
      onClick={() => { if (press.consumeClick()) return; onOpen(); }}>
      {children}
    </button>
  );
  return (
    <div id={id} className={motion === 'expand' ? 'onit-row-expand' : undefined}>
      {onEdit && onDelete
        ? <SwipeableRow flat onEdit={onEdit} onDelete={onDelete}>{row}</SwipeableRow>
        : row}
    </div>
  );
}

export type MenuItem = { label: string; icon: IconName; danger?: boolean; onClick: () => void };

/** Long-press menu (frames 3e): the row lifts over a dimmed list, actions below it. */
export function RowMenu({ rect, lifted, label, items, onClose }: {
  rect: DOMRect; lifted: ReactNode; label: string; items: MenuItem[]; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const menuH = items.length * 56;
  const [below] = useState(() => rect.bottom + menuH + 20 < window.innerHeight);
  return (
    <div className="fixed inset-0 z-[60]" data-no-tab-swipe="true">
      <div className="onit-composer-scrim absolute inset-0 bg-on-background/30" onClick={onClose} />
      <div className="onit-lift absolute rounded-card bg-surface-container-lowest px-4 py-2.5 shadow-card-raised"
        style={{ left: rect.left - 8, top: rect.top - 4, width: rect.width + 16 }}>
        {lifted}
      </div>
      <div role="menu" aria-label={label}
        className="onit-menu-in absolute w-56 overflow-hidden rounded-card bg-surface-container-lowest shadow-card-raised"
        style={below
          ? { left: rect.left, top: rect.bottom + 8, transformOrigin: '24px 0' }
          : { left: rect.left, top: rect.top - 8 - menuH, transformOrigin: '24px 100%' }}>
        {items.map((it) => (
          <button key={it.label} type="button" role="menuitem" onClick={it.onClick}
            className={`flex h-14 w-full items-center justify-between border-b border-outline-variant/50 px-4 text-body-lg last:border-b-0 active:bg-surface-container
              ${it.danger ? 'text-error' : 'text-on-background'}`}>
            {it.label} <Icon name={it.icon} size={20} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** The saved lists' empty state (frames 3d / 3g). */
export function SavedEmpty({ icon, title, body, action, onAction, round = true, coach }: {
  icon: IconName; title: string; body: string; action: string; onAction: () => void; round?: boolean;
  /** data-coach id for the action button (coach-mark tour target). */
  coach?: string;
}) {
  return (
    <div className="onit-rise mt-20 px-4 text-center">
      <span className={`mx-auto grid h-20 w-20 place-items-center bg-primary-soft text-on-background ${round ? 'rounded-full' : 'rounded-[22px]'}`}>
        <Icon name={icon} size={36} />
      </span>
      <h1 className="mt-5 font-display text-xl font-bold text-on-background">{title}</h1>
      <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">{body}</p>
      <button type="button" data-coach={coach} className="btn-primary mx-auto mt-6 px-7" onClick={onAction}>
        <Icon name="add" size={22} /> {action}
      </button>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-busy="true">
      <div className="h-12 animate-pulse rounded-full bg-surface-container" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-surface-container" />)}
    </div>
  );
}
