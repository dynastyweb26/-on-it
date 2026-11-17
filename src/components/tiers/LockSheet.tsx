'use client';
// 04 Lock sheet — design/tiers/Tiers_2_Locks_Plan_Cancel.dc.html §04.
// One layout, three features: what is locked, what it does, what the user
// keeps. Bottom sheet on a phone (4A), centered dialog at 1280 (4D).
//
// States (4C): idle; pending (gold button spinner, Not now / scrim / Escape /
// drag do nothing, repeat taps ignored by a synchronous ref); error (names the
// cause, the button reads "Try again"). The host owns what the button does.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSheetDrag } from '@/lib/use-sheet-drag';
import { LOCK_NOT_NOW, LOCK_TRY_AGAIN, type LockActions, type LockSheetCopy } from '@/lib/plan-lock-view';
import './tiers.css';

export type LockSheetState = 'idle' | 'pending' | 'error';

export default function LockSheet({
  copy, chip, actions, isPro, state = 'idle', error = null, onPrimary, onDismiss, inline = false,
}: {
  copy: LockSheetCopy;
  chip: string | null;
  actions: LockActions;
  /** Pro's button block (4C): the proration line, a shorter Not now. */
  isPro: boolean;
  state?: LockSheetState;
  /** The cause shown in the error state. */
  error?: { icon: string; text: string } | null;
  onPrimary: () => void;
  onDismiss: () => void;
  /** /dev fixtures: render in place, without the portal and scrim. */
  inline?: boolean;
}) {
  const titleId = useId();
  const busy = useRef(false);
  const [tapped, setTapped] = useState(false);
  const pending = state === 'pending' || tapped;
  // Pending clears on every exit: the host moving to error or idle ends it.
  useEffect(() => { if (state !== 'pending') { busy.current = false; setTapped(false); } }, [state]);

  const dismiss = () => { if (!busy.current && state !== 'pending') onDismiss(); };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => {
    if (inline) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inline]);
  const { handleProps, sheetStyle, scrimStyle } = useSheetDrag(dismiss);

  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!inline) sheetRef.current?.focus(); }, [inline]);

  const primary = () => {
    if (busy.current) return;
    busy.current = true;
    setTapped(true); // visible in the same frame as the tap
    onPrimary();
  };

  const sheet = (
    <div
      ref={sheetRef}
      className="tl-sheet"
      role="dialog"
      aria-modal={inline ? undefined : true}
      aria-labelledby={titleId}
      aria-busy={pending || undefined}
      tabIndex={-1}
      style={inline ? { animation: 'none' } : sheetStyle}
      data-lock-sheet={state}
    >
      <div className="tl-grip" aria-hidden {...(inline ? {} : handleProps)} />
      <div className="tl-top">
        <span className="tl-icon" aria-hidden><span className="material-symbols-outlined">{copy.icon}</span></span>
        <button type="button" className="tl-close" aria-label={LOCK_NOT_NOW} onClick={dismiss} disabled={pending}>
          <span className="material-symbols-outlined" aria-hidden>close</span>
        </button>
      </div>
      <h2 id={titleId} className="tl-title">{copy.title}</h2>
      <p className="tl-body">{copy.body}</p>
      {chip && (
        <span className="tl-chip">
          <span className="material-symbols-outlined" aria-hidden>workspace_premium</span>
          {chip}
        </span>
      )}
      {state === 'error' && error && (
        <div className="tl-error" role="alert">
          <span className="material-symbols-outlined" aria-hidden>{error.icon}</span>
          <span>{error.text}</span>
        </div>
      )}
      <div className={`tl-actions${isPro ? ' is-pro' : ''}`}>
        <button type="button" className={`tl-gold${pending ? ' is-pending' : ''}`} onClick={primary} aria-busy={pending || undefined}>
          {pending && <span className="tl-spinner" aria-hidden />}
          {state === 'error' ? LOCK_TRY_AGAIN : actions.primary}
        </button>
        {isPro && actions.note && state !== 'error' && !pending && <div className="tl-note">{actions.note}</div>}
        {state !== 'error' && (
          <button type="button" className="tl-later" onClick={dismiss} disabled={pending}>{LOCK_NOT_NOW}</button>
        )}
      </div>
    </div>
  );

  if (inline) return sheet;
  return createPortal(
    <div className="tl-root" data-no-tab-swipe="true">
      <div className="tl-scrim" style={scrimStyle} onClick={dismiss} aria-hidden />
      {sheet}
    </div>,
    document.body,
  );
}
