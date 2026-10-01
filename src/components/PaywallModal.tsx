'use client';
/* ═══ Paywall ═══
   Shown when a free/canceled user hits the 3-invoice or 5-expense cap, or taps
   an Income/Expense PDF export (variant). Built to the "On It Paywall" design
   (frame 1f): a full-screen cream page with a close X (top-left, "Not now"),
   the app icon, a feature slideshow in the upper half, then cards — trial
   reminder, "Have a code?" (expands into CodeEntry), the selected plan row —
   and a pinned footer with one gold CTA, "Nothing charged today" and a
   readable disclosure. No big price, no urgency.
   Short screens (iPhone SE): the slideshow scales down to fit, the cards
   scroll, and the footer (CTA + disclosure) stays pinned, so the CTA is always
   reachable. Focus trap, Escape dismiss, body scroll lock.
   CTA → POST /api/checkout → Stripe hosted Checkout; the 503 dormant response
   is shown inline. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import CodeEntry from '@/components/CodeEntry';
import PaywallSlideshow from '@/components/paywall/PaywallSlideshow';
import { SLIDE_H, SLIDE_W, type SlideId } from '@/components/paywall/PaywallSlides';
import { trialDates } from '@/lib/trial';

// Slide 5 ("Your week at a glance") appears only once recaps ship: flip this
// when feat/recap is on main.
const RECAPS_LIVE = false;

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
  expense: 'You’ve used your 5 free receipts',
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
const DOTS_H = 29; // the page-dot row under the slideshow (7px dots + padding)
const MIN_SCALE = 0.48;

export default function PaywallModal({ onClose, variant = 'invoice', returnTo }: {
  onClose: () => void;
  variant?: PaywallVariant;
  returnTo?: CheckoutReturn;
}) {
  const back: CheckoutReturn = returnTo ?? (variant === 'reports' ? 'summary' : 'chat');
  const pageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
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

  // Slideshow size: the design's 393×300 canvas, scaled down so the cards fit
  // under it on short screens (SE ≈ 0.62). Measured with the code row
  // collapsed; opening it scrolls the page instead of shrinking the slides.
  const [scale, setScale] = useState(1);
  const cardsH = useRef(0);
  const fit = useCallback(() => {
    const sc = scrollRef.current;
    const cards = cardsRef.current;
    if (!sc || !cards) return;
    if (!showCode) cardsH.current = cards.offsetHeight;
    const reasonH = reasonRef.current?.offsetHeight ?? 0;
    const avail = sc.clientHeight - reasonH - cardsH.current - DOTS_H - 16;
    const byH = Math.min(1, Math.max(MIN_SCALE, avail / SLIDE_H));
    const byW = Math.min(1, sc.clientWidth / SLIDE_W);
    setScale(Math.min(byH, byW));
  }, [showCode]);
  useLayoutEffect(() => { fit(); }, [fit, trialEligible]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

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
        // Bring the field into view above the pinned footer.
        setTimeout(() => {
          const sc = scrollRef.current;
          sc?.scrollTo({ top: sc.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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

        {/* Scrolling middle: slideshow + cards. */}
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
          <PaywallSlideshow slides={SLIDES} start={START_SLIDE[variant]} scale={scale} />

          <div ref={cardsRef} className="flex flex-col gap-2 px-4">
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

            <div className={`${CARD} overflow-hidden`}>
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
                  <div className="mt-0.5 text-[13px] leading-[18px] text-on-surface-variant">Founder and partner codes</div>
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
        </div>

        {/* Pinned footer: the CTA is always reachable. */}
        <div
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
