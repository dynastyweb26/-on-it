'use client';
// The template's Extra info sheet (UI-REDESIGN-AUDIT §1.4; merge 2 · 2·12a):
// a free-text note ("Due Friday, job address, notes for the client…", ≤ 500)
// with quick chips — Due Friday · Due in 14 days · 50% deposit · Job at
// {address} (only when the client has an address on file) — and Done. The
// due date and deposit are read from the text on the device (lib/extra-info);
// the text itself becomes the document's notes. Keyboard-fitted like the
// pickers (2·10c); Cancel / scrim / Escape / swipe-down discard the edit.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EXTRA_MAX, addPhrase, parseExtraInfo } from '@/lib/extra-info';
import { useSheetDrag } from '@/lib/use-sheet-drag';

const shortDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export default function ExtraInfoSheet({ value, address, onDone, onClose }: {
  value: string;
  /** The picked client's address, for the "Job at …" chip. */
  address: string | null;
  onDone: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { handleProps, sheetStyle, scrimStyle } = useSheetDrag(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const job = address ? `Job at ${address.replace(/\s*\n\s*/g, ', ').trim()}` : null;
  const chips = ['Due Friday', 'Due in 14 days', '50% deposit', ...(job ? [job] : [])];
  const read = parseExtraInfo(text);
  const understood = [
    read.due ? `Due ${shortDate(read.due)}` : null,
    read.deposit ? (read.deposit.type === 'percentage' ? `${read.deposit.value}% deposit` : `$${read.deposit.value} deposit`) : null,
  ].filter(Boolean);

  return createPortal(
    <div className="fixed inset-0 z-[72] flex items-end justify-center" data-no-tab-swipe="true" data-kb-fit="">
      <div className="onit-composer-scrim absolute inset-0 bg-on-background/40" style={scrimStyle} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Extra info" style={sheetStyle}
        className="onit-sheet-in relative flex max-h-[min(92dvh,calc(100%-8px))] w-full max-w-lg flex-col rounded-t-card bg-background shadow-card-raised">
        <div data-sheet-handle="" className="shrink-0 cursor-grab select-none" {...handleProps}>
          <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-outline-variant" />
          <div className="relative flex h-12 items-center justify-center px-4">
            <button type="button" onClick={onClose} className="absolute left-3 min-h-touch px-1 text-[17px] text-primary">Cancel</button>
            <h2 className="text-[17px] font-bold text-on-background">Extra info</h2>
            <button type="button" onClick={() => onDone(text.trim())} className="absolute right-3 min-h-touch px-1 text-[17px] font-bold text-primary">Done</button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <textarea ref={ref} value={text} rows={4} maxLength={EXTRA_MAX} aria-label="Extra info"
            onChange={(e) => setText(e.target.value.slice(0, EXTRA_MAX))}
            placeholder="Due Friday, job address, notes for the client…"
            className="w-full resize-none rounded-card border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 text-body-lg text-on-background outline-none placeholder:text-on-surface-variant/70 focus:border-primary" />
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.map((c) => (
              <button key={c} type="button" onClick={() => setText((t) => addPhrase(t, c))}
                className="max-w-full truncate rounded-full border border-outline-variant bg-surface-container-lowest px-3.5 py-2 text-[14px] font-semibold text-on-background active:scale-95">
                {c}
              </button>
            ))}
          </div>
          {understood.length > 0 && (
            <p className="mt-3 text-[13.5px] text-on-surface-variant">On the invoice: {understood.join(' · ')}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
