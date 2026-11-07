'use client';
// The one submit path for all three popup shapes.
//
// `pendingRef` flips synchronously, before the request starts: two taps in the
// same frame both read the pre-render closure, so state alone would let both
// submit (CLAUDE.md 2, board C1/C2). Pending clears in `finally`, so an exit —
// success, failure or cancel — never leaves the control stuck.
import { useCallback, useRef, useState } from 'react';
import { popupFailure, type PopupFailure } from './failure';

export function usePopupPending() {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<PopupFailure | null>(null);
  const pendingRef = useRef(false);

  const run = useCallback(
    async (task: () => Promise<void> | void, consequence?: string): Promise<boolean> => {
      if (pendingRef.current) return false;
      pendingRef.current = true;
      setPending(true);
      setFailure(null);
      try {
        await task();
        return true;
      } catch (error) {
        setFailure(popupFailure(error, consequence));
        return false;
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [],
  );

  /** Drop a stale failure (the user changed what they were about to submit). */
  const clearFailure = useCallback(() => {
    if (!pendingRef.current) setFailure(null);
  }, []);

  return { pending, pendingRef, failure, run, clearFailure };
}
