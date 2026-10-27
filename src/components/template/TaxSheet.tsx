'use client';
// The template's Add tax sheet: one percent field. Tax varies by where the job
// is, so there is no default; empty / 0 means no tax. Same keyboard-fitted
// bottom sheet as Extra info (Cancel / scrim / Escape / swipe-down discard).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSheetDrag } from '@/lib/use-sheet-drag';

export const TAX_MAX = 30;

export default function TaxSheet({ value, onDone, onClose }: {
  value: number | null;
  onDone: (rate: number | null) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(value ? String(value) : '');
  const ref = useRef<HTMLInputElement>(null);
  const { handleProps, sheetStyle, scrimStyle } = useSheetDrag(onClose);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const n = Number(text);
  const rate = Number.isFinite(n) && n > 0 && n <= TAX_MAX ? n : null;

  return createPortal(
    <div className="fixed inset-0 z-[72] flex items-end md:items-center md:p-6 justify-center" data-no-tab-swipe="true" data-kb-fit="">
      <div className="onit-composer-scrim absolute inset-0 bg-on-background/40" style={scrimStyle} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Tax" style={sheetStyle}
        className="onit-sheet-in relative flex w-full max-w-lg flex-col rounded-t-card md:rounded-card bg-background shadow-card-raised">
        <div data-sheet-handle="" className="shrink-0 cursor-grab select-none" {...handleProps}>
          <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-outline-variant" />
          <div className="relative flex h-12 items-center justify-center px-4">
            <button type="button" onClick={onClose} className="absolute left-3 min-h-touch px-1 text-[17px] text-primary">Cancel</button>
            <h2 className="text-[17px] font-bold text-on-background">Tax</h2>
            <button type="button" onClick={() => onDone(rate)} className="absolute right-3 min-h-touch px-1 text-[17px] font-bold text-primary">Done</button>
          </div>
        </div>
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <label className="flex items-center gap-3">
            <input ref={ref} type="text" inputMode="decimal" autoComplete="off" aria-label="Tax rate percent"
              value={text} placeholder="0"
              onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))}
              className="h-12 w-28 rounded-card border border-outline-variant/60 bg-surface-container-lowest px-3 text-right text-[20px] font-bold text-on-background outline-none focus:border-primary" />
            <span className="text-[17px] text-on-surface-variant">%</span>
          </label>
          <p className="mt-2 text-[13.5px] text-on-surface-variant">Sales tax varies by where the job is. Up to {TAX_MAX}%.</p>
          {value ? (
            <button type="button" onClick={() => onDone(null)} className="mt-2 min-h-touch text-[15px] font-semibold text-error">Remove tax</button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
