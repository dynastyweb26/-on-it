'use client';
/* ═══ Paywall sheet ═══
   Shown when a free/canceled user hits the 3-invoice or 5-expense cap, or taps
   an Income/Expense PDF export (variant). Built to the "On It Paywall" design:
   a bottom sheet with a grab handle, the app icon, a benefit list, a dated
   trial timeline, one gold CTA, a readable disclosure under it, and a quiet
   footer ("Not now" · "Have a code?", Terms · Privacy). No close X, no big
   price, no urgency. The sheet scrolls on short screens (iPhone SE / mini) so
   the CTA is always reachable. Focus trap, Escape + backdrop dismiss, body
   scroll lock. CTA → POST /api/checkout → Stripe hosted Checkout; the 503
   dormant response is shown inline. */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import CodeEntry from '@/components/CodeEntry';
import { trialDates } from '@/lib/trial';
import type { IconName } from '@/components/icon-names';

// Row 4 ("Weekly and monthly recaps") appears only once recaps ship: flip this
// when feat/recap is on main.
const RECAPS_LIVE = false;

const REPORTS_ICON: IconName = 'summarize';
const RECAPS_ICON: IconName = 'insights';

const BENEFITS: { icon: IconName; text: string }[] = [
  { icon: 'all_inclusive', text: 'Unlimited invoices' },
  { icon: 'receipt_long', text: 'Unlimited receipt scans and expenses' },
  { icon: REPORTS_ICON, text: 'Income and expense reports (PDF)' },
  ...(RECAPS_LIVE ? [{ icon: RECAPS_ICON, text: 'Weekly and monthly recaps' }] : []),
];

// Which wall: 'invoice' = the 4th invoice at Send, 'expense' = the 6th expense
// before the camera/upload, 'reports' = an Income/Expense PDF export.
export type PaywallVariant = 'invoice' | 'expense' | 'reports';

const TRIAL_LINE = 'Try On It free for 14 days.';
const COPY: Record<PaywallVariant, { headline: string; lead: string }> = {
  invoice: { headline: 'That’s your 3 free invoices', lead: 'Keep invoicing and getting paid.' },
  expense: { headline: 'That’s your 5 free receipts', lead: 'Keep every receipt tracked and ready when you need it.' },
  reports: { headline: 'Reports are part of On It', lead: 'Download your income and expense reports.' },
};

// Where Stripe Checkout returns to (POST /api/checkout's whitelist): the screen
// that showed the wall, so a blocked invoice card or expense is right there.
export type CheckoutReturn = 'chat' | 'summary' | 'books' | 'invoices' | 'settings';

const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const long = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function PaywallModal({ onClose, variant = 'invoice', returnTo }: {
  onClose: () => void;
  variant?: PaywallVariant;
  returnTo?: CheckoutReturn;
}) {
  const back: CheckoutReturn = returnTo ?? (variant === 'reports' ? 'summary' : 'chat');
  const copy = COPY[variant];
  const sheetRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showCode, setShowCode] = useState(false);
  // One trial per customer (lib/trial.ts): what the sheet promises must match
  // what /api/checkout will do, so the timeline and the CTA wait until this is
  // known. An unreachable check falls back to the returning-customer copy
  // (never promise a trial that might not come).
  const [trialEligible, setTrialEligible] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/access')
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => { if (active) setTrialEligible(a?.trialEligible === true); })
      .catch(() => { if (active) setTrialEligible(false); });
    return () => { active = false; };
  }, []);

  // Trial dates in the viewer's timezone: today + TRIAL_DAYS, and the reminder
  // on the day the trial-reminder cron's window opens (end − 3 days).
  const [{ end, remind }] = useState(() => trialDates());
  const returning = trialEligible === false;

  // Body scroll lock while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Focus trap + Escape dismiss. Focus lands on the sheet itself, not the CTA,
  // so nothing shows a focus ring until the user actually tabs.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const focusables = () =>
      Array.from(sheet.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'));
    sheet.focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function upgrade() {
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnTo: back }),
      });
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

  const timeline = [
    { date: 'Today', text: 'Full access, nothing charged' },
    { date: short(remind), text: 'We’ll remind you before your trial ends' },
    { date: short(end), text: '$9.99/month starts. Cancel anytime before and pay nothing' },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      style={{ background: 'rgba(28,26,23,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', animation: 'paywall-dim-in 350ms ease' }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-headline"
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-24px)] w-full max-w-md flex-col overflow-y-auto overscroll-contain rounded-t-[28px] bg-background px-6 pt-2 outline-none"
        style={{
          paddingBottom: 'calc(34px + env(safe-area-inset-bottom))',
          boxShadow: '0 -8px 30px rgba(28,26,23,.18)',
          animation: 'paywall-sheet-in 420ms cubic-bezier(.32,.72,0,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle (visual only — "Not now", the backdrop and Escape dismiss) */}
        <div aria-hidden className="h-[5px] w-9 shrink-0 self-center rounded-[3px]" style={{ background: 'rgba(28,26,23,.2)' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/apple-icon-180.png"
          alt="On It"
          width={44}
          height={44}
          className="mt-5 h-11 w-11 shrink-0 self-center rounded-[11px] object-cover"
          style={{ boxShadow: '0 2px 6px rgba(115,92,0,.25)' }}
        />

        <h2
          id="paywall-headline"
          className="mt-4 text-center font-display text-[26px] font-extrabold leading-[31px] tracking-[-0.4px] text-on-background [text-wrap:balance]"
        >
          {returning ? 'Pick up where you left off' : copy.headline}
        </h2>
        <p className="mt-2 text-center font-body text-base leading-[22px] text-on-surface-variant [text-wrap:balance]">
          {returning ? copy.lead : `${copy.lead} ${TRIAL_LINE}`}
        </p>

        <ul className="mt-6 flex flex-col gap-3">
          {BENEFITS.map((b) => (
            <li key={b.text} className="flex items-center gap-3">
              <Icon name={b.icon} size={24} className="shrink-0 text-primary" />
              <span className="font-body text-base font-medium leading-6 text-on-background">{b.text}</span>
            </li>
          ))}
        </ul>

        {/* Trial timeline — first-time customers only (a returning customer is
            billed today, so there is nothing to lay out). */}
        {trialEligible === true && (
          <ol
            className="mt-6 flex flex-col rounded-card bg-surface-container-lowest p-4"
            style={{ border: '1px solid rgba(115,92,0,.14)' }}
            aria-label="How your free trial works"
          >
            {timeline.map((row, i) => {
              const last = i === timeline.length - 1;
              return (
                <li key={row.date + i} className="flex gap-3.5">
                  <div aria-hidden className="flex w-4 shrink-0 flex-col items-center">
                    <div
                      className={`mt-0.5 h-4 w-4 shrink-0 rounded-full ${i === 0 ? 'bg-primary-container' : 'border-2 border-primary-container bg-surface-container-lowest'}`}
                    />
                    {!last && <div className="mt-1 w-0.5 flex-1 bg-primary-container opacity-50" />}
                  </div>
                  <div className={last ? '' : 'pb-3.5'}>
                    <div className="font-display text-[15px] font-bold leading-5 text-on-background">{row.date}</div>
                    <div className="font-body text-sm leading-5 text-on-surface-variant">{row.text}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {notice && (
          <p className="mt-4 rounded-input bg-surface-container p-3 text-center text-sm text-on-surface-variant">
            {notice}
          </p>
        )}

        <button
          className="mt-6 h-14 w-full shrink-0 rounded-full bg-primary-container font-display text-[17px] font-bold text-on-background outline-none transition-transform active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-on-background focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ boxShadow: '0 6px 16px rgba(115,92,0,.22)' }}
          disabled={busy || trialEligible === null}
          onClick={upgrade}
        >
          {busy ? 'One sec…' : returning ? 'Subscribe — $9.99/month' : 'Start free trial'}
        </button>

        {/* Subscription disclosure — readable (not fine print), visible before
            the Stripe redirect. Material terms match /api/checkout: a trial for
            first-time customers only (lib/trial.ts), otherwise billed today.
            Same wording as Settings → Subscription. */}
        <p className="mt-3 text-center font-body text-sm leading-5 [text-wrap:balance]" style={{ color: 'rgba(28,26,23,.8)' }}>
          {trialEligible === null
            ? 'Checking your plan…'
            : returning
              ? '$9.99/month, renews monthly until you cancel. Cancel anytime in Settings.'
              : `Free until ${long(end)}. Then $9.99/month, renews monthly until you cancel. Cancel anytime in Settings.`}
        </p>

        <div className="mt-1 flex items-start justify-center gap-1">
          <button
            className="h-11 min-w-[44px] shrink-0 rounded-full px-3 font-body text-[15px] font-semibold text-on-background underline underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onClose}
          >
            Not now
          </button>
          <span aria-hidden className="leading-[44px] text-sm text-on-surface-variant">·</span>
          {showCode ? (
            <div className="ml-2 min-w-0 flex-1">
              {/* Redeemed → founder access is on; close so they can retry what was blocked. */}
              <CodeEntry
                autoFocus
                onEscape={() => setShowCode(false)}
                onRedeemed={() => { setTimeout(onClose, 1200); }}
              />
            </div>
          ) : (
            <button
              className="h-11 rounded-full px-3 font-body text-sm text-on-surface-variant underline underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => setShowCode(true)}
            >
              Have a code?
            </button>
          )}
        </div>

        <p className="mt-1 flex justify-center gap-1.5 font-body text-[13px] leading-[18px] text-on-surface-variant">
          <a href="/terms" className="underline underline-offset-2">Terms</a>
          <span aria-hidden>·</span>
          <a href="/privacy" className="underline underline-offset-2">Privacy</a>
        </p>
      </div>
    </div>
  );
}
