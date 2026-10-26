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
  nothingChargedToday,
  paywallState,
  stepsFor,
  type PaywallVariant,
} from '@/lib/paywall-copy';
import { trialDates } from '@/lib/trial';

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

  // The trial's end date in the viewer's timezone, for the footer disclosure.
  const [{ end }] = useState(() => trialDates());
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

  const footerButton = 'flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-primary-container font-display text-[16px] font-bold text-on-background outline-none transition-transform duration-150 hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-on-background focus-visible:ring-offset-2 focus-visible:ring-offset-background';
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
        {/* Header, to the mockup: dismiss X, the app icon, then the step
            progress — a dark pill for this step, gold for the ones behind it. */}
        <header className="flex shrink-0 flex-col items-center gap-2.5 px-3 pb-2.5 pt-3.5">
          <div className="grid w-full grid-cols-[44px_1fr_44px] items-center">
            <button
              type="button"
              aria-label="Not now"
              onClick={onClose}
              className="grid h-11 w-11 place-items-center rounded-full text-on-background outline-none transition-colors hover:bg-surface-container focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon name="close" size={24} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/apple-icon-180.png"
              alt="On It"
              width={44}
              height={44}
              className="h-11 w-11 justify-self-center rounded-xl object-cover shadow-[0_4px_12px_rgba(212,175,55,.32)]"
            />
            <span aria-hidden />
          </div>
          <div role="group" aria-label="Step progress" className="flex items-center gap-1.5">
            {steps.map((id, i) => (
              <span
                key={id}
                aria-current={i === idx ? 'step' : undefined}
                className={
                  i === idx
                    ? 'h-1.5 w-5 rounded-full bg-on-background'
                    : i < idx
                      ? 'h-1.5 w-1.5 rounded-full bg-primary-container'
                      : 'h-1.5 w-1.5 rounded-full bg-reel'
                }
              />
            ))}
          </div>
        </header>

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
              state={state}
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
          className="flex shrink-0 flex-col items-center gap-2.5 border-t border-hairline bg-background px-5 pt-3.5"
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

              {/* "Nothing charged today" is a badge, and only while a trial is
                  really coming; a returning customer never sees it. */}
              {nothingChargedToday(state) && (
                <div className="flex items-center gap-1.5 whitespace-nowrap font-display text-[11px] font-bold uppercase leading-none tracking-[.14em]">
                  <Icon name="verified" size={16} className="text-primary" />
                  Nothing charged today
                </div>
              )}

              {/* Subscription disclosure — readable (not fine print), visible
                  before the payment sheet. Material terms follow the state:
                  first-time customers see the trial's end date, everyone else
                  is told the plan starts today (lib/paywall-copy). */}
              <p className="max-w-[320px] text-center text-[12.5px] leading-[1.45] text-on-surface-variant [text-wrap:pretty]">
                {disclosure(state, end)}
              </p>

              <p className="flex items-center gap-2 text-[12.5px] font-medium leading-none text-on-surface-variant">
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
                Continue
              </button>
              {/* The mockup's only back control: a quiet text link under
                  Continue, on the trial step. */}
              {current === 'trial' && (
                <button
                  type="button"
                  onClick={() => setStep(idx - 1)}
                  className="min-h-8 px-4 font-body text-sm font-semibold text-on-surface-variant outline-none transition-colors hover:text-on-background focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Back
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
