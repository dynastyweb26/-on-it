'use client';
// The caller-side half of the busy rule: one promise, one synchronous lock.
// `start` refuses a second call made in the same frame as the first (state has
// not re-rendered yet), and `guard` lets a primitive block dismissal at the
// moment of the tap. A failure becomes a PopupError with a cause and what did
// not happen; the next `start` is the retry.
import { useCallback, useRef, useState } from 'react';
import { TapLock } from './action-guard';
import { popupError, type PopupError } from './error-frame';

export function usePopAction<Args extends unknown[]>(
  run: (...args: Args) => Promise<void>,
  opts: { notDone?: string } = {},
) {
  const lock = useRef(new TapLock()).current;
  // Latest props without re-creating `start` (a caller may retry with new copy).
  const latest = useRef({ run, notDone: opts.notDone });
  latest.current = { run, notDone: opts.notDone };

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PopupError | null>(null);

  const start = useCallback(async (...args: Args): Promise<boolean> => {
    if (!lock.tryLock()) return false;
    setPending(true);
    setError(null);
    try {
      await latest.current.run(...args);
      return true;
    } catch (e) {
      setError(popupError(e, { notDone: latest.current.notDone }));
      return false;
    } finally {
      lock.unlock();
      setPending(false);
    }
  }, [lock]);

  const clearError = useCallback(() => setError(null), []);

  return { start, pending, error, clearError, guard: lock };
}
