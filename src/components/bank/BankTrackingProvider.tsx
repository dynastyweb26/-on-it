'use client';
// Hosts the bank-tracking fixture state for the whole shell: the review queue,
// the bank connection, and the Pro-vs-free tier fixture. Everything the bank
// screens read comes from here, so the Settings row, the subpage, the edge on
// Books and the review sheet can never disagree. Nothing here talks to the
// network or the database.
//
// The review sheet opens two ways: the app-open popup (once a day, on Books,
// only when something is waiting — SPEC.txt's trigger) and the
// `onit:bank-review-open` event the pinned row dispatches.
import {
  createContext, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type Dispatch, type SetStateAction,
} from 'react';
import { usePathname } from 'next/navigation';
import ReviewStack from './ReviewStack';
import {
  bankReducer, hiddenCount, pendingCount, seedReviewState, todayIso, unaccountedCount,
  type BankAction, type BankReviewState,
} from '@/lib/bank-tracking';
import {
  bankTierFromSearch, emptyConnection, initialConnectionFromSearch,
  type BankConnection, type BankTier,
} from '@/lib/bank-accounts';

type BankTrackingApi = {
  enabled: boolean;
  state: BankReviewState;
  dispatch: Dispatch<BankAction>;
  openStack: () => void;
  pending: number;
  hidden: number;
  unaccounted: number;
  /** The mock bank connection (pitch, choose accounts, linked, reconnect). */
  bank: BankConnection;
  setBank: Dispatch<SetStateAction<BankConnection>>;
  /** Pro or free. ?bankTier=free flips it on a preview build only. */
  tier: BankTier;
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
  const [bank, setBank] = useState<BankConnection>(() => emptyConnection());
  const [tier, setTier] = useState<BankTier>('pro');
  const pathname = usePathname();
  const pending = pendingCount(state);
  const hidden = hiddenCount(state);
  const unaccounted = unaccountedCount(state);
  const autoOpened = useRef(false);

  // Preview fixtures: ?bankTier=free and ?bankState=reconnect|syncing|linked.
  // Read once, on the client, only where the flag is on.
  useEffect(() => {
    if (!enabled) return;
    setTier(bankTierFromSearch(window.location.search));
    setBank(initialConnectionFromSearch(window.location.search));
  }, [enabled]);

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
    () => ({ enabled, state, dispatch, openStack, pending, hidden, unaccounted, bank, setBank, tier }),
    [enabled, state, openStack, pending, hidden, unaccounted, bank, tier],
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
