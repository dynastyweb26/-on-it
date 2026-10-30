'use client';
// Hosts the bank-tracking fixture state for the whole shell: the review queue,
// the bank connection, and the Pro-vs-free tier fixture. Everything the bank
// screens read comes from here, so the Settings row, the subpage, the edge on
// Books and the review sheet can never disagree. Nothing here talks to the
// network or the database.
//
// The review sheet opens three ways: the app-open popup (any tab, new items, or
// leftovers once a day — CHANGES.md · item 10), the `onit:bank-review-open`
// event the pinned row dispatches, and the Settings/Books entry points.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type Dispatch, type SetStateAction,
} from 'react';
import { usePathname } from 'next/navigation';
import ReviewStack from './ReviewStack';
import {
  bankReducer, pendingCount, reviewQueue, seedReviewState, todayIso, unaccountedCount,
  type BankAction, type BankReviewState,
} from '@/lib/bank-tracking';
import { exactTabIndex } from '@/lib/tabs';
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

/** The day the popup last opened, so leftovers wait a day. */
const OPENED_KEY = 'onit_bank_review_opened';
/** Item ids already seen or dismissed: anything outside this set is new. */
const SEEN_KEY = 'onit_bank_review_seen';

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
  const stateRef = useRef(state);
  stateRef.current = state;

  // Preview fixtures: ?bankTier=free and ?bankState=reconnect|syncing|linked.
  // Read once, on the client, only where the flag is on.
  useEffect(() => {
    if (!enabled) return;
    setTier(bankTierFromSearch(window.location.search));
    setBank(initialConnectionFromSearch(window.location.search));
  }, [enabled]);

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
    // Remember what was waiting when the owner walked away: those items are no
    // longer "new", so only arrivals can raise the popup again.
    try {
      const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
      for (const item of reviewQueue(stateRef.current)) seen.add(item.id);
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
      localStorage.setItem(OPENED_KEY, todayIso());
    } catch { /* private mode: nothing to remember */ }
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

  // ── Auto popup (CHANGES.md · item 10) ──
  // Any tab root, Chat included, opens the stack when To review holds items that
  // are new since the last dismissal; leftover older items may open it once a
  // day. It waits while a recording, a text entry or an open sheet/menu owns the
  // screen, and a deep link or a builder route is not a tab root, so it opens
  // once the owner is back on a tab. Free tier and flag-off never see it.
  const autoSettled = useRef(false);
  useEffect(() => {
    if (!enabled || tier !== 'pro' || pending === 0 || autoSettled.current) return;
    const attempt = () => {
      if (autoSettled.current || dismissed.current) return;
      if (exactTabIndex(pathname) < 0) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"]')) return;
      if (document.body.dataset.onitRecording === '1') return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable)) return;

      autoSettled.current = true;
      const today = todayIso();
      let seen: string[] = [];
      let lastDay = '';
      try {
        seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
        lastDay = localStorage.getItem(OPENED_KEY) ?? '';
      } catch { /* private mode: treat everything as new */ }
      const fresh = reviewQueue(stateRef.current).some((item) => !seen.includes(item.id));
      if (!fresh && lastDay === today) return;
      openStack();
    };
    attempt();
    const timer = setInterval(attempt, 1200);
    return () => clearInterval(timer);
  }, [enabled, tier, pending, pathname, openStack]);

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
