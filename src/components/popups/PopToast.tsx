'use client';
// PopToast — success and undo toasts (design/popups/boards/PopToast.dc.html).
// One at a time, 12px above the composer: info 2.4 s, undo 6 s with a gold time
// bar for the time left. Undo has states too: while it restores the action
// locks; if it fails the toast says why, offers Retry, and stops expiring.
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { usePopupPending } from '@/lib/popups/use-popup-pending';
import { toastAutoDismiss, toastDuration } from '@/lib/popups/toast';

export interface PopToastProps {
  icon?: IconName;
  text: string;
  /** The undo affordance. Its presence makes this the 6 s window. */
  action?: { label: string; busyLabel?: string; onSelect: () => Promise<void> | void };
  onDismiss: () => void;
  /** What did NOT happen, prepended to a failure sentence. */
  consequence?: string;
}

export default function PopToast({ icon = 'check', text, action, onDismiss, consequence }: PopToastProps) {
  const { pending, pendingRef, failure, run } = usePopupPending();
  const state = pending ? 'pending' : failure ? 'error' : 'idle';
  const duration = toastDuration(Boolean(action));

  // One guarded exit: the timer, and a route change, both go through the ref.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!toastAutoDismiss(state)) return;
    const timer = setTimeout(() => dismissRef.current(), duration);
    return () => clearTimeout(timer);
  }, [state, duration]);

  // Navigating away abandons the undo chance, so the toast goes with the screen.
  const pathname = usePathname();
  const initialPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== initialPath.current) dismissRef.current();
  }, [pathname]);

  // The bar drains with a transition rather than a keyframe: start full, then
  // hand it the real duration on the next frame so it animates once.
  const [draining, setDraining] = useState(false);
  const showBar = Boolean(action) && state === 'idle';
  useEffect(() => {
    if (!showBar) { setDraining(false); return; }
    const frame = requestAnimationFrame(() => setDraining(true));
    return () => cancelAnimationFrame(frame);
  }, [showBar]);

  function restore() {
    if (!action || pendingRef.current) return;
    void run(async () => {
      await action.onSelect();
      dismissRef.current();
    }, consequence);
  }

  return (
    <div
      data-kb-lift=""
      className="onit-toast-in fixed bottom-20 left-1/2 z-[90] w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
    >
      <div
        role="status"
        aria-live="polite"
        className="relative flex min-h-[56px] items-center gap-3 overflow-hidden rounded-[18px] bg-inverse-surface pl-4 pr-1.5 shadow-card-raised"
      >
        <span
          className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full ${
            state === 'error' ? 'bg-primary-fixed-dim' : 'bg-primary-container'
          }`}
        >
          <Icon name={state === 'error' ? 'warning' : icon} size={17} className="text-on-background" />
        </span>

        <span className="min-w-0 flex-1 py-3 text-[15px] font-medium leading-[1.35] text-inverse-on-surface">
          {failure ? failure.body : text}
        </span>

        {action && (
          <button
            type="button"
            onClick={restore}
            disabled={pending}
            aria-busy={pending || undefined}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] px-3 font-display text-[14px] font-bold text-inverse-primary transition active:bg-inverse-surface/70 disabled:text-inverse-on-surface/40"
          >
            {pending && (
              <span className="h-3.5 w-3.5 rounded-full border-2 border-inverse-on-surface/40 border-t-transparent motion-safe:animate-spin" />
            )}
            {pending ? (action.busyLabel ?? 'Working…') : failure ? 'Retry' : action.label}
          </button>
        )}

        {showBar && (
          <span
            aria-hidden
            className="absolute bottom-0 left-0 h-[3px] bg-primary-fixed-dim"
            style={{
              width: draining ? '0%' : '100%',
              transition: draining ? `width ${duration}ms linear` : 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}
