'use client';
/* ═══ Paywall modal ═══
   Shown when a free-tier user hits the 2-invoice cap. Tokens from
   ON-IT-DESIGN-STANDARD.md. Plain-built: fade+scale entrance (reduced-motion
   killed by the global reduce block), focus trap, Escape + backdrop dismiss,
   body scroll lock. Upgrade → POST /api/checkout → redirect to Stripe hosted
   Checkout; the 503 dormant response is shown inline as a notice. */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';

const BENEFITS: { icon: string; text: string }[] = [
  { icon: 'all_inclusive', text: 'Unlimited invoices & quotes' },
  { icon: 'mic', text: 'Voice-to-invoice, hands free' },
  { icon: 'notifications', text: 'Reminders when invoices go unpaid' },
];

export default function PaywallModal({ onClose }: { onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

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
          You&apos;re on a roll — that&apos;s 2 invoices sent
        </h2>
        <p className="mt-2 text-center text-body-md text-on-surface-variant">
          Keep them coming. Go unlimited and never stop mid-job.
        </p>

        <div className="mt-5 space-y-3 rounded-input bg-surface-container-low p-4">
          {BENEFITS.map((b) => (
            <div key={b.icon} className="flex items-center gap-3">
              <Icon name={b.icon} size={22} className="shrink-0 text-primary" />
              <span className="text-body-md text-on-background">{b.text}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-baseline justify-center gap-1.5">
          <span className="font-display text-numeric-xl tracking-tight text-on-background">$9.99</span>
          <span className="text-body-md text-on-surface-variant">/month · first month free · cancel anytime</span>
        </div>

        {notice && (
          <p className="mt-3 rounded-input bg-surface-container p-3 text-center text-sm text-on-surface-variant">
            {notice}
          </p>
        )}

        <button className="btn-primary mt-4 w-full" disabled={busy} onClick={upgrade}>
          {busy ? 'One sec…' : 'Start your free month'}
        </button>
        <button
          className="mt-1 min-h-touch w-full text-center text-sm text-on-surface-variant underline"
          onClick={onClose}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
