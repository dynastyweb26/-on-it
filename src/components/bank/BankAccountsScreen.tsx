'use client';
// ═══ Settings › Money › Bank accounts (SPEC.txt · section 2) ═══
// One screen, one flow, all fixture state:
//   free-locked → pitch + consent → handoff → placeholder provider sheet →
//   connect success → choose accounts (toggles off by default) → linked
//   (syncing → up to date, or needs reconnect in gold) → digest time sheet →
//   disconnect confirm → disconnected, back to the pitch.
//
// No Plaid: the provider sheet is a placeholder that only advances the
// sequence. Nothing here reads a bank, writes a row or calls an API — the mock
// connection lives in the shell provider, and bank-tracking.test.ts enforces
// that these files cannot reach a write.
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import type { PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import PlaidConnect from './PlaidConnect';
import BankSheet from './BankSheet';
import BankToast from './BankToast';
import { useBankTracking } from './BankTrackingProvider';
import {
  ACCOUNT_STATUS_COPY, DIGEST_OPTIONS, DISCONNECTED_TOAST, STARTER_ACCOUNTS,
  digestLabel, isLinked, trackedCount, type BankAccountOption, type BankConnection,
} from '@/lib/bank-accounts';
import {
  CONNECT_FAILED_TOAST, OPEN_BANK_FAILED_TOAST, exchangePlan, linkTokenPlan,
} from '@/lib/bank-connect';
import { requestDisconnect } from '@/lib/bank-disconnect';

type Flow = 'idle' | 'handoff' | 'success' | 'choose';

export default function BankAccountsScreen() {
  const ctx = useBankTracking();
  const [flow, setFlow] = useState<Flow>('idle');
  const [plaidOpen, setPlaidOpen] = useState(false);
  // A real Plaid link token, when the preview route answered. Null keeps the
  // placeholder sheet (and every other mock step) exactly as it was.
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [digestOpen, setDigestOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const firstToggleRef = useRef<HTMLButtonElement>(null);

  const connection = ctx?.bank;
  const tier = ctx?.tier ?? 'pro';
  const setBank = ctx?.setBank;

  // Handoff: the veil holds for 700ms, then the provider sheet rises.
  useEffect(() => {
    // With a real link token Plaid's sheet takes over; the placeholder must not
    // rise on top of it.
    if (flow !== 'handoff' || linkToken) return;
    const t = setTimeout(() => setPlaidOpen(true), 700);
    return () => clearTimeout(t);
  }, [flow, linkToken]);

  // Connect success: 1.2s, then the account rows take over.
  useEffect(() => {
    if (flow !== 'success') return;
    const t = setTimeout(() => setFlow('choose'), 1200);
    return () => clearTimeout(t);
  }, [flow]);

  // Focus lands on the first Track toggle once the rows are there.
  useEffect(() => {
    if (flow !== 'choose') return;
    const t = setTimeout(() => firstToggleRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [flow]);

  // A mock sync finishes by itself (the shimmer and the dot stop with it).
  const status = connection?.status;
  useEffect(() => {
    if (status !== 'syncing' || !setBank) return;
    const t = setTimeout(() => setBank((cur) => ({ ...cur, status: 'upToDate' })), 1600);
    return () => clearTimeout(t);
  }, [status, setBank]);

  if (!ctx || !connection) return null;

  function startTracking() {
    if (!draft.length) return;
    setBank?.((cur) => ({
      ...cur,
      status: 'syncing',
      institution: 'Chase',
      accounts: STARTER_ACCOUNTS,
      tracked: draft,
    }));
    setFlow('idle');
  }

  // Connect → a real link token when this is a preview build. The mock handoff
  // runs for exactly one response: the route's 404, which is plaidRouteEnabled
  // saying no. Every other failure is a toast, never the placeholder sheet.
  async function beginLink() {
    try {
      const res = await fetch('/api/plaid/link-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const body = (await res.json().catch(() => null)) as unknown;
      const plan = linkTokenPlan(res.status, body);
      if (plan.kind === 'mock') {
        setFlow('handoff');
        return;
      }
      if (plan.kind === 'error') {
        setFlow('idle');
        setToast(plan.message);
        return;
      }
      setFlow('handoff');
      setLinkToken(plan.token);
    } catch {
      setFlow('idle');
      setToast(OPEN_BANK_FAILED_TOAST);
    }
  }

  async function exchangePublicToken(publicToken: string, metadata: PlaidLinkOnSuccessMetadata) {
    setLinkToken(null);
    try {
      const res = await fetch('/api/plaid/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          public_token: publicToken,
          institution_name: metadata.institution?.name,
        }),
      });
      const body = (await res.json().catch(() => null)) as unknown;
      const plan = exchangePlan(res.status, body);
      if (plan.kind === 'error') {
        // A failed exchange never advances to the mock "choose accounts" step.
        setFlow('idle');
        setToast(plan.message);
        return;
      }
      // Remember the real item (for disconnect); the rest of the screen stays
      // mock: success → choose accounts.
      setBank?.((cur) => ({
        ...cur,
        itemId: plan.itemId,
        institution: plan.institution ?? cur.institution,
      }));
      setFlow('success');
    } catch {
      setFlow('idle');
      setToast(CONNECT_FAILED_TOAST);
    }
  }

  function cancelLink() {
    setLinkToken(null);
    setFlow('idle');
  }

  function toggleDraft(id: string) {
    setDraft((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function pickDigest(value: string) {
    setBank?.((cur) => ({ ...cur, digestTime: value }));
    setDigestOpen(false);
    setToast(`Digest time set to ${digestLabel(value)}.`);
  }

  // A real item is removed at Plaid first; a refusal keeps the connection and
  // says so. The mock/fixture path has no item id, so it only moves local state.
  async function disconnect() {
    const itemId = ctx?.bank?.itemId ?? null;
    if (itemId) {
      setDisconnectBusy(true);
      const result = await requestDisconnect(itemId);
      setDisconnectBusy(false);
      if (!result.ok) {
        setDisconnectOpen(false);
        setToast(result.message);
        return;
      }
    }
    setBank?.((cur) => ({
      ...cur, itemId: null, status: 'none', institution: null, accounts: [], tracked: [],
    }));
    setDisconnectOpen(false);
    setFlow('idle');
    setToast(DISCONNECTED_TOAST);
  }

  const body = (() => {
    if (tier === 'free') return <LockedCard />;
    if (flow === 'handoff' || flow === 'success') return <Handoff success={flow === 'success'} />;
    if (flow === 'choose') {
      return (
        <ChooseAccounts
          accounts={STARTER_ACCOUNTS}
          draft={draft}
          firstToggleRef={firstToggleRef}
          onToggle={toggleDraft}
          onCancel={() => setFlow('idle')}
          onStart={startTracking}
        />
      );
    }
    if (!isLinked(connection)) return <Pitch onConnect={beginLink} />;
    return (
      <LinkedCard
        connection={connection}
        onReconnect={() => setBank?.((cur) => ({ ...cur, status: 'syncing' }))}
        onDigest={() => setDigestOpen(true)}
        onDisconnect={() => setDisconnectOpen(true)}
      />
    );
  })();

  return (
    <div data-bank-motion className="space-y-4">
      {body}

      {linkToken && (
        <PlaidConnect
          token={linkToken}
          onPublicToken={exchangePublicToken}
          onExit={cancelLink}
          onError={(message) => {
            setLinkToken(null);
            setFlow('idle');
            setToast(message);
          }}
        />
      )}

      {plaidOpen && !linkToken && (
        <BankSheet label="Bank connection" onClose={() => { setPlaidOpen(false); setFlow('idle'); }}>
          <div className="flex items-center justify-between pb-1">
            <h2 className="font-display text-xl font-extrabold">Connect Chase</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={() => { setPlaidOpen(false); setFlow('idle'); }}
              className="grid h-11 w-11 place-items-center rounded-full bg-surface-container-high"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
          <p className="pb-1 text-sm text-on-surface-variant">You would sign in to your bank here.</p>
          {/* Placeholder for the provider's own UI: this sheet only advances
              the sequence. No bank is contacted and no credentials are asked
              for anywhere in this build. */}
          <div className="my-3 rounded-[18px] border border-dashed border-outline-variant bg-surface-container-low p-6 text-center">
            <span aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] bg-primary-soft">
              <Icon name="account_balance" size={28} />
            </span>
            <p className="mt-3 text-sm font-semibold text-on-surface-variant">Secure connection</p>
            <p className="mt-1 text-[13px] text-on-surface-variant">This preview does not contact a real bank.</p>
          </div>
          <button
            type="button"
            onClick={() => { setPlaidOpen(false); setFlow('success'); }}
            className="min-h-[54px] w-full rounded-full bg-primary-container font-display text-base font-bold text-on-background active:scale-[0.97]"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={() => { setPlaidOpen(false); setFlow('idle'); }}
            className="mt-1 min-h-touch w-full text-center text-sm font-semibold text-on-surface-variant underline"
          >
            Cancel
          </button>
        </BankSheet>
      )}

      {digestOpen && (
        <BankSheet label="Daily digest time" onClose={() => setDigestOpen(false)}>
          <div className="flex items-center justify-between pb-1">
            <h2 className="font-display text-xl font-extrabold">Daily digest</h2>
            <button type="button" aria-label="Close" onClick={() => setDigestOpen(false)}
              className="grid h-11 w-11 place-items-center rounded-full bg-surface-container-high">
              <Icon name="close" size={20} />
            </button>
          </div>
          <p className="pb-3 text-sm text-on-surface-variant">{digestLabel(connection.digestTime)} · one summary a day.</p>
          <div role="radiogroup" aria-label="Daily digest time" className="overflow-hidden rounded-[18px] border border-outline-variant/70">
            {DIGEST_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={connection.digestTime === value}
                onClick={() => pickDigest(value)}
                className="flex h-14 w-full items-center gap-3 border-b border-outline-variant/40 px-3.5 text-left last:border-b-0"
              >
                <span className="flex-1 text-[15px] font-semibold">{digestLabel(value)}</span>
                {connection.digestTime === value && <Icon name="check" size={20} className="bank-check-pop text-primary" />}
              </button>
            ))}
          </div>
        </BankSheet>
      )}

      {disconnectOpen && (
        <BankSheet label="Disconnect bank" onClose={() => setDisconnectOpen(false)}>
          <h2 className="pt-1 font-display text-xl font-extrabold">Disconnect {connection.institution}?</h2>
          <p className="py-2 text-sm leading-[1.45] text-on-surface-variant">
            On It stops importing new bank activity. Everything already in your Books stays exactly as it is.
          </p>
          <button
            type="button"
            onClick={disconnect}
            disabled={disconnectBusy}
            className="mt-2 min-h-[52px] w-full rounded-full border-[1.5px] border-error/40 font-semibold text-error active:scale-[0.97] disabled:opacity-50"
          >
            {disconnectBusy ? 'Disconnecting…' : 'Disconnect'}
          </button>
          <button
            type="button"
            onClick={() => setDisconnectOpen(false)}
            className="mt-1 min-h-touch w-full text-center text-sm font-semibold text-on-surface-variant underline"
          >
            Keep it connected
          </button>
        </BankSheet>
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] z-[90] mx-auto flex max-w-md justify-center">
          <BankToast message={toast} onDone={() => setToast(null)} />
        </div>
      )}
    </div>
  );
}

// ── Free user: the Pro lock ──
function LockedCard() {
  return (
    <section className="card space-y-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid h-11 w-11 place-items-center rounded-[13px] bg-primary-soft">
          <Icon name="lock" size={22} className="text-primary" />
        </span>
        <div>
          <h2 className="font-display text-xl font-extrabold leading-tight">Bank accounts are part of Pro</h2>
          <p className="text-[13px] text-on-surface-variant">Included with your subscription.</p>
        </div>
      </div>
      <ul className="space-y-2 text-[15px] leading-[1.45] text-on-surface-variant">
        <li>Every outgoing charge lands in Books, ready to review.</li>
        <li>Duplicate charges are matched to what you already logged.</li>
        <li>One daily digest, at a time you pick.</li>
      </ul>
      <Link href="/settings/plan" className="btn-primary w-full">
        Upgrade
      </Link>
      <p className="text-center text-[13px] text-on-surface-variant">Bank connections are read-only.</p>
    </section>
  );
}

// ── Not connected: the pitch ──
function Pitch({ onConnect }: { onConnect: () => void }) {
  return (
    <section className="card space-y-4">
      <div className="relative mx-auto h-[104px] w-[104px]">
        <svg viewBox="0 0 104 104" className="absolute inset-0 h-full w-full text-primary-container" aria-hidden>
          <circle cx="52" cy="52" r="46" fill="none" stroke="currentColor" strokeOpacity=".22" strokeWidth="3" />
          <path d="M52 6a46 46 0 0 1 46 46" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M52 98A46 46 0 0 1 6 52" fill="none" stroke="currentColor" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span aria-hidden className="absolute inset-[26px] grid place-items-center rounded-[18px] bg-primary-soft">
          <Icon name="account_balance" size={30} className="text-primary" />
        </span>
      </div>
      <div className="space-y-1.5 text-center">
        <h2 className="font-display text-xl font-extrabold">Connect your bank</h2>
        <p className="text-[15px] leading-[1.45] text-on-surface-variant">
          On It reads the charges that leave your business accounts.
        </p>
        <p className="text-[15px] leading-[1.45] text-on-surface-variant">
          Each one lands in Books as a draft you review.
        </p>
        <p className="text-[15px] leading-[1.45] text-on-surface-variant">
          Nothing else is read, and you can disconnect any time.
        </p>
      </div>
      <button
        type="button"
        aria-label="Connect bank with Plaid"
        onClick={onConnect}
        className="btn-primary w-full"
      >
        <Icon name="account_balance" size={20} />
        Connect bank
      </button>
      <p className="text-center text-[13px] leading-[1.4] text-on-surface-variant">
        By connecting you agree to our{' '}
        <Link href="/privacy" className="font-semibold text-primary underline">Privacy Policy</Link>.
      </p>
    </section>
  );
}

// ── Handoff + connect success ──
function Handoff({ success }: { success: boolean }) {
  return (
    <section aria-busy={!success} aria-live="polite" className="card space-y-5 py-8">
      <div className="relative mx-auto h-[132px] w-[132px]">
        <svg viewBox="0 0 132 132" className="absolute inset-0 h-full w-full text-primary-container" aria-hidden>
          <g className={success ? 'bank-converge' : 'bank-arc-cw'} style={{ transformOrigin: '66px 66px' }}>
            <path d="M66 10a56 56 0 0 1 56 56" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className={success ? 'bank-converge' : 'bank-arc-ccw'} style={{ transformOrigin: '66px 66px', animationDelay: '60ms' }}>
            <path d="M66 122A56 56 0 0 1 10 66" fill="none" stroke="currentColor" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className={success ? 'bank-converge' : 'bank-arc-cw'} style={{ transformOrigin: '66px 66px', animationDelay: '120ms' }}>
            <path d="M112 92a56 56 0 0 1-28 24" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" />
          </g>
        </svg>
        <span
          aria-hidden
          className={`absolute inset-[38px] grid place-items-center rounded-[18px] bg-primary-soft ${success ? 'bank-tile-lock' : ''}`}
        >
          <Icon name="account_balance" size={26} className="text-primary" />
        </span>
        {success && (
          <span aria-hidden className="bank-badge-pop absolute right-[26px] top-[26px] grid h-8 w-8 place-items-center rounded-full bg-primary-container text-on-background">
            <Icon name="check" size={20} />
          </span>
        )}
      </div>
      <div className="space-y-1 text-center">
        <h2 className="font-display text-xl font-extrabold">{success ? 'Chase is connected' : 'Opening your bank'}</h2>
        <p className="text-[15px] text-on-surface-variant">
          {success ? 'Choose accounts to track.' : 'Opening a secure connection.'}
        </p>
      </div>
      {!success && (
        <button type="button" disabled className="btn-primary mx-auto w-full">
          Opening…
        </button>
      )}
    </section>
  );
}

// ── Choose accounts ──
function ChooseAccounts({ accounts, draft, firstToggleRef, onToggle, onCancel, onStart }: {
  accounts: BankAccountOption[];
  draft: string[];
  firstToggleRef: RefObject<HTMLButtonElement>;
  onToggle: (id: string) => void;
  onCancel: () => void;
  onStart: () => void;
}) {
  const canStart = draft.length > 0;
  return (
    <section className="card space-y-3">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-extrabold">Choose accounts</h2>
        <p className="text-[15px] leading-[1.45] text-on-surface-variant">
          Turn on the accounts On It should track. You can change this any time.
        </p>
      </div>
      <div className="overflow-hidden rounded-[18px] border border-outline-variant/70">
        {accounts.map((account, i) => {
          const on = draft.includes(account.id);
          return (
            <div key={account.id} className="bank-rise" style={{ '--i': i } as CSSProperties}>
              <button
                ref={i === 0 ? firstToggleRef : undefined}
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`Track ${account.name} ••${account.mask}`}
                onClick={() => onToggle(account.id)}
                className="flex min-h-touch w-full items-center gap-3 border-b border-outline-variant/40 px-3.5 py-2.5 text-left last:border-b-0"
              >
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-surface-container-high">
                  <Icon name={account.kind === 'credit' ? 'credit_card' : 'account_balance'} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">{account.name}</span>
                  <span className="block text-[13px] text-on-surface-variant">••{account.mask} · {account.kind}</span>
                </span>
                <span
                  aria-hidden
                  className={`bank-toggle relative h-8 w-[52px] shrink-0 rounded-full ${on ? 'bg-primary-container' : 'bg-surface-container-high'}`}
                >
                  <span
                    className={`bank-toggle-knob absolute left-1 top-1 h-6 w-6 rounded-full bg-surface-container-lowest shadow-sm ${on ? 'translate-x-5' : ''}`}
                  />
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        aria-disabled={!canStart}
        onClick={() => { if (canStart) onStart(); }}
        className="btn-primary w-full aria-disabled:opacity-40"
      >
        Start tracking
      </button>
      <button type="button" onClick={onCancel} className="min-h-touch w-full text-center text-sm font-semibold text-on-surface-variant underline">
        Not now
      </button>
    </section>
  );
}

// ── Linked ──
function LinkedCard({ connection, onReconnect, onDigest, onDisconnect }: {
  connection: BankConnection;
  onReconnect: () => void;
  onDigest: () => void;
  onDisconnect: () => void;
}) {
  const syncing = connection.status === 'syncing';
  const reconnect = connection.status === 'needsReconnect';
  const tracked = trackedCount(connection);
  return (
    <div className="space-y-4">
      <section className={`card space-y-3 ${syncing ? 'bank-shimmer' : ''}`}>
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-primary-soft">
            <Icon name="account_balance" size={24} className="text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-lg font-extrabold">{connection.institution}</h2>
            <p className="truncate text-[13px] text-on-surface-variant">
              {tracked} {tracked === 1 ? 'account' : 'accounts'} tracked
            </p>
          </div>
          <div aria-live="polite" className="flex shrink-0 items-center gap-1.5">
            <span aria-hidden className={`h-2 w-2 rounded-full bg-primary-container ${syncing ? 'bank-breathe' : ''}`} />
            <span className="text-[13px] font-semibold text-primary">{ACCOUNT_STATUS_COPY[connection.status]}</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-[16px] border border-outline-variant/60">
          {connection.accounts.filter((a) => connection.tracked.includes(a.id)).map((account) => (
            <div key={account.id} className="flex min-h-[52px] items-center gap-3 border-b border-outline-variant/40 px-3 last:border-b-0">
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-surface-container-high">
                <Icon name={account.kind === 'credit' ? 'credit_card' : 'account_balance'} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{account.name}</span>
                <span className="block text-[12.5px] text-on-surface-variant">••{account.mask}</span>
              </span>
              <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[.06em] text-on-surface-variant">
                Tracking
              </span>
            </div>
          ))}
        </div>

        {reconnect && (
          <button type="button" onClick={onReconnect} className="btn-outline w-full">
            <Icon name="sync" size={18} />
            Reconnect
          </button>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-container-lowest">
        <button type="button" onClick={onDigest} className="flex min-h-[54px] w-full items-center gap-3 border-b border-outline-variant/40 px-3.5 text-left">
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-surface-container-high">
            <Icon name="schedule" size={19} />
          </span>
          <span className="flex-1 text-base font-medium">Digest time</span>
          <span className="text-[15px] text-on-surface-variant">{digestLabel(connection.digestTime)}</span>
          <Icon name="chevron_right" size={20} className="shrink-0 text-outline" />
        </button>
        <button type="button" onClick={onDisconnect} className="flex min-h-[54px] w-full items-center gap-3 px-3.5 text-left">
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-surface-container-high">
            <Icon name="link_off" size={19} />
          </span>
          <span className="flex-1 text-base font-medium">Disconnect bank</span>
          <Icon name="chevron_right" size={20} className="shrink-0 text-outline" />
        </button>
      </section>
    </div>
  );
}

