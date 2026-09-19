'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';

const AUTO_DISMISS_MS = 6000;

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss?: () => void;
}

export default function UndoToast({ message, onUndo, onDismiss }: UndoToastProps) {
  // Keep the latest onDismiss without resetting the timer when the parent
  // re-renders with a new callback identity.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Auto-dismiss after 6s — the undo affordance shouldn't linger indefinitely.
  useEffect(() => {
    const t = setTimeout(() => dismissRef.current?.(), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, []);

  // Dismiss on route change: navigating away abandons the undo chance.
  const pathname = usePathname();
  const initialPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== initialPath.current) dismissRef.current?.();
  }, [pathname]);

  return (
    <div className="fixed bottom-20 left-1/2 z-[90] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between rounded-card bg-inverse-surface px-4 py-3 text-inverse-on-surface shadow-card-raised transition-all">
      <span className="truncate text-body-md font-medium text-inverse-on-surface">{message}</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-primary-container px-4 text-xs font-bold uppercase text-on-background transition active:scale-95"
        >
          <Icon name="undo" size={16} />
          Undo
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="grid h-11 w-11 place-items-center rounded-full text-inverse-on-surface/60 transition active:scale-90"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
