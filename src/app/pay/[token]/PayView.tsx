'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { money } from '@/lib/financials';

// ─────────────────────────────────────────────────────────────────────────
// Public pay page view. Receives a fully-shaped, already-whitelisted model
// from the server component (which fetched it through the service-role
// get_public_invoice RPC). This component holds no secrets. Its client
// behavior: copy-to-clipboard for the payment handles, and "Pay with card",
// which POSTs /api/pay/[token]/checkout (the server decides the amount and
// every gate) and follows the returned Stripe Checkout URL.
// ─────────────────────────────────────────────────────────────────────────

// Handle → deep link. Mirrors src/lib/pdf/templates/index.tsx:84-87, where the
// PDF footer builds the same links. Kept local so this read-only page doesn't
// pull in the PDF render module; consolidate into a shared helper in a later
// branch (tracked in PUNCH-LIST).
const cashAppUrl = (tag: string) =>
  `https://cash.app/${tag.startsWith('$') ? tag : `$${tag}`}`;
const payPalUrl = (h: string) =>
  `https://paypal.me/${h.replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, '').replace(/^[@/]+/, '')}`;
const venmoUrl = (h: string) => `https://venmo.com/u/${h.replace(/^@/, '')}`;

// After a card payment, Stripe sends the client back to ?paid=1 — but the
// ledger row is written by the webhook, which can land a few seconds later.
// Before redirecting to Stripe we remember amount_paid; on return, the page
// refreshes (re-runs the server RPC) until amount_paid rises above it.
const baselineKey = (token: string) => `onit_pay_baseline_${token}`;
const POLL_MS = 3000;
const POLL_MAX = 20; // ~60s — within the pay_view limit (30/min per IP)

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

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the value is on screen to copy manually */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className="flex h-touch min-w-[56px] items-center justify-center gap-1 rounded-button px-3 text-label-lg text-primary"
    >
      <Icon name={copied ? 'check' : 'content_copy'} size={20} />
      {copied ? 'Copied' : 'Copy'}
    </button>
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
  // Synchronous guard: two taps in one frame both see cardBusy=false.
  const cardInFlight = useRef(false);

  const [cardReturn, setCardReturn] = useState<CardReturn>(model.paidReturn ? 'processing' : 'idle');
  const polls = useRef(0);

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
    if (polls.current >= POLL_MAX) {
      setCardReturn('slow');
      return;
    }
    const t = setTimeout(() => {
      polls.current += 1;
      router.refresh(); // re-runs the server component → fresh RPC read
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [model.paidReturn, model.amountPaid, model.fullyPaid, model.token, cardReturn, router]);

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

          {showCard ? (
            <div className="mb-3">
              {/* Gold as a FILL with dark text (.btn-primary) — brand rule. */}
              <button
                type="button"
                onClick={payWithCard}
                disabled={cardBusy}
                className="btn-primary w-full"
              >
                <Icon name="payments" size={20} />
                {cardBusy ? 'Opening secure checkout…' : `Pay ${money(model.primaryAmount)} with card`}
              </button>
              <p className="mt-2 flex items-center justify-center gap-1 text-body-md text-on-surface-variant">
                <Icon name="lock" size={16} />
                Secure checkout by Stripe
              </p>
              {cardError ? (
                <p className="mt-2 text-center text-body-md text-error" role="alert">{cardError}</p>
              ) : null}
            </div>
          ) : null}

          {model.hasHandles ? (
            <ul className="flex flex-col gap-3">
              {methods.map((m) => (
                <li
                  key={m.key}
                  className="flex items-center gap-3 rounded-card bg-surface-container-lowest p-3 shadow-card"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: m.color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-label-lg text-on-background">{m.name}</p>
                    <p className="truncate text-body-md text-on-surface-variant">{m.value}</p>
                  </div>
                  {m.url ? (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${m.name}`}
                      className="flex h-touch min-w-[56px] items-center justify-center gap-1 rounded-button px-3 text-label-lg text-primary"
                    >
                      <Icon name="open_in_new" size={20} />
                      Open
                    </a>
                  ) : null}
                  <CopyButton value={m.value} label={m.name} />
                </li>
              ))}
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

      <footer className="mt-auto pt-10 text-center">
        <p className="text-body-md text-on-surface-variant">Sent with On It</p>
      </footer>
    </main>
  );
}
