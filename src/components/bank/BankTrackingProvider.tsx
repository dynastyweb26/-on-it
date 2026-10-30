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
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type Dispatch, type SetStateAction,
} from 'react';
import { usePathname } from 'next/navigation';
import ReviewStack from './ReviewStack';
import {
  bankReducer, pendingCount, seedReviewState, todayIso, unaccountedCount,
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

  // Every close is a dismissal: it forbids the auto popup until a new app open
  // or new items, and it finalizes ignored cards once To review is empty.
  const dismissed = useRef(false);
  const pushed = useRef(false);
  const fromPop = useRef(false);
  const openRef = useRef(false);
  openRef.current = open;

  // One history entry per opening, so the phone back gesture (and browser back)
  // closes the sheet like a tab press (CHANGES.md · item 7).
  const openStack = useCallback(() => {
    setOpen(true);
    openRef.current = true;
    if (pushed.current) return;
    try {
      window.history.pushState({ onitBankStack: true }, '');
      pushed.current = true;
    } catch { /* no history API: the X still closes it */ }
  }, []);

  const closeStack = useCallback(() => {
    const viaBack = fromPop.current;
    fromPop.current = false;
    openRef.current = false;
    setOpen(false);
    dismissed.current = true;
    dispatch({ type: 'finalizeIgnored' });
    if (!viaBack && pushed.current) {
      pushed.current = false;
      try { window.history.back(); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    const onOpen = () => openStack();
    window.addEventListener('onit:bank-review-open', onOpen);
    return () => window.removeEventListener('onit:bank-review-open', onOpen);
  }, [openStack]);

  useEffect(() => {
    const onPop = () => {
      if (!openRef.current) return;
      pushed.current = false; // the browser already removed our entry
      fromPop.current = true;
      window.dispatchEvent(new Event('onit:bank-stack-close'));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Tapping any nav tab, rail or sidebar item while the stack is open closes it
  // with the slide-down (the stack plays it) and then navigates: the listener
  // is capture-phase and never prevents the link's own navigation. Unresolved
  // items stay in To review and the dots stay (CHANGES.md · item 6).
  useEffect(() => {
    if (!open) return;
    const onNavPress = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest?.('[data-bank-nav], [data-tab-target]')) return;
      window.dispatchEvent(new Event('onit:bank-stack-close'));
    };
    document.addEventListener('click', onNavPress, true);
    return () => document.removeEventListener('click', onNavPress, true);
  }, [open]);

  const value = useMemo<BankTrackingApi>(
    () => ({ enabled, state, dispatch, openStack, pending, unaccounted, bank, setBank, tier }),
    [enabled, state, openStack, pending, unaccounted, bank, setBank, tier],
  );

  return (
    <BankContext.Provider value={value}>
      {children}
      {enabled && open && (
        <ReviewStack state={state} dispatch={dispatch} onClose={closeStack} />
      )}
    </BankContext.Provider>
  );
}
