'use client';
/* ═══ Paywall ═══
   Three steps, one screen. Shown when a free/canceled user hits the 3-invoice,
   3-estimate or 5-expense cap, tries to create a recurring expense, taps an
   Income/Expense PDF export, or is nudged back after canceling (variant):

     1 What you win — four demo slides (4.2s each, reel dots)
     2 Try On It free for 14 days — the trial timeline (first-time customers)
     3 What’s included — the code row, the plan, Free vs On It, and the one gold CTA

   The trial step is not a decoration: it appears only when the access check
   says this customer has a trial (lib/trial through /api/access), and never on
   the winback wall. A returning or canceled customer goes showcase → plan, is
   told the plan starts today, and gets the paying-now CTA (lib/paywall-copy).
   While the check is in flight nothing promises a trial and the CTA waits.

   The purchase action is ONE function (lib/subscription/start): no step names
   Stripe, or talks to checkout, so Apple IAP can replace it later.

   The code row redeems real access codes (access_grants + /api/redeem), and is
   collapsed until asked for. While the keyboard is open the page pins to the
   visible area and the footer steps aside (lib/keyboard.ts), so the field sits
   right above the keyboard.

   Focus trap, Escape dismiss, body scroll lock, safe-area padding. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import { subscribeAccess } from '@/lib/upgrade-return';
import ShowcaseStep from '@/components/paywall/ShowcaseStep';
import TrialStep from '@/components/paywall/TrialStep';
import PlanStep from '@/components/paywall/PlanStep';
import FitToHeight from '@/components/paywall/FitToHeight';
import { startSubscription, type CheckoutReturn } from '@/lib/subscription/start';
import { trialDates } from '@/lib/trial';
import {
  REASON,
  ctaLabel,
  disclosure,
  paywallState,
  stepsFor,
  type PaywallVariant,
} from '@/lib/paywall-copy';

// The props' public types stay on this module: every mount point imports them
// from here, whichever module owns the rule.
export type { PaywallVariant } from '@/lib/paywall-copy';
export type { CheckoutReturn } from '@/lib/subscription/start';

// Where each wall's Checkout returns by default when the caller doesn't say.
const DEFAULT_RETURN: Record<PaywallVariant, CheckoutReturn> = {
  invoice: 'chat',
  expense: 'chat',
  estimate: 'chat',
  recurring: 'recurring',
  reports: 'summary',
  winback: 'chat',
};

export default function PaywallModal({ onClose, variant = 'invoice', returnTo, reason }: {
  onClose: () => void;
  variant?: PaywallVariant;
  returnTo?: CheckoutReturn;
  /** Replaces the variant's reason pill (the soft prompts open a wall nobody hit a limit on). */
  reason?: string;
}) {
  const back: CheckoutReturn = returnTo ?? DEFAULT_RETURN[variant];
  const pageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const codeCardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showCode, setShowCode] = useState(false);
  // One trial per customer (lib/trial): what the page promises must match what
  // /api/checkout will do, so the trial step and the trial copy wait until this
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

  // The tier turned paid while the wall is up (a redeemed code, a checkout
  // that finished in another tab): the wall has nothing left to say.
  useEffect(() => subscribeAccess(() => onClose()), [onClose]);

  const state = paywallState(trialEligible);
  // Fixed for the visit, like the timeline's: the disclosure names the same end date.
  const [freeUntil] = useState(() => trialDates().end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
  const steps = stepsFor(variant, state);
  const [step, setStep] = useState(0);
  // A step can disappear when the check answers (trial → plan): clamp, never
  // render a step that isn't in this wall's list.
  const idx = Math.min(step, steps.length - 1);
  const current = steps[idx];

  // New step: top of the page, focus on its heading (screen readers read the
  // step, not the footer the user just left).
  const firstPaint = useRef(true);
  useEffect(() => {
    if (firstPaint.current) { firstPaint.current = false; return; }
    document.getElementById('paywall-step-title')?.focus({ preventScroll: true });
    scrollRef.current?.scrollTo({ top: 0 });
  }, [current]);

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

  // The ONLY purchase action on the wall: hand over to startSubscription().
  async function buy() {
    if (busy || state === 'checking') return;
    setBusy(true);
    setNotice('');
    const outcome = await startSubscription(back);
    if (!outcome.started) {
      setNotice(outcome.message);
      setBusy(false);
    }
    // started: the browser is on its way to the payment sheet; stay busy.
  }

  const footerButton = 'flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-primary-container font-display text-base font-bold text-on-background outline-none transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-on-background focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const footerShadow = { boxShadow: '0 8px 20px rgba(212,175,55,.32)' };

  // Portaled to <body>: a `fixed inset-0` layer inside the app shell is
  // positioned against whichever ancestor makes a containing block (a
  // transform, a filter), so it covered only the area under the app header and
  // left the header (and its tour button) showing and tappable above the wall.
  // Mounted only after a tap, never during SSR, so document exists here.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={pageRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-step-title"
      tabIndex={-1}
      data-kb-fit=""
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[70] flex justify-center bg-background font-body text-on-background outline-none md:items-center md:bg-on-background/45 md:p-6"
      style={{ animation: 'paywall-sheet-in 420ms cubic-bezier(.32,.72,0,1)' }}
    >
      {/* Phone: the column is the whole screen. Tablet and up (md): a centered
          card on a dimmed backdrop, capped in height, so the wall isn't a phone
          layout floating in a wide empty page. */}
      <div
        className="flex h-full w-full max-w-md flex-col md:h-[min(100%,860px)] md:overflow-hidden md:rounded-[28px] md:bg-background md:shadow-[0_24px_64px_rgba(31,27,19,.35)]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Header: dismiss, the app icon, and where you are in the steps. The
            way out is always the X at the left; going back a step is the
            footer's Back link. */}
        <div className="flex shrink-0 flex-col items-center gap-2.5 px-3 pb-2.5 pt-3.5">
          <div className="grid w-full grid-cols-[44px_1fr_44px] items-center">
            <button
              type="button"
              aria-label="Not now"
              onClick={onClose}
              className="grid h-11 w-11 place-items-center rounded-full outline-none transition-colors hover:bg-[#f4ead9] focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon name="close" size={24} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/apple-icon-180.png"
              alt="On It"
              width={44}
              height={44}
              className="block h-11 w-11 justify-self-center rounded-xl object-cover shadow-[0_4px_12px_rgba(212,175,55,.32)]"
            />
            <div />
          </div>
          <div className="flex items-center gap-1.5" role="img" aria-label={`Step ${idx + 1} of ${steps.length}`}>
            {steps.map((id, i) => (
              <span
                key={id}
                aria-hidden
                className={`h-1.5 rounded-full ${i === idx ? 'w-5 bg-on-background' : i < idx ? 'w-1.5 bg-primary-container' : 'w-1.5 bg-[#e3d6bf]'}`}
              />
            ))}
          </div>
        </div>

        {/* The step. Showcase and trial are single full-screen pages: they scale
            to fit the visible height and never scroll (FitToHeight). The plan
            step keeps its own scroller (the code row, Free vs On It). */}
        {current === 'plan' ? (
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <PlanStep
              state={state}
              showCode={showCode}
              onToggleCode={toggleCode}
              onEscapeCode={() => setShowCode(false)}
              onRedeemed={() => { setTimeout(onClose, 1200); }}
              codeCardRef={codeCardRef}
            />
          </div>
        ) : (
          <FitToHeight key={current}>
            {current === 'showcase' ? <ShowcaseStep reason={reason ?? REASON[variant]} /> : <TrialStep />}
          </FitToHeight>
        )}

        {/* Pinned footer: Continue until the plan step, then the one gold CTA
            with its disclosure. Steps aside while the code field is typing. */}
        <div
          data-kb-hide=""
          className="flex shrink-0 flex-col items-center gap-2.5 border-t border-[#f0e7d8] bg-background px-5 pt-3.5"
          style={{ paddingBottom: 'calc(22px + env(safe-area-inset-bottom))' }}
        >
          {notice && (
            <p className="w-full rounded-input bg-surface-container p-3 text-center text-sm text-on-surface-variant">{notice}</p>
          )}

          {current === 'plan' ? (
            <>
              <button
                type="button"
                className={footerButton}
                style={footerShadow}
                disabled={busy || state === 'checking'}
                onClick={buy}
              >
                {busy ? 'One sec…' : (
                  <>
                    <span>{ctaLabel(state)}</span>
                    <Icon name="arrow_forward" size={20} />
                  </>
                )}
              </button>

              {state === 'trial' && (
                <p className="flex items-center gap-1.5 whitespace-nowrap font-display text-[11px] font-bold uppercase leading-none tracking-[.14em] text-on-background">
                  <Icon name="verified" size={16} className="shrink-0 text-primary" />
                  Nothing charged today
                </p>
              )}

              {/* Subscription disclosure — readable (not fine print), visible
                  before the payment sheet. Material terms follow the state:
                  first-time customers are told when the free period ends,
                  everyone else that the plan starts today (lib/paywall-copy). */}
              <p className="max-w-[320px] text-center text-[12.5px] leading-[1.45] text-[#4d4635] [text-wrap:pretty]">
                {disclosure(state, freeUntil)}
              </p>

              <p className="flex items-center gap-2 text-[12.5px] font-medium leading-none text-[#4d4635]">
                <a href="/terms" className="text-on-background underline underline-offset-[3px]">Terms</a>
                <span aria-hidden>·</span>
                <a href="/privacy" className="text-on-background underline underline-offset-[3px]">Privacy</a>
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                className={footerButton}
                style={footerShadow}
                onClick={() => setStep(idx + 1)}
              >
                <span>Continue</span>
              </button>
              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(idx - 1)}
                  className="min-h-8 px-4 text-sm font-semibold leading-none text-[#4d4635] outline-none hover:text-on-background focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Back
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
