'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { money } from '@/lib/financials';
import { cashAppUrl, payPalUrl, venmoUrl } from '@/lib/url';
// Bank details: only when the RPC returned them and publicBank let them through;
// the account number arrives masked (last 4) until the payer taps to show it.
import type { PayBank } from '@/lib/pay-bank';

// ─────────────────────────────────────────────────────────────────────────
// Public pay page view. Receives a fully-shaped, already-whitelisted model
// from the server component (which fetched it through the service-role
// get_public_invoice RPC). This component holds no secrets. Its client
// behavior: copy-to-clipboard for the payment handles, and "Pay with card",
// which POSTs /api/pay/[token]/checkout (the server decides the amount and
// every gate) and follows the returned Stripe Checkout URL.
// ─────────────────────────────────────────────────────────────────────────

// After a card payment, Stripe sends the client back to ?paid=1 — but the
// ledger row is written by the webhook, which can land a few seconds later.
// Before redirecting to Stripe we remember amount_paid; on return, the page
// refreshes (re-runs the server RPC) until amount_paid rises above it.
const baselineKey = (token: string) => `onit_pay_baseline_${token}`;
// Every refresh re-runs the server page, which counts against pay_view (30/min
// per IP). 4s × 15 = one minute of polling = 15 loads, plus the return load:
// ~16/min, leaving headroom for a shared IP (household / carrier NAT). If the
// limit ever trips, the server renders its "One moment" notice instead of this
// view, so staying well under it matters.
const POLL_MS = 4000;
const POLL_MAX = 15;
// Continuous visible time before the page reports a view (see the beacon below).
const VIEW_DWELL_MS = 3000;

export interface PayHandles {
  paypalMe: string | null;
  cashappTag: string | null;
  venmoUsername: string | null;
  zelle: string | null;
}


export interface PayLineItem {
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
  /** "hr" / "sq ft" / "job" label for the quantity, or '' (merge 2 · 2·9). */
  unitLabel?: string;
  /** The line's description from a saved product, if any. */
  detail?: string | null;
}

export interface PayModel {
  businessName: string;
  logoUrl: string | null;
  docNumber: string; // e.g. "INV-0007"
  noun: string; // "Invoice" | "Estimate"
  lineItems: PayLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  showTaxBreakdown: boolean; // true when the invoice carries a tax rate
  total: number;
  primaryLabel: string; // "Total due" | "Deposit due now" | "Balance due" | "Paid in full"
  primaryAmount: number;
  showTotalSubline: boolean; // true when primaryAmount differs from total
  depositAmount: number;
  depositDue: boolean;
  depositPaid: boolean;
  balanceAfterDeposit: number;
  amountDue: number;
  amountPaid: number;
  fullyPaid: boolean;
  voided: boolean; // status void: no payment methods, nothing payable
  hasHandles: boolean;
  handles: PayHandles;
  bank: PayBank | null;
  cardAvailable: boolean; // display-only; the checkout route re-checks everything
  token: string;
  paidReturn: boolean; // arrived back from Stripe Checkout (?paid=1)
}

// Business logo in a 96px tile: white surface, 12px padding, 26px radius and
// a soft shadow so a transparent or odd-shaped logo still reads as deliberate.
// Wide logos get a wider tile (up to 200px) so they stay legible instead of
// shrinking to a sliver. No logo (or a broken one) falls back to gold initials.
function PayLogo({ url, businessName }: { url: string | null; businessName: string }) {
  const [tileWidth, setTileWidth] = useState(96);
  const [failed, setFailed] = useState(false);
  const initials =
    businessName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?';

  if (!url || failed) {
    return (
      <div
        aria-hidden
        className="mb-4 flex h-24 w-24 shrink-0 items-center justify-center rounded-[26px] bg-primary-container font-display text-[34px] font-bold tracking-[0.02em] text-primary-on-container"
      >
        {initials}
      </div>
    );
  }

  return (
    <div
      className="mb-4 box-border flex h-24 shrink-0 items-center justify-center rounded-[26px] bg-white p-3 shadow-[0_1px_2px_rgba(30,26,21,0.05),0_8px_22px_-10px_rgba(30,26,21,0.18)]"
      style={{ width: tileWidth }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${businessName} logo`}
        className="block h-full w-full object-contain"
        onLoad={(e) => {
          const img = e.currentTarget;
          const ratio = img.naturalWidth / img.naturalHeight;
          if (!Number.isFinite(ratio) || ratio <= 2) return;
          // Padding is 12px each side, so the inner box is tileWidth − 24.
          setTileWidth(Math.min(200, Math.max(96, Math.round(24 + ratio * 72))));
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false; // clipboard blocked — caller selects the text for manual copy
  }
}

// Clipboard access can be denied in in-app browsers. Select the visible value
// instead so the customer can copy it by hand; never claim success.
function selectText(el: HTMLElement | null): boolean {
  if (!el || typeof window === 'undefined') return false;
  const selection = window.getSelection();
  if (!selection) return false;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

// One outlined cream control for every Copy / Open affordance. Neutral
// border, dark text, icon, 44px minimum height — the single button style on
// this page (the Card row keeps its gold ring and gold "Pay" label).
const PILL_BASE =
  'flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-input border px-3 text-label-lg';
const PILL_NEUTRAL = `${PILL_BASE} border-outline-variant bg-surface-container-low text-on-background active:bg-surface-container-high`;
const PILL_COPIED = `${PILL_BASE} border-paid/40 bg-paid-container text-paid`;
const PILL_STATIC = `${PILL_BASE} border-outline-variant bg-surface-container-low text-on-background`;

// Secondary Copy inside a tappable row (rows that also have Open). Its own
// real <button>; stopPropagation so copying never triggers the row's Open.
function CopyButton({
  value,
  label,
  onCopied,
  onCopyFailed,
  resolveValue,
}: {
  value?: string;
  label: string;
  onCopied: () => void;
  // Clipboard write failed: select the visible value so it can be copied by
  // hand. Never show "Copied" in that case.
  onCopyFailed?: () => void;
  // For values the page does not hold yet (the full bank account number):
  // fetch on demand, then copy. A failed fetch shows no false "Copied".
  resolveValue?: () => Promise<string | null>;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (busy) return;
    const button = e.currentTarget; // currentTarget is null after an await
    setBusy(true);
    try {
      const text = resolveValue ? await resolveValue() : value;
      if (!text) return;
      if (await copyText(text)) {
        setCopied(true);
        onCopied();
        setTimeout(() => setCopied(false), 1600);
      } else {
        // No false confirmation: select the visible value for manual copy.
        selectText(
          button.closest('[data-copy-row]')?.querySelector<HTMLElement>('[data-copy-value]') ?? null,
        );
        onCopyFailed?.();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      onKeyDown={(e) => e.stopPropagation()} // Enter/Space on Copy stays on Copy
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      aria-live="polite"
      className={`min-w-[88px] ${copied ? PILL_COPIED : PILL_NEUTRAL}`}
    >
      <Icon name={copied ? 'check' : 'content_copy'} size={16} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// One "How to pay" row, tappable as a whole: the row IS the primary action
// (Card → Pay, Cash App / PayPal / Venmo → Open, Zelle → Copy). A <li> with
// role="button" rather than a <button>, because link rows nest a real Copy
// button (a <button> can't contain another). Keyboard: focusable, Enter and
// Space activate. ≥56px tall (h-touch), with a pressed state.
function PayRow({
  label,
  onActivate,
  busy = false,
  ring = false,
  expanded,
  below,
  children,
}: {
  label: string;
  onActivate: (row: HTMLElement) => void;
  busy?: boolean;
  ring?: boolean;
  // Expandable rows (Bank transfer): `below` renders full-width under the
  // row's content line; taps inside it don't toggle the row.
  expanded?: boolean;
  below?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={expanded}
      aria-disabled={busy || undefined}
      data-copy-row
      onClick={(e) => { if (!busy) onActivate(e.currentTarget); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!busy) onActivate(e.currentTarget);
        }
      }}
      className={`flex min-h-touch cursor-pointer items-center gap-3 ${below ? 'flex-wrap' : ''} rounded-card bg-surface-container-lowest p-3 shadow-card transition-transform active:scale-[0.99] active:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        ring ? 'border-2 border-primary-container' : ''
      } ${busy ? 'opacity-60' : ''}`}
    >
      {children}
      {below}
    </li>
  );
}

// The right-side action label inside a row. Visual only — the row handles the
// tap. Copy and Open use the shared outlined control; Pay and Show stay in
// text-safe gold (#735c00) with a Material Symbol.
function RowAction({
  icon,
  text,
  flip = false,
  pill = false,
}: {
  icon: 'arrow_forward' | 'open_in_new' | 'content_copy' | 'check' | 'expand_more';
  text: string;
  flip?: boolean;
  pill?: boolean;
}) {
  if (pill) {
    return (
      <span aria-hidden className={`min-w-[88px] ${PILL_STATIC}`}>
        <Icon name={icon} size={16} className={flip ? 'rotate-180' : ''} />
        {text}
      </span>
    );
  }
  return (
    <span aria-hidden className="flex h-touch min-w-[56px] shrink-0 items-center justify-center gap-1 px-3 text-label-lg text-primary">
      <Icon name={icon} size={20} className={flip ? 'rotate-180' : ''} />
      {text}
    </span>
  );
}

// Expanded Bank transfer details: one field per line, each with Copy. The
// page data carries the account number masked to its last 4. "Show account
// number" fetches the full one from POST /api/pay/[token]/bank (rate limited,
// same gates as the page); Copy fetches the same value without revealing it,
// so the full number can be copied while the display stays masked. Taps here
// never collapse the row.
function BankDetails({ bank, token, docNumber, onCopied }: { bank: PayBank; token: string; docNumber: string; onCopied: (label: string) => void }) {
  const [account, setAccount] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState('');
  // Cached full number. Copy uses it without changing the display, so the
  // account can stay masked while it is copied; Show reveals the same value.
  const accountRef = useRef<string | null>(null);

  async function loadAccount(): Promise<string | null> {
    if (accountRef.current) return accountRef.current;
    setRevealError('');
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}/bank`, { method: 'POST', cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as { account?: unknown } | null;
      if (res.ok && typeof body?.account === 'string') {
        accountRef.current = body.account;
        return body.account;
      }
      if (res.status === 429) setRevealError('Too many tries. Please wait a while and try again.');
      else if (res.status === 404) setRevealError('Bank details are no longer available for this invoice.');
      else setRevealError('Couldn’t load the account number. Please try again.');
      return null;
    } catch {
      setRevealError('Couldn’t load the account number. Please try again.');
      return null;
    }
  }

  async function reveal() {
    if (revealing) return;
    setRevealing(true);
    const value = await loadAccount();
    if (value) setAccount(value);
    setRevealing(false);
  }
  // Text wraps on words only (the memo once split "mem / o"). Digit-only
  // values (routing, account) have no words, so they may break anywhere.
  const line = (label: string, value: React.ReactNode, copy: string | null, digits = false) => (
    <div data-copy-row className="flex min-h-touch items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-on-surface-variant">{label}</p>
        <div
          data-copy-value
          className={`${digits ? 'break-all' : ''} break-words text-body-md text-on-background`}
        >
          {value}
        </div>
      </div>
      {copy ? <CopyButton value={copy} label={label} onCopied={() => onCopied(label)} /> : null}
    </div>
  );
  return (
    <div
      className="w-full basis-full cursor-auto select-text border-t border-outline-variant pt-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {line('Account holder', bank.holderName, bank.holderName)}
      {line('Bank', bank.bankName, bank.bankName)}
      {line('Routing number', bank.routing, bank.routing, true)}
      <div data-copy-row className="flex min-h-touch items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-on-surface-variant">Account number</p>
          {account ? (
            <div className="flex flex-wrap items-center gap-x-2">
              <span data-copy-value className="break-all text-body-md text-on-background">{account}</span>
              <button
                type="button"
                onClick={() => setAccount(null)}
                aria-label="Hide account number"
                className="flex min-h-[44px] items-center gap-1 text-label-lg text-primary"
              >
                <Icon name="visibility_off" size={18} />
                Hide account number
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={reveal}
              disabled={revealing}
              aria-label="Show account number"
              className="flex min-h-[44px] items-center gap-1 text-body-md text-on-background"
            >
              {`••••${bank.accountLast4}`}
              <span className="flex items-center gap-1 text-label-lg text-primary">
                <Icon name="visibility" size={18} />
                {revealing ? 'Showing…' : 'Show account number'}
              </span>
            </button>
          )}
        </div>
        <CopyButton
          label="Account number"
          onCopied={() => onCopied('Account number')}
          resolveValue={loadAccount}
          // Clipboard blocked: reveal the number that was just fetched so it
          // can be selected by hand. No "Copied" state is shown.
          onCopyFailed={() => setAccount(accountRef.current)}
        />
      </div>
      {revealError ? <p role="alert" className="pb-1 text-xs text-error">{revealError}</p> : null}
      {line('Account type', bank.accountType === 'savings' ? 'Savings' : 'Checking', null)}
      {line('Memo', docNumber, docNumber)}
      <p className="pb-1 pt-1 text-xs text-on-surface-variant">Bank transfers usually take 1–3 business days.</p>
    </div>
  );
}

// 'idle' — normal page · 'processing' — back from Stripe, waiting for the
// webhook's ledger row · 'received' — it landed · 'slow' — still not seen
// after POLL_MAX refreshes.
type CardReturn = 'idle' | 'processing' | 'received' | 'slow';

export default function PayView({ model }: { model: PayModel }) {
  const h = model.handles;
  const router = useRouter();

  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState('');
  // Line items: collapsed to the first row (description clamped to two lines),
  // expanded shows the full list and full descriptions. Scroll targets are
  // refs, not document order — the payment section stays the "How to pay"
  // anchor wherever the cards sit.
  const [itemsOpen, setItemsOpen] = useState(false);
  const itemsRef = useRef<HTMLElement | null>(null);
  const payRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const [barVisible, setBarVisible] = useState(false);
  const itemsCollapsible = model.lineItems.length > 1;
  const visibleItems = itemsCollapsible && !itemsOpen ? model.lineItems.slice(0, 1) : model.lineItems;
  function toggleItems() {
    const wasOpen = itemsOpen;
    setItemsOpen(!wasOpen);
    // Collapsing a long list would otherwise leave the page scrolled past it.
    if (wasOpen) {
      requestAnimationFrame(() =>
        itemsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      );
    }
  }
  // Bottom toast for copies ("Zelle copied"). One at a time; auto-hides.
  const [toast, setToast] = useState('');
  const [bankOpen, setBankOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1800);
  }
  // Synchronous guard: two taps in one frame both see cardBusy=false.
  const cardInFlight = useRef(false);

  // "Viewed" beacon (POST /api/pay/[token]/viewed): once per page load, only
  // after the page has been VISIBLE for VIEW_DWELL_MS continuously. Hiding the
  // tab restarts the clock. Email security scanners run JS but don't sit on a
  // visible page, and link-preview fetchers never run it at all. The server
  // decides whether the view counts (first view, not the owner, 2+ min after
  // send); the response says nothing either way.
  const viewedSent = useRef(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (t) { clearTimeout(t); t = null; }
      if (viewedSent.current || document.visibilityState !== 'visible') return;
      t = setTimeout(() => {
        if (viewedSent.current || document.visibilityState !== 'visible') return;
        viewedSent.current = true;
        document.removeEventListener('visibilitychange', arm);
        void fetch(`/api/pay/${encodeURIComponent(model.token)}/viewed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
          keepalive: true,
        }).catch(() => { /* best-effort */ });
      }, VIEW_DWELL_MS);
    };
    arm();
    document.addEventListener('visibilitychange', arm);
    return () => {
      if (t) clearTimeout(t);
      document.removeEventListener('visibilitychange', arm);
    };
  }, [model.token]);

  // Sticky bar: the page scrolls normally; this only appears once the amount
  // card has scrolled fully above the viewport (not while it is still visible).
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setBarVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [cardReturn, setCardReturn] = useState<CardReturn>(model.paidReturn ? 'processing' : 'idle');
  // Poll counter as STATE, not a ref: each tick must re-run the effect below.
  // A refresh that returns the same amount_paid changes none of the model deps,
  // so a ref-only counter stopped polling after the first refresh.
  const [polls, setPolls] = useState(0);

  // Back from Stripe: compare against the amount_paid remembered at checkout.
  // Re-evaluated on every refresh (model.amountPaid changes when the row lands).
  useEffect(() => {
    if (!model.paidReturn || cardReturn === 'received') return;
    let baseline: number | null = null;
    try {
      const raw = sessionStorage.getItem(baselineKey(model.token));
      if (raw != null && Number.isFinite(Number(raw))) baseline = Number(raw);
    } catch { /* storage blocked — rely on fullyPaid / timeout */ }

    const landed = model.fullyPaid || (baseline != null && model.amountPaid > baseline);
    if (landed) {
      setCardReturn('received');
      try { sessionStorage.removeItem(baselineKey(model.token)); } catch { /* ignore */ }
      // Drop ?paid=1 without a navigation, so a reload shows the plain page.
      window.history.replaceState(null, '', `/pay/${model.token}`);
      return;
    }
    if (polls >= POLL_MAX) {
      setCardReturn('slow');
      return;
    }
    const t = setTimeout(() => {
      router.refresh(); // re-runs the server component → fresh RPC read
      setPolls((n) => n + 1); // re-arms this effect for the next tick
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [model.paidReturn, model.amountPaid, model.fullyPaid, model.token, cardReturn, router, polls]);

  async function payWithCard() {
    if (cardInFlight.current) return;
    cardInFlight.current = true;
    setCardBusy(true);
    setCardError('');
    let leaving = false;
    try {
      try { sessionStorage.setItem(baselineKey(model.token), String(model.amountPaid)); } catch { /* ignore */ }
      const res = await fetch(`/api/pay/${encodeURIComponent(model.token)}/checkout`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data?.url) {
        leaving = true; // stay disabled while the browser navigates to Stripe
        window.location.href = data.url;
        return;
      }
      setCardError(data?.message ?? 'We couldn’t start the card payment. Please try again.');
    } catch {
      setCardError('We couldn’t start the card payment. Please try again.');
    } finally {
      if (!leaving) {
        cardInFlight.current = false;
        setCardBusy(false);
      }
    }
  }

  // Ordered list of the methods this business actually configured. Value is the
  // display form (with $ / @ prefix); url is the deep link where one exists.
  // Zelle has no URL — it's an email/phone the client pays TO in their own bank
  // app — so it's copy-only.
  const methods: { key: string; name: string; value: string; url: string | null; color: string }[] = [];
  if (h.zelle) methods.push({ key: 'zelle', name: 'Zelle', value: h.zelle, url: null, color: '#6D1ED4' });
  if (h.paypalMe)
    methods.push({ key: 'paypal', name: 'PayPal', value: h.paypalMe, url: payPalUrl(h.paypalMe), color: '#003087' });
  if (h.cashappTag)
    methods.push({
      key: 'cashapp',
      name: 'Cash App',
      value: h.cashappTag.startsWith('$') ? h.cashappTag : `$${h.cashappTag}`,
      url: cashAppUrl(h.cashappTag),
      color: '#00D632',
    });
  if (h.venmoUsername)
    methods.push({
      key: 'venmo',
      name: 'Venmo',
      value: h.venmoUsername.startsWith('@') ? h.venmoUsername : `@${h.venmoUsername}`,
      url: venmoUrl(h.venmoUsername),
      color: '#008CFF',
    });

  // While a just-made card payment is being confirmed, don't offer it again.
  const showCard = model.cardAvailable && cardReturn !== 'processing' && cardReturn !== 'slow';

  const barState = model.voided
    ? 'Cancelled'
    : model.fullyPaid
      ? 'Paid'
      : model.depositDue
        ? 'Deposit due now'
        : model.depositPaid
          ? 'Balance due'
          : model.noun === 'Estimate'
            ? 'Estimate total'
            : 'Total due';
  const barAmount = model.fullyPaid || model.voided ? model.total : model.primaryAmount;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-container py-10">
      {/* Sticky bar — appears only after the hero leaves the viewport. */}
      <div
        aria-hidden={!barVisible}
        className={`pointer-events-none fixed inset-x-0 top-0 z-50 transition-transform duration-300 ease-out ${
          barVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
          className="pointer-events-auto border-b border-outline-variant bg-background/95 shadow-sm backdrop-blur"
        >
          <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-container py-2.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                {model.docNumber} · {barState}
              </p>
              <p className="font-display text-body-lg font-bold tabular-nums text-on-background">
                {money(barAmount)}
              </p>
            </div>
            {model.fullyPaid ? (
              <span className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full bg-paid-container px-3.5 text-label-lg font-semibold text-paid">
                <Icon name="check_circle" size={18} />
                Paid
              </span>
            ) : model.voided ? null : (
              <button
                type="button"
                onClick={() => payRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                tabIndex={barVisible ? 0 : -1}
                className={PILL_NEUTRAL}
              >
                <Icon name="expand_more" size={16} />
                How to pay
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Business identity */}
      <header className="flex flex-col items-center text-center">
        <PayLogo url={model.logoUrl} businessName={model.businessName} />
        <h1 className="font-display text-headline-lg text-on-background">{model.businessName}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {model.noun} {model.docNumber}
        </p>
      </header>

      {/* Card-payment return states (after Stripe Checkout). */}
      {cardReturn === 'processing' ? (
        <section className="mt-6 flex items-start gap-3 rounded-card bg-surface-container-lowest p-4 shadow-card" role="status">
          <Icon name="hourglass_empty" size={24} className="shrink-0 text-on-surface-variant" />
          <div>
            <p className="text-label-lg text-on-background">Confirming your card payment</p>
            <p className="mt-1 text-body-md text-on-surface-variant">This usually takes a few seconds. Please keep this page open.</p>
          </div>
        </section>
      ) : null}
      {cardReturn === 'slow' ? (
        <section className="mt-6 flex items-start gap-3 rounded-card bg-surface-container-lowest p-4 shadow-card" role="status">
          <Icon name="hourglass_empty" size={24} className="shrink-0 text-on-surface-variant" />
          <div>
            <p className="text-label-lg text-on-background">Your payment is still being confirmed</p>
            <p className="mt-1 text-body-md text-on-surface-variant">
              Stripe has your payment. It can take a minute to show here. Refresh this page shortly — please don’t pay again.
            </p>
          </div>
        </section>
      ) : null}
      {cardReturn === 'received' ? (
        <section className="mt-6 flex items-start gap-3 rounded-card bg-paid-container p-4" role="status">
          <Icon name="check_circle" size={24} className="shrink-0 text-paid" />
          <div>
            <p className="text-label-lg text-paid">Payment received</p>
            <p className="mt-1 text-body-md text-on-surface-variant">Thank you — {model.businessName} has been paid.</p>
          </div>
        </section>
      ) : null}

      {/* Amount card — the headline figure the client came to see. */}
      <section
        ref={heroRef}
        className={`mt-8 rounded-card p-6 text-center shadow-card ${
          model.fullyPaid ? 'bg-paid-container' : 'bg-surface-container-lowest'
        }`}
      >
        <p className="text-label-lg uppercase tracking-wide text-on-surface-variant">
          {model.primaryLabel}
        </p>
        <p className="mt-2 font-display text-numeric-xl text-on-background">
          {money(model.fullyPaid ? model.total : model.primaryAmount)}
        </p>
        {model.showTotalSubline && !model.fullyPaid ? (
          <p className="mt-1 text-body-md text-on-surface-variant">
            Total {money(model.total)}
          </p>
        ) : null}
        {model.depositPaid ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-paid-container px-3.5 py-1.5 text-sm font-medium text-paid">
            <Icon name="check" size={14} />
            Deposit of {money(model.depositAmount)} received
          </p>
        ) : null}
        {model.fullyPaid ? (
          <p className="mt-2 flex items-center justify-center gap-1 text-body-md text-paid">
            <Icon name="check_circle" size={20} />
            Thank you — nothing due.
          </p>
        ) : null}
      </section>

      {/* Line items — reference itemisation. Collapsed to the first row (each
          description clamped to two lines); the summary stays put when the list
          is open or collapsed. */}
      {model.lineItems.length > 0 ? (
        <section
          ref={itemsRef}
          className="mt-6 scroll-mt-24 overflow-hidden rounded-card bg-surface-container-lowest shadow-card"
        >
          <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-4">
            <h2 className="text-label-lg uppercase tracking-[0.1em] text-on-surface-variant">
              Line items
            </h2>
            <span className="text-sm text-on-surface-variant">
              {model.lineItems.length} {model.lineItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <ul className="divide-y divide-outline-variant border-t border-outline-variant">
            {visibleItems.map((li, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p
                    className={`text-body-md text-on-background ${
                      itemsCollapsible && !itemsOpen ? 'line-clamp-2' : ''
                    }`}
                  >
                    {li.description || 'Item'}
                  </p>
                  {li.detail ? <p className="text-sm text-on-surface-variant">{li.detail}</p> : null}
                  {li.qty !== 1 || li.unitLabel ? (
                    <p className="text-body-md text-on-surface-variant">
                      {li.qty}{li.unitLabel ? ` ${li.unitLabel}` : ''} × {money(li.unitPrice)}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-body-md text-on-background">{money(li.amount)}</p>
              </li>
            ))}
          </ul>
          {itemsCollapsible ? (
            <button
              type="button"
              onClick={toggleItems}
              aria-expanded={itemsOpen}
              className="flex min-h-[54px] w-full items-center justify-center gap-2 border-t border-outline-variant text-body-md font-semibold text-on-background active:bg-surface-container-low"
            >
              <span>{itemsOpen ? 'Show fewer' : `View all ${model.lineItems.length} items`}</span>
              {!itemsOpen ? (
                <span className="font-normal text-on-surface-variant">
                  +{model.lineItems.length - 1}
                </span>
              ) : null}
              <Icon
                name="expand_more"
                size={16}
                className={itemsOpen ? 'rotate-180' : ''}
              />
            </button>
          ) : null}
          <div className="space-y-2 border-t border-outline-variant bg-surface-container-low px-4 py-4">
            {model.showTaxBreakdown ? (
              <>
                <div className="flex items-center justify-between gap-3 text-body-md text-on-surface-variant">
                  <span>Subtotal</span>
                  <span>{money(model.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-body-md text-on-surface-variant">
                  <span>Tax{model.taxRate > 0 ? ` (${model.taxRate}%)` : ''}</span>
                  <span>{money(model.taxAmount)}</span>
                </div>
              </>
            ) : null}
            <div
              className={`flex items-baseline justify-between gap-3 text-body-md font-bold text-on-background ${
                model.showTaxBreakdown ? 'mt-1 border-t border-outline-variant pt-2' : ''
              }`}
            >
              <span>Total</span>
              <span className="font-display">{money(model.total)}</span>
            </div>
            {model.depositDue ? (
              <>
                <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-outline-variant pt-2 text-on-background">
                  <span className="text-body-md font-bold">Deposit due now</span>
                  <span className="font-display text-body-lg font-bold">
                    {money(model.depositAmount)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-body-md text-on-surface-variant">
                  <span>Balance after deposit</span>
                  <span>{money(model.balanceAfterDeposit)}</span>
                </div>
              </>
            ) : null}
            {model.depositPaid ? (
              <>
                <div className="flex items-baseline justify-between gap-3 text-body-md text-on-surface-variant">
                  <span>Deposit received</span>
                  <span>−{money(model.depositAmount)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-outline-variant pt-2 text-on-background">
                  <span className="text-body-md font-bold">Balance due</span>
                  <span className="font-display text-body-lg font-bold">
                    {money(model.amountDue)}
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Payment methods — how to pay. Sits below the itemisation. Hidden once
          fully paid or voided. Card first when the seller takes cards. */}
      {model.voided ? (
        <section className="mt-6 rounded-card bg-surface-container-lowest p-6 text-center shadow-card">
          <Icon name="block" size={32} className="text-on-surface-variant" />
          <p className="mt-2 text-body-md text-on-background">This invoice was cancelled. Nothing is due.</p>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Questions? Contact {model.businessName} directly.
          </p>
        </section>
      ) : !model.fullyPaid ? (
        <section ref={payRef} id="how-to-pay" className="mt-6 scroll-mt-24">
          <h2 className="mb-3 text-label-lg uppercase tracking-wide text-on-surface-variant">How to pay</h2>

          {showCard || model.hasHandles ? (
            <ul className="flex flex-col gap-3">
              {/* Card — always the first row, same format as the handle rows.
                  The only row with a 2px gold ring (#d4af37 = primary-container,
                  used as a border, never as text). Action "Pay" is text-safe
                  gold (#735c00 = primary) + a Material Symbol, like "Open". */}
              {showCard ? (
                <PayRow
                  label={`Pay ${money(model.primaryAmount)} by card, Apple Pay, Google Pay or Cash App Pay`}
                  onActivate={payWithCard}
                  busy={cardBusy}
                  ring
                >
                  <Icon name="payments" size={20} className="shrink-0 text-on-surface-variant" />
                  <div className="min-w-0 flex-1">
                    <p className="text-label-lg text-on-background">Card</p>
                    <p className="text-body-md text-on-surface-variant">Card or wallet</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-on-surface-variant">
                      <Icon name="lock" size={14} />
                      Secure checkout by Stripe
                    </p>
                  </div>
                  <RowAction icon="arrow_forward" text={cardBusy ? 'Opening…' : 'Pay'} />
                </PayRow>
              ) : null}
              {/* Bank transfer — directly under the card row, above the handles.
                  Same row format; the row toggles the details open (Show / Hide). */}
              {model.bank ? (
                <PayRow
                  label={bankOpen ? 'Hide bank transfer details' : 'Show bank transfer details'}
                  onActivate={() => setBankOpen((o) => !o)}
                  expanded={bankOpen}
                  below={bankOpen ? (
                    <BankDetails bank={model.bank} token={model.token} docNumber={model.docNumber} onCopied={(l) => showToast(`${l} copied`)} />
                  ) : null}
                >
                  <Icon name="account_balance" size={20} className="shrink-0 text-on-surface-variant" />
                  <div className="min-w-0 flex-1">
                    <p className="text-label-lg text-on-background">Bank transfer</p>
                    <p className="truncate text-body-md text-on-surface-variant">Direct deposit / ACH</p>
                  </div>
                  <RowAction icon="expand_more" text={bankOpen ? 'Hide' : 'Show'} flip={bankOpen} />
                </PayRow>
              ) : null}
              {methods.map((m) => {
                const dot = (
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: m.color }} aria-hidden />
                );
                const text = (
                  <div className="min-w-0 flex-1">
                    <p className="text-label-lg text-on-background">{m.name}</p>
                    <p data-copy-value className="break-words text-body-md text-on-surface-variant">{m.value}</p>
                  </div>
                );
                return m.url ? (
                  // Link rows (Cash App / PayPal / Venmo): row → Open; Copy stays
                  // its own button. window.open inside the tap keeps it a user
                  // gesture; noopener matches the old <a rel="noopener">.
                  <PayRow
                    key={m.key}
                    label={`Open ${m.name}`}
                    onActivate={() => window.open(m.url!, '_blank', 'noopener,noreferrer')}
                  >
                    {dot}
                    {text}
                    <RowAction icon="open_in_new" text="Open" pill />
                    <CopyButton value={m.value} label={m.name} onCopied={() => showToast(`${m.name} copied`)} />
                  </PayRow>
                ) : (
                  // Zelle: no link — the row itself copies, with a toast.
                  <PayRow
                    key={m.key}
                    label={`Copy ${m.name}`}
                    onActivate={async (row) => {
                      if (await copyText(m.value)) {
                        showToast(`${m.name} copied`);
                      } else {
                        // Clipboard blocked: select the handle, no toast.
                        selectText(row.querySelector<HTMLElement>('[data-copy-value]'));
                      }
                    }}
                  >
                    {dot}
                    {text}
                    <RowAction icon="content_copy" text="Copy" pill />
                  </PayRow>
                );
              })}
            </ul>
          ) : !model.cardAvailable ? (
            // No handles and no card — the business hasn't saved a way to pay.
            <div className="rounded-card bg-surface-container-lowest p-6 text-center shadow-card">
              <Icon name="account_balance_wallet" size={32} className="text-on-surface-variant" />
              <p className="mt-2 text-body-md text-on-background">
                No online payment methods are set up yet.
              </p>
              <p className="mt-1 text-body-md text-on-surface-variant">
                Contact {model.businessName} directly to arrange payment.
              </p>
            </div>
          ) : null}
          {cardError ? (
            <p className="mt-2 text-center text-body-md text-error" role="alert">{cardError}</p>
          ) : null}
        </section>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed bottom-8 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-card bg-inverse-surface px-4 py-3 text-body-md text-inverse-on-surface shadow-card-raised"
        >
          <Icon name="check" size={18} />
          {toast}
        </div>
      ) : null}

      <footer className="mt-auto pt-10 text-center">
        <p className="text-body-md text-on-surface-variant">Sent with On It</p>
        <p className="mt-2 text-xs text-on-surface-variant">
          <a href="/privacy" className="underline underline-offset-2">Privacy</a>
          {' · '}
          <a href="/terms" className="underline underline-offset-2">Terms</a>
        </p>
      </footer>
    </main>
  );
}
