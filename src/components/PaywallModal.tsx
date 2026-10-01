'use client';
/* ═══ Paywall modal ═══
   Shown when a free-tier user hits the 2-invoice or 2-expense cap (variant).
   Tokens from
   ON-IT-DESIGN-STANDARD.md. Plain-built: fade+scale entrance (reduced-motion
   killed by the global reduce block), focus trap, Escape + backdrop dismiss,
   body scroll lock. Upgrade → POST /api/checkout → redirect to Stripe hosted
   Checkout; the 503 dormant response is shown inline as a notice. */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import CodeEntry from '@/components/CodeEntry';
import { TRIAL_DAYS } from '@/lib/trial';
import type { IconName } from '@/components/icon-names';

const BENEFITS: { icon: IconName; text: string }[] = [
  { icon: 'all_inclusive', text: 'Unlimited invoices & quotes' },
  { icon: 'mic', text: 'Voice-to-invoice, hands free' },
  { icon: 'notifications', text: 'Reminders when invoices go unpaid' },
];

// Which cap was hit. 'invoice' is the original copy, unchanged; 'expense'
// (enforce_free_expense_limit) swaps the headline, sub-line and lead benefit.
export type PaywallVariant = 'invoice' | 'expense';

const COPY: Record<PaywallVariant, { headline: string; sub: string; benefits: { icon: IconName; text: string }[] }> = {
  invoice: {
    headline: 'That’s your 3 free invoices',
    sub: 'Keep them coming. Go unlimited and never stop mid-job.',
    benefits: BENEFITS,
  },
  expense: {
    headline: 'That’s your 5 free receipts',
    sub: 'Keep every receipt in one place. Go unlimited and log as you go.',
    benefits: [
      { icon: 'receipt_long', text: 'Unlimited expenses & receipt scans' },
      ...BENEFITS,
    ],
  },
};

export default function PaywallModal({ onClose, variant = 'invoice' }: { onClose: () => void; variant?: PaywallVariant }) {
  const copy = COPY[variant];
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showCode, setShowCode] = useState(false);
  // One trial per customer (lib/trial.ts): the disclosure above the button must
  // match what /api/checkout will do, so the button waits until this is known.
  // An unreachable check falls back to the no-trial copy (never promise a
  // trial that might not come).
  const [trialEligible, setTrialEligible] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/access')
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => { if (active) setTrialEligible(a?.trialEligible === true); })
      .catch(() => { if (active) setTrialEligible(false); });
    return () => { active = false; };
  }, []);

  // Body scroll lock while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Focus trap + Escape dismiss
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const focusables = () =>
      Array.from(card.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])'));
    focusables()[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function upgrade() {
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch('/api/checkout', { method: 'POST' });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url; // Stripe hosted Checkout
        return;
      }
      // Dormant (503) or any non-url response → show the server's message inline.
      setNotice(data?.message ?? 'Payments aren’t live yet — hang tight.');
    } catch {
      setNotice('Payments aren’t live yet — hang tight.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-on-background/45 p-5"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-headline"
        className="w-full max-w-sm rounded-card bg-background p-6 shadow-card-raised"
        style={{ animation: 'paywall-in 200ms ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary-container text-on-background">
          <Icon name="lock_open" size={30} />
        </div>

        <h2 id="paywall-headline" className="mt-4 text-center font-display text-headline-mobile text-on-background">
          {copy.headline}
        </h2>
        <p className="mt-2 text-center text-body-md text-on-surface-variant">
          {copy.sub}
        </p>

        <div className="mt-5 space-y-3 rounded-input bg-surface-container-low p-4">
          {copy.benefits.map((b) => (
            <div key={b.icon} className="flex items-center gap-3">
              <Icon name={b.icon} size={22} className="shrink-0 text-primary" />
              <span className="text-body-md text-on-background">{b.text}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-baseline justify-center gap-1.5">
          <span className="font-display text-numeric-xl tracking-tight text-on-background">$9.99</span>
          <span className="text-body-md text-on-surface-variant">
            {trialEligible ? `/month · ${TRIAL_DAYS}-day free trial · cancel anytime` : '/month · cancel anytime'}
          </span>
        </div>

        {notice && (
          <p className="mt-3 rounded-input bg-surface-container p-3 text-center text-sm text-on-surface-variant">
            {notice}
          </p>
        )}

        {/* Subscription disclosure — plain, body-size, visible before the Stripe
            redirect. Material terms match /api/checkout: a TRIAL_DAYS trial for
            first-time customers only (lib/trial.ts), otherwise billed today. */}
        <p className="mt-4 text-center text-body-md text-on-surface-variant">
          {trialEligible === null
            ? 'Checking your plan…'
            : trialEligible
              ? `${TRIAL_DAYS}-day free trial, then $9.99/month, recurring. Cancel anytime.`
              : '$9.99/month, recurring. Cancel anytime.'}
        </p>

        <button className="btn-primary mt-3 w-full" disabled={busy || trialEligible === null} onClick={upgrade}>
          {busy ? 'One sec…' : trialEligible ? `Start your ${TRIAL_DAYS}-day free trial` : 'Subscribe — $9.99/month'}
        </button>
        <p className="mt-2 text-center text-body-md text-on-surface-variant">
          <a href="/terms" className="underline">Terms</a>
          {' · '}
          <a href="/privacy" className="underline">Privacy</a>
        </p>
        <button
          className="mt-1 min-h-touch w-full text-center text-sm text-on-surface-variant underline"
          onClick={onClose}
        >
          Not now
        </button>
        {showCode ? (
          <div className="mt-2">
            {/* Redeemed → founder access is on; close so they can retry what was blocked. */}
            <CodeEntry onRedeemed={() => { setTimeout(onClose, 1200); }} />
          </div>
        ) : (
          <button
            className="min-h-touch w-full text-center text-sm text-on-surface-variant underline"
            onClick={() => setShowCode(true)}
          >
            Have a code?
          </button>
        )}
      </div>
    </div>
  );
}
