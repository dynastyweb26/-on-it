'use client';
// The template's picker sheet (release frames 1g Client, 1h Product or
// service; UI-REDESIGN-AUDIT §1.4): Cancel · title, a real search field,
// "USED BEFORE · NOT SAVED" (history rows), A–Z groups with the scrub rail,
// a "Use '{q}'" row when the search names something new (a one-off that
// saves nothing), and a pinned "+ New …" button. Escape / the scrim / Cancel
// / a swipe down on the grabber or header (2·10a, lib/use-sheet-drag) close
// without picking.
//
// "+ New …" (2·10b) swaps the list for the existing create form (the
// Clients tab's own form, embedded), with the search pre-filled; saving writes
// the row and picks it. While the form is open, Cancel, Escape and a swipe
// down on the grabber or the form's top bar go back to the list instead of
// closing. Guests have nothing to save to, so they don't get "+ New".
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import { AlphaSections } from '@/components/lists/SavedList';
import { groupByLetter, matchesQuery } from '@/lib/clients';
import { hasExactName } from '@/lib/template';
import { useSheetDrag } from '@/lib/use-sheet-drag';

export type PickRow = { id: string; name: string };

export type CreateArgs = {
  /** The search text, to pre-fill the form's name. */
  name: string;
  /** Spread onto the form's top bar: it drags like the sheet's header. */
  barProps: React.HTMLAttributes<HTMLDivElement>;
  /** Back to the list (the form's Cancel). */
  onCancel: () => void;
};

export default function PickerSheet<T extends PickRow>({
  title, searchNoun, idPrefix, saved, history, loading, renderRow, onPick, onUseName, newLabel, onClose, renderCreate,
}: {
  title: string;
  /** "clients" / "items" — for "Search 18 clients". */
  searchNoun: [singular: string, plural: string];
  idPrefix: string;
  saved: T[];
  history: T[];
  loading: boolean;
  renderRow: (row: T, kind: 'saved' | 'history') => ReactNode;
  onPick: (row: T) => void;
  onUseName: (name: string) => void;
  newLabel: string;
  onClose: () => void;
  /** The embedded create form; omit it (guests) to hide "+ New …". */
  renderCreate?: (args: CreateArgs) => ReactNode;
}) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const backToList = () => setCreating(null);

  // The focused field stays between the form's sticky Cancel · Save bar and
  // the bottom of the (keyboard-fitted) sheet. Checked again once the
  // keyboard has finished animating in and the sheet has been re-fitted.
  const formScroll = useRef<HTMLDivElement>(null);
  function keepFieldInView(e: React.FocusEvent<HTMLDivElement>) {
    const field = e.target as HTMLElement;
    if (!/^(INPUT|TEXTAREA)$/.test(field.tagName)) return;
    const fit = () => {
      const sc = formScroll.current;
      if (!sc || !field.isConnected || document.activeElement !== field) return;
      const box = sc.getBoundingClientRect();
      const bar = sc.querySelector<HTMLElement>('[data-form-bar]');
      const top = box.top + (bar ? bar.offsetHeight : 0) + 8;
      const bottom = box.bottom - 12;
      const r = field.getBoundingClientRect();
      if (r.bottom > bottom) sc.scrollTop += r.bottom - bottom;
      else if (r.top < top) sc.scrollTop -= top - r.top;
    };
    requestAnimationFrame(fit);
    setTimeout(fit, 400);
  }
  const { handleProps, sheetStyle, scrimStyle } = useSheetDrag(creating !== null ? backToList : onClose, creating === null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') (creating !== null ? setCreating(null) : onClose()); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, creating]);

  const query = q.trim();
  const savedShown = useMemo(() => saved.filter((r) => matchesQuery(r.name, q)), [saved, q]);
  const historyShown = useMemo(() => history.filter((r) => matchesQuery(r.name, q)), [history, q]);
  const groups = useMemo(() => groupByLetter(savedShown, (r) => r.name), [savedShown]);
  const total = saved.length + history.length;
  const exact = hasExactName([...saved, ...history].map((r) => r.name), query);

  const rowButton = (r: T, kind: 'saved' | 'history') => (
    <button key={r.id} type="button" onClick={() => onPick(r)}
      className="flex min-h-[60px] w-full items-center gap-3 border-b border-outline-variant/50 py-2 text-left active:bg-surface-container">
      {renderRow(r, kind)}
    </button>
  );

  // Portaled to <body>: the template card animates with a transform, which
  // would otherwise make this fixed sheet position against the card.
  return createPortal(
    // data-kb-fit (lib/keyboard.ts): while the keyboard is up this layer is
    // pinned to window.visualViewport (top = offsetTop, height = height,
    // tracked on its resize and scroll), and the sheet fills it — so nothing
    // sits under the keyboard, iOS has no reason to pan the page, and the
    // scroll area never gets keyboard padding (2·10c).
    <div className="fixed inset-0 z-[70] flex items-end justify-center" data-no-tab-swipe="true" data-kb-fit="">
      <div className="onit-composer-scrim absolute inset-0 bg-on-background/40" style={scrimStyle} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} style={sheetStyle}
        className="onit-sheet-in relative flex h-[min(92dvh,calc(100%-8px))] w-full max-w-lg flex-col rounded-t-card bg-background shadow-card-raised">
        {/* Drag handle: the grabber + header. Swipe down to close. */}
        <div data-sheet-handle="" className="shrink-0 cursor-grab select-none" {...handleProps}>
          <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-outline-variant" />
          {creating === null && <div className="relative flex h-12 items-center justify-center px-4">
            <button type="button" onClick={onClose} className="absolute left-3 min-h-touch px-1 text-[17px] text-primary">Cancel</button>
            <h2 className="text-[17px] font-bold text-on-background">{title}</h2>
          </div>}
        </div>
        {creating !== null && renderCreate ? (
          <div ref={formScroll} onFocus={keepFieldInView} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {renderCreate({ name: creating, barProps: { ...handleProps, 'data-sheet-handle': '' } as React.HTMLAttributes<HTMLDivElement>, onCancel: backToList })}
          </div>
        ) : (<>
        <div className="shrink-0 px-4 pb-2">
          <label className="flex h-11 items-center gap-2 rounded-[12px] bg-surface-container px-3">
            <Icon name="search" size={20} className="shrink-0 text-on-surface-variant" />
            <input ref={inputRef} type="search" value={q} onChange={(e) => setQ(e.target.value.slice(0, 120))}
              placeholder={`Search ${total} ${total === 1 ? searchNoun[0] : searchNoun[1]}`} aria-label={`Search ${searchNoun[1]}`}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-body-lg text-on-background outline-none placeholder:text-on-surface-variant" />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {loading ? (
            <div className="space-y-3 pt-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-card bg-surface-container" />)}
            </div>
          ) : (
            <>
              {query && !exact && (
                <button type="button" onClick={() => onUseName(query)}
                  className="mt-1 flex min-h-[56px] w-full items-center gap-3 rounded-card bg-primary-soft px-3 text-left active:scale-[0.99]">
                  <Icon name="add" size={22} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[17px] font-semibold text-on-background">Use “{query}”</span>
                </button>
              )}
              {historyShown.length > 0 && (
                <section aria-label="Used before, not saved">
                  <h3 className="pb-1 pt-3 text-[12.5px] font-bold uppercase tracking-[.08em] text-[#8C6D10]">Used before · not saved</h3>
                  {historyShown.map((r) => rowButton(r, 'history'))}
                </section>
              )}
              {groups.length > 0 && (
                <AlphaSections groups={groups} idPrefix={idPrefix} showRail={!query && savedShown.length > 8}
                  renderRow={(r) => rowButton(r, 'saved')} />
              )}
              {total === 0 && !query && (
                <p className="mt-10 text-center text-body-md text-on-surface-variant">
                  Nothing saved yet. Type a name above to use it.
                </p>
              )}
              {total > 0 && query && savedShown.length === 0 && historyShown.length === 0 && (
                <p className="mt-6 text-center text-body-md text-on-surface-variant">No matches for “{query}”</p>
              )}
            </>
          )}
        </div>

        {renderCreate && (
          <div className="shrink-0 border-t border-outline-variant/40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <button type="button" onClick={() => setCreating(query)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-primary-container bg-[#F6EBC6] text-[17px] font-bold text-on-background active:scale-[0.98]">
              <Icon name="add" size={22} /> {newLabel}
            </button>
          </div>
        )}
        </>)}
      </div>
    </div>,
    document.body,
  );
}
