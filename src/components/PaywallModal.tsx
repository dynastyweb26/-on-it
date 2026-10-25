'use client';
/* ═══ Paywall ═══
   Three steps, one screen. Shown when a free/canceled user hits the 3-invoice,
   3-estimate or 5-expense cap, tries to create a recurring expense, taps an
   Income/Expense PDF export, or is nudged back after canceling (variant):

     1 What you win — four demo slides (4.2s each, dots, pause on touch)
     2 Try On It free for 14 days — the trial timeline (first-time customers)
     3 Plan — Free vs On It, the code row, and the one gold CTA in the footer

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
import Icon from '@/components/Icon';
import { subscribeAccess } from '@/lib/upgrade-return';
import ShowcaseStep from '@/components/paywall/ShowcaseStep';
import TrialStep from '@/components/paywall/TrialStep';
import PlanStep from '@/components/paywall/PlanStep';
import type { SlideId } from '@/components/paywall/PaywallSlides';
import { startSubscription, type CheckoutReturn } from '@/lib/subscription/start';
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

// The slide each wall opens on — the feature the user just ran into, mapped
// onto the four-slide showcase (expense/recurring have no demo of their own,
// so they open on the invoice story).
const START_SLIDE: Record<PaywallVariant, SlideId> = {
  invoice: 'invoice',
  expense: 'invoice',
  estimate: 'estimate',
  recurring: 'invoice',
  reports: 'recap',
  winback: 'invoice',
};

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

  const footerButton = 'flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-primary-container font-display text-[17px] font-bold text-on-background outline-none transition-transform active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-on-background focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const footerShadow = { boxShadow: '0 8px 20px rgba(212,175,55,.32)' };

  return (
    <div
      ref={pageRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-step-title"
      tabIndex={-1}
      data-kb-fit=""
      className="fixed inset-0 z-[70] flex justify-center bg-background font-body text-on-background outline-none"
      style={{ animation: 'paywall-sheet-in 420ms cubic-bezier(.32,.72,0,1)' }}
    >
      <div className="flex h-full w-full max-w-md flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Top bar: back once there is a step behind you (the first step's
            control is "Not now"), the app icon, and a dismiss X from step 2 on. */}
        <div className="relative flex h-11 shrink-0 items-center px-1.5">
          <button
            type="button"
            aria-label={idx === 0 ? 'Not now' : 'Back'}
            onClick={idx === 0 ? onClose : () => setStep(idx - 1)}
            className="grid h-11 w-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[rgba(31,27,19,.08)] transition-colors active:bg-[rgba(31,27,19,.14)]">
              <Icon name={idx === 0 ? 'close' : 'arrow_back'} size={22} />
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
          {idx > 0 && (
            <button
              type="button"
              aria-label="Not now"
              onClick={onClose}
              className="ml-auto grid h-11 w-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[rgba(31,27,19,.08)] transition-colors active:bg-[rgba(31,27,19,.14)]">
                <Icon name="close" size={22} />
              </span>
            </button>
          )}
        </div>

        {/* The step. Step 1 fills the height (the deck is measured from it);
            steps 2–3 scroll if they need to. */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {current === 'showcase' && (
            <div className="h-full">
              <ShowcaseStep reason={reason ?? REASON[variant]} start={START_SLIDE[variant]} />
            </div>
          )}
          {current === 'trial' && <TrialStep />}
          {current === 'plan' && (
            <PlanStep
              showCode={showCode}
              onToggleCode={toggleCode}
              onEscapeCode={() => setShowCode(false)}
              onRedeemed={() => { setTimeout(onClose, 1200); }}
              codeCardRef={codeCardRef}
            />
          )}
        </div>

        {/* Pinned footer: Continue until the plan step, then the one gold CTA
            with its disclosure. Steps aside while the code field is typing. */}
        <div
          data-kb-hide=""
          className="relative flex shrink-0 flex-col items-center gap-2.5 bg-background px-5 pt-2.5"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-[22px] h-[22px] bg-gradient-to-b from-[rgba(255,248,240,0)] to-background" />

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
                    <Icon name="arrow_forward" size={22} />
                  </>
                )}
              </button>

              {/* Subscription disclosure — readable (not fine print), visible
                  before the payment sheet. Material terms follow the state:
                  first-time customers see nothing charged today, everyone else
                  is told the plan starts today (lib/paywall-copy). */}
              <p className="text-center text-[13.5px] leading-[1.45] text-on-surface-variant [text-wrap:pretty]">
                {disclosure(state)}
              </p>

              <p className="flex items-center gap-2.5 text-[13px] font-semibold">
                <a href="/terms" className="text-primary underline underline-offset-2">Terms</a>
                <span aria-hidden className="text-on-surface-variant">·</span>
                <a href="/privacy" className="text-primary underline underline-offset-2">Privacy</a>
              </p>
            </>
          ) : (
            <button
              type="button"
              className={footerButton}
              style={footerShadow}
              onClick={() => setStep(idx + 1)}
            >
              <span>Continue</span>
              <Icon name="arrow_forward" size={22} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
