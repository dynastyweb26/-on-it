'use client';
// Hosts the bank-tracking fixture state for the whole shell, so the review
// sheet, the nav dot (a later step) and the Books/Expenses screens all read the
// same copy. One provider, one reducer: nothing here talks to the network.
//
// The sheet opens two ways: the app-open popup (once a day, on Books, only when
// there is something new — SPEC.txt's trigger) and the `onit:bank-review-open`
// event the pinned row will dispatch.
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type Dispatch } from 'react';
import { usePathname } from 'next/navigation';
import ReviewStack from './ReviewStack';
import {
  bankReducer, hiddenCount, pendingCount, seedReviewState, todayIso, unaccountedCount,
  type BankAction, type BankReviewState,
} from '@/lib/bank-tracking';

type BankTrackingApi = {
  enabled: boolean;
  state: BankReviewState;
  dispatch: Dispatch<BankAction>;
  openStack: () => void;
  pending: number;
  hidden: number;
  unaccounted: number;
};

const BankContext = createContext<BankTrackingApi | null>(null);

/** Null when the flag is off (or outside the shell), so screens can stay inert. */
export function useBankTracking(): BankTrackingApi | null {
  return useContext(BankContext);
}

const OPENED_KEY = 'onit_bank_review_opened';

export default function BankTrackingProvider({ enabled = false, children }: {
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(bankReducer, undefined, () => seedReviewState());
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const pending = pendingCount(state);
  const hidden = hiddenCount(state);
  const unaccounted = unaccountedCount(state);
  const autoOpened = useRef(false);

  // Once a day, on Books, and only when something is waiting.
  useEffect(() => {
    if (!enabled || autoOpened.current || pending === 0) return;
    if (pathname !== '/dashboard') return;
    autoOpened.current = true;
    const today = todayIso();
    try {
      if (localStorage.getItem(OPENED_KEY) === today) return;
      localStorage.setItem(OPENED_KEY, today);
    } catch { /* private mode: open for this session anyway */ }
    setOpen(true);
  }, [enabled, pathname, pending]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('onit:bank-review-open', onOpen);
    return () => window.removeEventListener('onit:bank-review-open', onOpen);
  }, []);

  const openStack = useMemo(() => () => setOpen(true), []);
  const value = useMemo<BankTrackingApi>(
    () => ({ enabled, state, dispatch, openStack, pending, hidden, unaccounted }),
    [enabled, state, openStack, pending, hidden, unaccounted],
  );

  return (
    <BankContext.Provider value={value}>
      {children}
      {enabled && open && (
        <ReviewStack state={state} dispatch={dispatch} onClose={() => setOpen(false)} />
      )}
    </BankContext.Provider>
  );
}
