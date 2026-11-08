'use client';
// One decision, said out loud: a destructive write, or one that mints a
// numbered document. Sibling of ReplaceTemplateSheet — same portal, sheet drag,
// Escape and scrim — plus the states CLAUDE.md asks for (idle, pending, error,
// repeat-tap). Scrim, Escape, swipe and Cancel all mean "no", and none of them
// can fire while the action is running.
//
// `pending` comes from the caller (its async work); the local ref makes the
// second tap of the same frame a no-op before that state lands, and the local
// `armed` flag locks both buttons the moment the first tap fires.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSheetDrag } from '@/lib/use-sheet-drag';

export default function ConfirmSheet({
  title,
  body,
  detail,
  confirmLabel,
  cancelLabel = 'Cancel',
  pendingLabel = 'Working…',
  destructive = false,
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** Why it is asking, in one sentence. */
  body?: string;
  /** The figure the decision is about (an amount, a number). */
  detail?: string;
  confirmLabel: string;
  cancelLabel?: string;
  pendingLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  /** Inline, inside the sheet — it stays open so the action can be retried. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tapRef = useRef(false);
  const [armed, setArmed] = useState(false);
  const busy = pending || armed;
  const titleId = useId();

  // Cancel is only ever "no": it cannot fire once the action has started.
  const { handleProps, sheetStyle, scrimStyle } = useSheetDrag(() => {
    if (!busy) onCancel();
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending && !armed) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, armed, onCancel]);

  // A failed attempt unlocks both buttons so Retry is possible (the error is
  // how the caller re-opens the question).
  useEffect(() => {
    if (!error) return;
    tapRef.current = false;
    setArmed(false);
  }, [error]);

  function confirm() {
    if (tapRef.current || pending) return;
    tapRef.current = true;
    setArmed(true);
    onConfirm();
  }

  return createPortal(
    <div className="fixed inset-0 z-[72] flex items-end md:items-center md:p-6 justify-center" data-no-tab-swipe="true">
      <div className="onit-composer-scrim absolute inset-0 bg-on-background/40" style={scrimStyle}
        onClick={() => { if (!busy) onCancel(); }} />
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} style={sheetStyle}
        className="onit-sheet-in relative w-full max-w-lg rounded-t-card md:rounded-card bg-background shadow-card-raised">
        <div data-sheet-handle="" className="cursor-grab select-none pb-1" {...handleProps}>
          <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-outline-variant" />
        </div>
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <h2 id={titleId} className="text-center text-[18px] font-bold leading-snug text-on-background">{title}</h2>
          {detail && (
            <p className="mt-1.5 text-center font-display text-3xl font-bold leading-none tracking-tight tabular-nums text-on-background">
              {detail}
            </p>
          )}
          {body && (
            <p className="mt-2 text-center text-[14px] leading-[20px] text-on-surface-variant">{body}</p>
          )}
          {error && (
            <p role="alert" className="mt-3 rounded-input bg-error-container px-3 py-2 text-[13px] font-semibold text-error-on-container">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2.5">
            <button type="button" autoFocus onClick={confirm} disabled={busy}
              className={destructive
                ? 'min-h-touch w-full rounded-full border border-error/40 bg-error-container px-4 py-3 text-[15px] font-bold text-error-on-container transition active:scale-[0.985] disabled:opacity-60'
                : 'btn-primary w-full disabled:opacity-60'}>
              {busy ? pendingLabel : confirmLabel}
            </button>
            <button type="button" onClick={() => { if (!busy) onCancel(); }} disabled={busy}
              className="btn-outline w-full disabled:opacity-60">
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
