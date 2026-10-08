'use client';
// 2·13a: a fresh template (+ menu, a client's Invoice, ?template=) would
// replace a saved one that has a client or a named item. Keep editing brings
// the saved one back; Start new replaces it (its draft row is soft-deleted,
// drafts only). Scrim, Escape and swipe-down mean Keep editing — nothing is
// lost by dismissing.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSheetDrag } from '@/lib/use-sheet-drag';

export default function ReplaceTemplateSheet({ title, onKeep, onStartNew }: {
  title: string;
  onKeep: () => void;
  onStartNew: () => void;
}) {
  const { handleProps, sheetStyle, scrimStyle } = useSheetDrag(onKeep);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onKeep(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKeep]);

  return createPortal(
    <div className="fixed inset-0 z-[72] flex items-end justify-center" data-no-tab-swipe="true">
      <div className="onit-composer-scrim absolute inset-0 bg-on-background/40" style={scrimStyle} onClick={onKeep} />
      <div role="alertdialog" aria-modal="true" aria-labelledby="replace-template-title" style={sheetStyle}
        className="onit-sheet-in relative w-full max-w-lg rounded-t-card bg-background shadow-card-raised">
        <div data-sheet-handle="" className="cursor-grab select-none pb-1" {...handleProps}>
          <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-outline-variant" />
        </div>
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <h2 id="replace-template-title" className="text-center text-[18px] font-bold leading-snug text-on-background">{title}</h2>
          <div className="mt-5 flex flex-col gap-2.5">
            <button type="button" autoFocus onClick={onKeep} className="btn-primary w-full">Keep editing</button>
            <button type="button" onClick={onStartNew} className="btn-outline w-full">Start new</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
