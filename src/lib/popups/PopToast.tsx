'use client';
// PopToast — the kit's one status line.
// Board: design/popups/boards/PopToast.dc.html.
//
// 12px above the composer, one at a time, role="status". Info lasts 2.4 s; a
// toast carrying an action (undo) lasts 6 s with a time bar. Tapping the action
// holds the toast open while the request runs (nowhere else can report its
// outcome), then shows `doneText` for another 2.4 s. A failure holds it open
// with the real cause and turns the action into the retry.
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { TapLock, TOAST_INFO_MS, toastLifetime } from './action-guard';
import { popupError, type PopupError } from './error-frame';
import Spinner from './Spinner';

export default function PopToast({
  text,
  icon = 'check',
  action,
  doneText,
  notDone,
  onAction,
  onDismiss,
}: {
  text: string;
  icon?: IconName;
  action?: { label: string; busyLabel?: string; retryLabel?: string };
  /** Shown instead of `text` once the action lands (`INV-0007 is back.`). */
  doneText?: string;
  /** What the action did not do, for its failure (`Nothing was restored.`). */
  notDone?: string;
  onAction?: () => Promise<void>;
  onDismiss: () => void;
}) {
  const lock = useRef(new TapLock()).current;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PopupError | null>(null);
  const [finished, setFinished] = useState(false);
  const [barKey, setBarKey] = useState(0);

  // Hold the toast open while it is busy or reporting a failure: it is the only
  // surface that can say what happened.
  useEffect(() => {
    if (pending || error) return;
    const ms = finished || !action ? TOAST_INFO_MS : toastLifetime(true);
    const t = setTimeout(() => dismissRef.current(), ms);
    return () => clearTimeout(t);
  }, [pending, error, finished, action]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pending) dismissRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending]);

  async function act() {
    if (!action || !onAction || !lock.tryLock()) return;
    setPending(true);
    setError(null);
    try {
      await onAction();
      setFinished(true);
      setBarKey((k) => k + 1);
    } catch (e) {
      setError(popupError(e, { notDone }));
    } finally {
      lock.unlock();
      setPending(false);
    }
  }

  const showAction = !!action && !finished;
  const actLabel = pending
    ? (action?.busyLabel ?? 'Working…')
    : error
      ? (action?.retryLabel ?? 'Try again')
      : (action?.label ?? '');
  const lifetime = toastLifetime(!!action);

  return (
    <div
      data-kb-lift=""
      role={error ? 'alert' : 'status'}
      aria-live={error ? undefined : 'polite'}
      className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-[90] flex min-h-14 w-[calc(100%-2rem)] max-w-[440px] -translate-x-1/2 items-center gap-3 overflow-hidden rounded-[18px] bg-[#34302a] pl-4 pr-1.5 text-[15px] font-medium text-[#fdf8f1] shadow-[0_12px_28px_-10px_rgba(30,24,14,.45)] onit-toast-in xl:bottom-[110px]"
    >
      <span
        aria-hidden
        className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: error ? '#c8412e' : '#d4af37' }}
      >
        <Icon name={error ? error.icon : finished ? 'check' : icon} size={17} className="text-[#1e1a15]" />
      </span>
      <span className="flex-1 py-3 leading-[1.35]">{error ? error.body : finished ? (doneText ?? text) : text}</span>

      {showAction && (
        <button
          type="button"
          onClick={() => void act()}
          disabled={pending}
          aria-busy={pending || undefined}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] px-3 font-display text-[14px] font-bold text-[#e6c65c] transition active:bg-[#4a453c] disabled:text-[#b9b0a0]"
        >
          {pending && <Spinner size={14} />}
          {actLabel}
        </button>
      )}

      {showAction && !pending && !error && (
        <span
          key={barKey}
          aria-hidden
          className="pop-toast-bar absolute bottom-0 left-0 h-[3px] w-full bg-[#e6c65c]"
          style={{ animationDuration: `${lifetime}ms` }}
        />
      )}
    </div>
  );
}
