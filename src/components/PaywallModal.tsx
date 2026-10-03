'use client';
/* ═══ Paywall ═══
   Shown when a free/canceled user hits the 3-invoice or 5-expense cap, or taps
   an Income/Expense PDF export (variant). A full-screen cream page with a
   close X (top-left, "Not now") and the app icon, then ONE scrolling column:
     context pill + slideshow (the hero, ~57% of the screen height)
     → Trial reminder → Have a code? (expands into CodeEntry) → 14-day trial
     row → "What's included" (Free vs On It)
   and a pinned footer: one gold CTA, "Nothing charged today", the full
   disclosure right under it, Terms · Privacy. No big price, no urgency.
   Returning customers (no trial left) get the same page without the trial
   reminder / trial rows. While the keyboard is open (the code field) the page
   pins to the visible area and the footer steps aside (lib/keyboard.ts), so
   the field sits right above the keyboard.
   Focus trap, Escape dismiss, body scroll lock.
   CTA → POST /api/checkout → Stripe hosted Checkout; the 503 dormant response
   is shown inline. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Icon from '@/components/Icon';
import CodeEntry from '@/components/CodeEntry';
import PaywallSlideshow from '@/components/paywall/PaywallSlideshow';
import type { SlideId } from '@/components/paywall/PaywallSlides';
import { trialDates } from '@/lib/trial';
import { RECAPS_LIVE } from '@/lib/recaps-live';

// Slide 5 ("Your week at a glance") and the recaps row in "What's included"
// appear only once recaps launch: the one shared flag (lib/recaps-live).
const SLIDES: SlideId[] = ['invoice', 'paid', 'expense', 'reports', ...(RECAPS_LIVE ? ['recap' as const] : [])];

// Which wall: 'invoice' = the 4th invoice at Send, 'expense' = the 6th expense
// before the camera/upload, 'reports' = an Income/Expense PDF export.
export type PaywallVariant = 'invoice' | 'expense' | 'reports';

// The slide each wall opens on: the feature the user just ran into.
const START_SLIDE: Record<PaywallVariant, SlideId> = {
  invoice: 'invoice',
  expense: 'expense',
  reports: 'reports',
};

// Why the wall opened: a quiet pill above the slides, fixed while they change.
const REASON: Record<PaywallVariant, string> = {
  invoice: 'You’ve used your 3 free invoices',
  expense: 'You’ve used your 5 free expenses',
  reports: 'Reports are part of On It',
};

// Where Stripe Checkout returns to (POST /api/checkout's whitelist): the screen
// that showed the wall, so a blocked invoice card or expense is right there.
export type CheckoutReturn = 'chat' | 'summary' | 'books' | 'invoices' | 'settings';

const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const long = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Card styles from the design: white, hairline warm border, 16px radius.
const CARD = 'rounded-2xl border border-[#efe4d2] bg-surface-container-lowest';
// The selected plan row: same card, dark 1.5px outline.
const PLAN = 'flex h-14 items-center justify-between gap-2.5 rounded-2xl border-[1.5px] border-on-background bg-surface-container-lowest px-4 [@media(max-height:700px)]:h-[50px]';
// Rows tighten on short screens (SE), per the design's SE frames.
const ROW_H = 'min-h-[60px] [@media(max-height:700px)]:min-h-[52px]';
// The slideshow hero: this share of the screen height, never taller than the
// space between the top bar and the footer (minus the pill), so the whole hero
// is in view when the page opens.
const HERO_SHARE = 0.57;
const HERO_MIN = 260;

// "What's included": TRUE rows only — each matches what the code enforces
// (free_invoice_limit() / free_expense_limit(), quotes never capped, PDF
// exports paid-only). `true` = ✓, `false` = —.
type Cell = string | boolean;
const INCLUDED: { label: string; free: Cell; paid: Cell; recapsOnly?: boolean }[] = [
  { label: 'Invoices', free: '3 free', paid: 'Unlimited' },
  { label: 'Expenses & receipt scans', free: '5 free', paid: 'Unlimited' },
  { label: 'Quotes', free: 'Unlimited', paid: 'Unlimited' },
  { label: 'Voice invoicing', free: true, paid: true },
  { label: 'Online pay page', free: true, paid: true },
  { label: 'Income & expense reports (PDF)', free: false, paid: true },
  { label: 'Weekly & monthly recaps', free: false, paid: true, recapsOnly: true },
];

function CellValue({ v }: { v: Cell }): ReactNode {
  if (v === true) return <span role="img" aria-label="Included"><Icon name="check" size={20} className="text-primary" /></span>;
  if (v === false) return <span role="img" aria-label="Not included" className="text-on-surface-variant">—</span>;
  return v;
}

export default function PaywallModal({ onClose, variant = 'invoice', returnTo }: {
  onClose: () => void;
  variant?: PaywallVariant;
  returnTo?: CheckoutReturn;
}) {
  const back: CheckoutReturn = returnTo ?? (variant === 'reports' ? 'summary' : 'chat');
  const pageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const codeCardRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showCode, setShowCode] = useState(false);
  // One trial per customer (lib/trial.ts): what the page promises must match
  // what /api/checkout will do, so the trial rows and the CTA wait until this
  // is known. An unreachable check falls back to the returning-customer copy
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
  const trial = trialEligible === true;
  const returning = trialEligible === false;
  const included = INCLUDED.filter((r) => !r.recapsOnly || RECAPS_LIVE);

  // Hero height, from the page as it opens: measured again on rotation and
  // once the trial rows settle the footer's height, but never while the
  // keyboard is open — typing a code must not reshape the page.
  const [heroH, setHeroH] = useState(0);
  const sizeHero = useCallback(() => {
    const sc = scrollRef.current;
    if (!sc || document.documentElement.hasAttribute('data-kb')) return;
    const room = sc.clientHeight - (reasonRef.current?.offsetHeight ?? 0) - 8;
    setHeroH(Math.round(Math.max(HERO_MIN, Math.min(window.innerHeight * HERO_SHARE, room))));
  }, []);
  useLayoutEffect(() => { sizeHero(); }, [sizeHero, trialEligible]);
  useEffect(() => {
    let w = window.innerWidth;
    const onResize = () => { if (window.innerWidth !== w) { w = window.innerWidth; sizeHero(); } };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sizeHero]);

  // Body scroll lock while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Focus trap + Escape dismiss. Focus lands on the page itself, not the CTA,
  // so nothing shows a focus ring until the user actually tabs.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const focusables = () =>
      Array.from(page.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'));
    page.focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === page)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggleCode() {
    setShowCode((open) => {
      if (!open) {
        // Bring the opened code row fully into view (its own scroller only,
        // instant). Once the keyboard is up, lib/keyboard.ts keeps the field
        // right above it.
        setTimeout(() => {
          const sc = scrollRef.current;
          const row = codeCardRef.current;
          if (!sc || !row) return;
          const over = row.getBoundingClientRect().bottom + 12 - sc.getBoundingClientRect().bottom;
          if (over > 0) sc.scrollTop += over;
        }, 30);
      }
      return !open;
    });
  }

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

  return (
    <div
      ref={pageRef}
      role="dialog"
      aria-modal="true"
      aria-label="Start your On It plan"
      aria-describedby="paywall-reason"
      tabIndex={-1}
      data-kb-fit=""
      className="fixed inset-0 z-[70] flex justify-center bg-background font-body text-on-background outline-none"
      style={{ animation: 'paywall-sheet-in 420ms cubic-bezier(.32,.72,0,1)' }}
    >
      <div className="flex h-full w-full max-w-md flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Top bar: close X (dismisses exactly like "Not now") + the app icon. */}
        <div className="relative flex h-11 shrink-0 items-center px-1.5">
          <button
            type="button"
            aria-label="Not now"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[rgba(31,27,19,.08)] transition-colors active:bg-[rgba(31,27,19,.14)]">
              <Icon name="close" size={22} />
            </span>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/apple-icon-180.png"
            alt="On It"
            width={28}
            height={28}
            className="absolute left-1/2 top-2 h-7 w-7 -translate-x-1/2 rounded-lg object-cover"
          />
        </div>

        {/* The page: hero slideshow, then the cards and "What's included". */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div ref={reasonRef} className="flex justify-center px-4 pb-2">
            <p
              id="paywall-reason"
              className="rounded-full bg-surface-container px-3 py-1 text-[13px] font-semibold leading-[18px] text-on-surface-variant"
            >
              {REASON[variant]}
            </p>
          </div>
          {heroH > 0 && <PaywallSlideshow slides={SLIDES} start={START_SLIDE[variant]} height={heroH} />}

          <div className="flex flex-col gap-2 px-4">
            {trial && (
              <div className={`${CARD} flex ${ROW_H} items-center gap-3 px-3.5 py-2`}>
                <Icon name="check_circle" size={24} className="shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold leading-5">Trial reminder</div>
                  <div className="mt-0.5 text-[13px] leading-[18px] text-on-surface-variant">
                    We’ll email you {short(remind)} before it ends
                  </div>
                </div>
              </div>
            )}

            <div ref={codeCardRef} className={`${CARD} overflow-hidden`}>
              <button
                type="button"
                aria-expanded={showCode}
                aria-controls="paywall-code"
                onClick={toggleCode}
                className={`flex ${ROW_H} w-full items-center gap-3 px-3.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}
              >
                <Icon name="confirmation_number" size={24} className="shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold leading-5">Have a code?</div>
                  <div className="mt-0.5 text-[13px] leading-[18px] text-on-surface-variant">Founder and invite codes</div>
                </div>
                {!showCode && (
                  <span className="shrink-0 text-sm font-semibold text-primary max-[379px]:hidden">Enter code</span>
                )}
                <Icon
                  name="expand_more"
                  size={22}
                  className={`shrink-0 text-primary transition-transform duration-[250ms] ${showCode ? 'rotate-180' : ''}`}
                />
              </button>
              {showCode && (
                <div id="paywall-code" className="px-3.5 pb-3">
                  {/* Redeemed → founder access is on; close so they can retry what was blocked. */}
                  <CodeEntry
                    autoFocus
                    onEscape={() => setShowCode(false)}
                    onRedeemed={() => { setTimeout(onClose, 1200); }}
                  />
                </div>
              )}
            </div>

            {/* The plan row — selected style (dark 1.5px outline). */}
            {trial && (
              <div className={PLAN}>
                <span className="font-display text-[13.5px] font-extrabold tracking-[.06em]">14-DAY FREE TRIAL</span>
                <span className="text-sm text-on-surface-variant">
                  then <b className="font-semibold text-on-background">$9.99</b> / month
                </span>
              </div>
            )}
            {returning && (
              <div className={PLAN}>
                <span className="font-display text-[15px] font-extrabold">Monthly</span>
                <span className="text-sm text-on-surface-variant">
                  <b className="font-semibold text-on-background">$9.99</b> / month
                </span>
              </div>
            )}
          </div>

          {/* What's included: Free vs On It, true rows only (INCLUDED). */}
          <section aria-labelledby="paywall-included" className="mt-6 px-4">
            <h2 id="paywall-included" className="mb-2.5 px-1 font-display text-[19px] font-extrabold tracking-[-0.01em]">
              What’s included
            </h2>
            <table className={`${CARD} w-full border-separate border-spacing-0 overflow-hidden text-[14px] leading-5`}>
              <thead>
                <tr className="text-[12px] font-semibold uppercase tracking-[.08em] text-on-surface-variant">
                  <th scope="col" className="px-3.5 py-2.5 text-left font-semibold"><span className="sr-only">Feature</span></th>
                  <th scope="col" className="w-[84px] px-2 py-2.5 text-center font-semibold">Free</th>
                  <th scope="col" className="w-[96px] bg-primary-container/25 px-2 py-2.5 text-center font-display font-extrabold text-on-background">On It</th>
                </tr>
              </thead>
              <tbody>
                {included.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="border-t border-[#efe4d2] px-3.5 py-3 text-left font-semibold">{r.label}</th>
                    <td className="border-t border-[#efe4d2] px-2 py-3 text-center text-on-surface-variant">
                      <span className="inline-flex justify-center"><CellValue v={r.free} /></span>
                    </td>
                    <td className="border-t border-[#efe4d2] bg-primary-container/25 px-2 py-3 text-center font-semibold">
                      <span className="inline-flex justify-center"><CellValue v={r.paid} /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        {/* Pinned footer: the CTA is always reachable — except while typing a
            code, when it steps aside so the field can sit on the keyboard. */}
        <div
          data-kb-hide=""
          className="relative flex shrink-0 flex-col items-center gap-2.5 bg-background px-5 pt-2.5"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-[22px] h-[22px] bg-gradient-to-b from-[rgba(255,248,240,0)] to-background" />

          {notice && (
            <p className="w-full rounded-input bg-surface-container p-3 text-center text-sm text-on-surface-variant">{notice}</p>
          )}

          <button
            type="button"
            className="flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-primary-container font-display text-[17px] font-bold text-on-background outline-none transition-transform active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-on-background focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            style={{ boxShadow: '0 8px 20px rgba(212,175,55,.32)' }}
            disabled={busy || trialEligible === null}
            onClick={upgrade}
          >
            {busy ? 'One sec…' : (
              <>
                <span>{returning ? 'Subscribe — $9.99/month' : 'Start 14-day free trial'}</span>
                <Icon name="arrow_forward" size={22} />
              </>
            )}
          </button>

          {trial && (
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-[.1em] text-on-surface-variant">
              <Icon name="verified" size={17} filled className="text-primary" />
              NOTHING CHARGED TODAY
            </div>
          )}

          {/* Subscription disclosure — readable (not fine print), visible before
              the Stripe redirect. Material terms match /api/checkout: a trial for
              first-time customers only (lib/trial.ts), otherwise billed today.
              Same wording as Settings → Subscription. */}
          <p className="text-center text-[13.5px] leading-[1.45] text-on-surface-variant [text-wrap:pretty]">
            {trialEligible === null
              ? 'Checking your plan…'
              : returning
                ? '$9.99/month, renews monthly until you cancel. Cancel anytime in Settings.'
                : `Free until ${long(end)}. Then $9.99/month, renews monthly until you cancel. Cancel anytime in Settings.`}
          </p>

          <p className="flex items-center gap-2.5 text-[13px] font-semibold">
            <a href="/terms" className="text-primary underline underline-offset-2">Terms</a>
            <span aria-hidden className="text-on-surface-variant">·</span>
            <a href="/privacy" className="text-primary underline underline-offset-2">Privacy</a>
          </p>
        </div>
      </div>
    </div>
  );
}
