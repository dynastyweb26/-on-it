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
  BANK_ITEMS, REVIEW_FAILED_TOAST, addedToast, advancesOptimistically, bankActive, bankReducer,
  pendingCount, receiptRefusalMessage, receiptRefusedAction, reviewQueue, seedReviewState, statusOf,
  todayIso, unaccountedCount,
  type BankAction, type BankReceipt, type BankReviewState,
} from '@/lib/bank-tracking';
import { removeBankReceipt, uploadBankReceipt } from '@/lib/bank-receipt';
import {
  rollbackAction, reviewBody, rowToItem, transactionsPlan,
  type ApiReviewRow,
} from '@/lib/bank-review';
import { exactTabIndex } from '@/lib/tabs';
import { useSignedIn } from '@/lib/use-auth-session';
import {
  bankPreviewState, bankTierFromSearch, emptyConnection, initialConnectionFromSearch,
  type BankConnection, type BankTier,
} from '@/lib/bank-accounts';

// The two real routes this provider reads and writes. The literals live here on
// purpose: bank-tracking.test.ts counts every /api/ string in the bank files.
const TRANSACTIONS_URL = '/api/plaid/transactions';
const REVIEW_URL = '/api/plaid/review';

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
  /** Decided counts from the last real read: added / already / ignored. */
  counts: { added: number; already: number; ignored: number };
  /** A refused write, shown by the review sheet as a toast. */
  notice: { message: string; id: number } | null;
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
  // Empty by default: a fresh account has no bank items, so no popup, no
  // Unaccounted row and no Books dot until a real sync writes something.
  const [state, dispatch] = useReducer(bankReducer, undefined, () => seedReviewState([]));
  const [open, setOpen] = useState(false);
  const [bank, setBank] = useState<BankConnection>(() => emptyConnection());
  const [tier, setTier] = useState<BankTier>('pro');
  const pathname = usePathname();
  // Signed out, the whole feature is inert (docs/design/CHANGES.md): `active` is
  // the effective flag every consumer is handed, so the popup, the dots, the
  // Settings badge and the Books footnote all go quiet behind the sign-in sheet.
  const signedIn = useSignedIn();
  const active = bankActive(enabled, signedIn);
  const activeRef = useRef(active);
  activeRef.current = active;
  const pending = pendingCount(state);
  const unaccounted = unaccountedCount(state);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [counts, setCounts] = useState<{ added: number; already: number; ignored: number }>(
    () => ({ added: 0, already: 0, ignored: 0 }),
  );
  const [notice, setNotice] = useState<{ message: string; id: number } | null>(null);
  /** Ids whose receipt add is uploading/posting: their card locks its buttons. */
  const [inFlight, setInFlight] = useState<string[]>([]);
  /** The last refused receipt add, reported inline on that card as well. */
  const [refused, setRefused] = useState<{ id: string; message: string } | null>(null);
  // The rows behind the stack, keyed by bank_transactions id. A fixture item is
  // absent here, which is exactly what keeps its actions local.
  const rowsRef = useRef<Map<string, ApiReviewRow>>(new Map());
  const real = useRef(false);

  // Preview fixtures: ?bankTier=free and ?bankState=reconnect|syncing|linked.
  // Read once, on the client, only where the flag is on. The review batch is
  // fixture data too, so it is seeded ONLY behind ?bankState=; every other
  // preview (and the app itself) starts with an empty state.
  useEffect(() => {
    if (!active) return;
    const search = window.location.search;
    setTier(bankTierFromSearch(search));
    setBank(initialConnectionFromSearch(search));
    if (bankPreviewState(search)) dispatch({ type: 'seed', items: BANK_ITEMS });
  }, [active]);

  // The real queue: one read once the flag is on and someone is signed in, so a
  // reload rebuilds the stack, the dot and Unaccounted from the database. A
  // ?bankState= preview keeps its frozen fixtures and never reads.
  useEffect(() => {
    if (!active) return;
    if (bankPreviewState(window.location.search) !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(TRANSACTIONS_URL, { cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as unknown;
        const plan = transactionsPlan(res.status, body);
        // 404 is the gate, and an error leaves the queue quiet — never "all done".
        if (cancelled || plan.kind !== 'rows') return;
        rowsRef.current = new Map(plan.rows.map((row) => [row.id, row]));
        real.current = true;
        setCounts(plan.counts);
        dispatch({ type: 'seed', items: plan.rows.map(rowToItem) });
      } catch { /* offline: the stack stays empty */ }
    })();
    return () => { cancelled = true; };
  }, [active]);

  // Every close is a dismissal: it forbids the auto popup until a new app open
  // or new items, and it finalizes ignored cards once To review is empty.
  const dismissed = useRef(false);
  const autoSettled = useRef(false);
  const pushed = useRef(false);
  const fromPop = useRef(false);
  const openRef = useRef(false);
  openRef.current = open;

  // One history entry per opening, so the phone back gesture (and browser back)
  // closes the sheet like a tab press (CHANGES.md · item 7).
  const openStack = useCallback(() => {
    if (!activeRef.current) return; // signed out: nothing may open
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

  // Signing out takes the feature down: an open stack closes, and the popup
  // cannot come back while there is no session. Signing in again may raise it,
  // exactly like a fresh app open.
  useEffect(() => {
    if (active || !openRef.current) return;
    closeStack();
  }, [active, closeStack]);

  useEffect(() => {
    if (!active) return;
    dismissed.current = false;
    autoSettled.current = false;
  }, [active]);

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
  useEffect(() => {
    if (!active || tier !== 'pro' || pending === 0 || autoSettled.current) return;
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
  }, [active, tier, pending, pathname, openStack]);

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

  // Fixture actions move local state only. A real row also posts its decision:
  // the move paints first, and a refusal rolls it back with one toast.
  //
  // A picked receipt is uploaded HERE — at "Add to record", not at tap — so a
  // card the owner passes on or closes stores nothing. Only the hash travels to
  // the route; it rebuilds the object key from the session.
  // A refused receipt add: the card never moved, so there is nothing to roll
  // back — only the photo goes, so a retry starts from the picker instead of
  // re-posting a duplicate. The reason shows in the toast AND under the receipt
  // row, and the file this attempt uploaded is gone before we get here.
  const refuseReceiptAdd = useCallback((id: string, receipt: BankReceipt, message: string) => {
    URL.revokeObjectURL(receipt.previewUrl);
    dispatch(receiptRefusedAction(id));
    setInFlight((ids) => ids.filter((busyId) => busyId !== id));
    setRefused({ id, message });
    setNotice({ message, id: Date.now() });
  }, []);

  const dispatchAction = useCallback((action: BankAction) => {
    if (action.type !== 'add' && action.type !== 'already'
      && action.type !== 'ignore' && action.type !== 'restore') {
      dispatch(action);
      if (action.type === 'edit') setRefused((current) => (current?.id === action.id ? null : current));
      return;
    }
    const previous = statusOf(stateRef.current, action.id);
    const item = stateRef.current.items.find((it) => it.id === action.id);
    const receipt = action.type === 'add' ? item?.receipt ?? null : null;
    setRefused((current) => (current?.id === action.id ? null : current));
    // A receipt add waits for the write (advancesOptimistically) — the photo is
    // uploaded here, at "Add to record" — so a refusal leaves the card exactly
    // where it is. A fixture item has no write to wait for, so it still moves.
    const optimistic = !real.current || advancesOptimistically(action, item);
    if (optimistic) dispatch(action);
    if (!real.current) return;
    const row = rowsRef.current.get(action.id);
    if (!row || !item) return;
    if (!optimistic) setInFlight((ids) => (ids.includes(action.id) ? ids : [...ids, action.id]));
    void (async () => {
      const settle = () => setInFlight((ids) => ids.filter((busyId) => busyId !== action.id));
      const upload = receipt ? await uploadBankReceipt(receipt) : 'none';
      if (upload === 'failed' || upload === 'unsigned') {
        if (receipt && !optimistic) {
          refuseReceiptAdd(action.id, receipt, REVIEW_FAILED_TOAST);
          return;
        }
        settle();
        dispatch(rollbackAction(previous, action.id));
        setNotice({ message: REVIEW_FAILED_TOAST, id: Date.now() });
        return;
      }
      let code: string | null = null;
      try {
        const res = await fetch(REVIEW_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(reviewBody(row, item, action.type)),
        });
        if (res.ok) {
          settle();
          // The write landed: now the card leaves, with one confirmation.
          if (!optimistic) {
            dispatch({ type: 'add', id: action.id });
            setNotice({
              message: item.review ? item.review.toast : addedToast(item.date),
              id: Date.now(),
            });
          }
          return;
        }
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        code = body?.error ?? null;
      } catch { /* the refusal below is the answer */ }
      // Remove only the file THIS attempt stored, so an "exists" object (it may
      // already back another expense) is never deleted, and a duplicate leaves
      // the receipt where the server says it belongs.
      if (upload === 'uploaded' && code !== 'receipt_duplicate' && receipt) {
        void removeBankReceipt(receipt);
      }
      if (receipt && !optimistic) {
        refuseReceiptAdd(action.id, receipt, receiptRefusalMessage(code));
        return;
      }
      settle();
      dispatch(rollbackAction(previous, action.id));
      setNotice({
        message: receipt ? receiptRefusalMessage(code) : REVIEW_FAILED_TOAST,
        id: Date.now(),
      });
    })();
  }, [refuseReceiptAdd]);

  const value = useMemo<BankTrackingApi>(
    () => ({
      enabled: active, state, dispatch: dispatchAction, openStack, pending, unaccounted, bank, setBank,
      tier, counts, notice,
    }),
    [active, state, dispatchAction, openStack, pending, unaccounted, bank, setBank, tier, counts, notice],
  );

  return (
    <BankContext.Provider value={value}>
      {children}
      {active && open && (
        <ReviewStack
          state={state}
          dispatch={dispatchAction}
          onClose={closeStack}
          notice={notice}
          busyIds={inFlight}
          refused={refused}
        />
      )}
    </BankContext.Provider>
  );
}
