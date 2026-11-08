'use client';
// 4B-lite: the previous version, read-only. Every value comes from
// snapshotView(), which exposes display values and `editable: false` only —
// there is no input, no editor and no write path in here.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { money } from '@/lib/financials';
import type { SnapshotView } from '@/lib/estimates/versions';

export default function PreviousVersionPanel({
  view,
  onClose,
}: {
  view: SnapshotView;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-center md:items-center md:p-6" data-no-tab-swipe="true">
      <div className="absolute inset-0 bg-on-background/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Previous version ${view.label}`}
        style={{ maxHeight: '88dvh' }}
        className="relative flex w-full max-w-lg flex-col overflow-y-auto bg-background shadow-card-raised md:rounded-card"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[#1E1A15] px-4 py-2.5 text-[13px] font-semibold text-[#F4ECDD]">
          <span>{view.viewingLabel}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[36px] items-center px-1 text-[13px] font-semibold text-[#E2C25A]"
          >
            {view.backLabel}
          </button>
        </div>

        <div className="px-4 py-4">
          <div className="card opacity-85">
            {view.title && (
              <h2 className="font-display text-2xl font-bold leading-tight text-on-background">{view.title}</h2>
            )}

            <div className="mt-3 space-y-2">
              {view.items.map((item, i) => (
                <div key={`${i}-${item.description}`} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-semibold text-on-surface">{item.description || 'Item'}</span>
                    <span className="text-[12.5px] text-on-surface-variant">
                      {item.qty} {item.unit} × {money(item.unitPrice)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-on-surface">
                    {money(item.qty * item.unitPrice)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-1 border-t border-dashed border-outline-variant/60 pt-3 text-sm">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span>Subtotal</span>
                <span className="tabular-nums">{money(view.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-on-surface-variant">
                <span>Tax ({view.taxRate}%)</span>
                <span className="tabular-nums">{money(view.taxAmount)}</span>
              </div>
              <div className="flex items-center justify-between pt-1 font-semibold text-on-surface">
                <span>Total</span>
                <span className="font-display text-lg font-bold tabular-nums">{money(view.total)}</span>
              </div>
            </div>

            {view.notes && (
              <div className="mt-3 border-t border-outline-variant/40 pt-3 text-[13px] leading-relaxed text-on-surface-variant">
                {view.notes}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
