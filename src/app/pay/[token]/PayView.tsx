'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { money } from '@/lib/financials';
import { cashAppUrl, payPalUrl, venmoUrl } from '@/lib/url';

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
}

export interface PayModel {
  businessName: string;
  logoUrl: string | null;
  docNumber: string; // e.g. "INV-0007"
  noun: string; // "Invoice" | "Quote"
  lineItems: PayLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  showTaxBreakdown: boolean; // true when there's tax to reconcile against the items
  total: number;
  primaryLabel: string; // "Total due" | "Deposit due now" | "Balance due" | "Paid in full"
  primaryAmount: number;
  showTotalSubline: boolean; // true when primaryAmount differs from total
  amountPaid: number;
  fullyPaid: boolean;
  hasHandles: boolean;
  handles: PayHandles;
  cardAvailable: boolean; // display-only; the checkout route re-checks everything
  token: string;
  paidReturn: boolean; // arrived back from Stripe Checkout (?paid=1)
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false; // clipboard blocked — the value is on screen to copy manually
  }
}

// Secondary Copy inside a tappable row (rows that also have Open). Its own
// real <button>; stopPropagation so copying never triggers the row's Open.
function CopyButton({ value, label, onCopied }: { value: string; label: string; onCopied: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    if (await copyText(value)) {
      setCopied(true);
      onCopied();
      setTimeout(() => setCopied(false), 1600);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      onKeyDown={(e) => e.stopPropagation()} // Enter/Space on Copy stays on Copy
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className="flex h-touch min-w-[56px] shrink-0 items-center justify-center gap-1 rounded-button px-3 text-label-lg text-primary active:bg-surface-container"
    >
      <Icon name={copied ? 'check' : 'content_copy'} size={20} />
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
  children,
}: {
  label: string;
  onActivate: () => void;
  busy?: boolean;
  ring?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-disabled={busy || undefined}
      onClick={() => { if (!busy) onActivate(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!busy) onActivate();
        }
      }}
      className={`flex min-h-touch cursor-pointer select-none items-center gap-3 rounded-card bg-surface-container-lowest p-3 shadow-card transition-transform active:scale-[0.99] active:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        ring ? 'border-2 border-primary-container' : ''
      } ${busy ? 'opacity-60' : ''}`}
    >
      {children}
    </li>
  );
}

// The right-side action label inside a row. Visual only — the row handles the
// tap — in text-safe gold (#735c00) with a Material Symbol, like before.
function RowAction({ icon, text }: { icon: 'arrow_forward' | 'open_in_new' | 'content_copy' | 'check'; text: string }) {
  return (
    <span aria-hidden className="flex h-touch min-w-[56px] shrink-0 items-center justify-center gap-1 px-3 text-label-lg text-primary">
      <Icon name={icon} size={20} />
      {text}
    </span>
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
  // Bottom toast for copies ("Zelle copied"). One at a time; auto-hides.
  const [toast, setToast] = useState('');
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-container py-10">
      {/* Business identity */}
      <header className="flex flex-col items-center text-center">
        {model.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={model.logoUrl}
            alt={model.businessName}
            className="mb-4 h-16 w-16 rounded-card object-contain"
          />
        ) : null}
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
        className={`mt-8 rounded-card p-6 text-center shadow-card ${
          model.fullyPaid ? 'bg-paid-container' : 'bg-surface-container-lowest'
        }`}
      >
        {/* Money breakdown — reconciles the line items with the total (matches
            the PDF). Shown only when there's tax to explain. */}
        {model.showTaxBreakdown ? (
          <div className="mb-4 space-y-1 border-b border-outline-variant pb-4 text-left">
            <div className="flex items-center justify-between text-body-md text-on-surface-variant">
              <span>Subtotal</span>
              <span>{money(model.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-body-md text-on-surface-variant">
              <span>Tax{model.taxRate > 0 ? ` (${model.taxRate}%)` : ''}</span>
              <span>{money(model.taxAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-body-md font-display text-on-background">
              <span>Total</span>
              <span>{money(model.total)}</span>
            </div>
          </div>
        ) : null}
        <p className="text-label-lg uppercase tracking-wide text-on-surface-variant">
          {model.primaryLabel}
        </p>
        <p className="mt-2 font-display text-numeric-xl text-on-background">
          {money(model.fullyPaid ? model.total : model.primaryAmount)}
        </p>
        {model.showTotalSubline && !model.fullyPaid ? (
          <p className="mt-1 text-body-md text-on-surface-variant">
            Total {money(model.total)}
            {model.amountPaid > 0 ? ` · Paid ${money(model.amountPaid)}` : ''}
          </p>
        ) : null}
        {model.fullyPaid ? (
          <p className="mt-2 flex items-center justify-center gap-1 text-body-md text-paid">
            <Icon name="check_circle" size={20} />
            Thank you — nothing due.
          </p>
        ) : null}
      </section>

      {/* Payment methods — how to pay. Placed ABOVE the (uncapped) line items so
          the client sees how to pay without scrolling past a long itemisation.
          Hidden once fully paid. Card first when the seller takes cards. */}
      {!model.fullyPaid ? (
        <section className="mt-6">
          <h2 className="mb-3 text-label-lg uppercase tracking-wide text-on-surface-variant">How to pay</h2>

          {showCard || model.hasHandles ? (
            <ul className="flex flex-col gap-3">
              {/* Card — always the first row, same format as the handle rows.
                  The only row with a 2px gold ring (#d4af37 = primary-container,
                  used as a border, never as text). Action "Pay" is text-safe
                  gold (#735c00 = primary) + a Material Symbol, like "Open". */}
              {showCard ? (
                <PayRow
                  label={`Pay ${money(model.primaryAmount)} by card or Cash App Pay`}
                  onActivate={payWithCard}
                  busy={cardBusy}
                  ring
                >
                  <Icon name="payments" size={20} className="shrink-0 text-on-surface-variant" />
                  <div className="min-w-0 flex-1">
                    <p className="text-label-lg text-on-background">Card</p>
                    <p className="truncate text-body-md text-on-surface-variant">Card or Cash App Pay</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-on-surface-variant">
                      <Icon name="lock" size={14} />
                      Secure checkout by Stripe
                    </p>
                  </div>
                  <RowAction icon="arrow_forward" text={cardBusy ? 'Opening…' : 'Pay'} />
                </PayRow>
              ) : null}
              {methods.map((m) => {
                const dot = (
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: m.color }} aria-hidden />
                );
                const text = (
                  <div className="min-w-0 flex-1">
                    <p className="text-label-lg text-on-background">{m.name}</p>
                    <p className="truncate text-body-md text-on-surface-variant">{m.value}</p>
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
                    <RowAction icon="open_in_new" text="Open" />
                    <CopyButton value={m.value} label={m.name} onCopied={() => showToast(`${m.name} copied`)} />
                  </PayRow>
                ) : (
                  // Zelle: no link — the row itself copies, with a toast.
                  <PayRow
                    key={m.key}
                    label={`Copy ${m.name}`}
                    onActivate={async () => {
                      if (await copyText(m.value)) showToast(`${m.name} copied`);
                    }}
                  >
                    {dot}
                    {text}
                    <RowAction icon="content_copy" text="Copy" />
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

      {/* Line items — reference itemisation, beneath the amount and how-to-pay. */}
      {model.lineItems.length > 0 ? (
        <section className="mt-6 rounded-card bg-surface-container-lowest p-4 shadow-card">
          <ul className="divide-y divide-outline-variant">
            {model.lineItems.map((li, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-body-md text-on-background">{li.description || 'Item'}</p>
                  {li.qty !== 1 ? (
                    <p className="text-body-md text-on-surface-variant">
                      {li.qty} × {money(li.unitPrice)}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-body-md text-on-background">{money(li.amount)}</p>
              </li>
            ))}
          </ul>
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
      </footer>
    </main>
  );
}
