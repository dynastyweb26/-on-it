'use client';
// Step 3 · What's included — the founder/invite code row, the plan card, then
// Free vs On It side by side, true rows only (each matches what the code
// enforces: free_invoice_limit() / free_estimate_limit() / free_expense_limit(),
// recurring expenses paid-only, PDF exports paid-only). The rows and their caps
// live in lib/paywall-copy (one source, unit-tested); the recaps row rides
// lib/recaps-live. One tier only: there is no second price and no plan picker.
//
// Laptop (>= 1280, design/laptop/paywall.html page 3): two columns — the
// testimonial, the trial-reminder row, the code card and the plan row down the
// left; "What's included" over the table on the right. Below 1280 the markup is
// today's single column, unchanged: the extra row is rendered only when the
// width resolves wide on the client, so the phone DOM has no extra node.
//
// The reminder row is a static info line, not a control: the reminder email is
// a cron (/api/trial-reminders) that goes out TRIAL_REMINDER_DAYS before the
// end, and there is no per-customer setting behind it, so the design's switch
// is not drawn. The line states the date it will arrive — trialDates(), the same
// function the trial step, /api/checkout and the cron work from.
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import Icon from '@/components/Icon';
import CodeEntry from '@/components/CodeEntry';
import { STEP_TITLE, planRows, type PaywallState, type PlanCell } from '@/lib/paywall-copy';
import { RECAPS_LIVE } from '@/lib/recaps-live';
import { trialDates } from '@/lib/trial';

// Cyril's testimonial, word for word from design-reference/paywall-mockup.html.
// It renders on every paywall from step 3, at every width: the customer gave his
// written OK, so there is no launch switch behind it.

const CARD = 'rounded-2xl border border-[#efe4d2] bg-white';
const HEAD = 'px-1.5 py-3 text-center font-display text-[10.5px] leading-none tracking-[.12em]';
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function CellValue({ v, paid }: { v: PlanCell; paid: boolean }): ReactNode {
  if (v === true) {
    return (
      <span role="img" aria-label="Included" className="flex" style={paid ? { fontVariationSettings: "'FILL' 0, 'wght' 600, 'GRAD' 0, 'opsz' 24" } : undefined}>
        <Icon name="check" size={19} className="text-primary" />
      </span>
    );
  }
  if (v === false) return <span role="img" aria-label="Not included" className="text-[#a59a84]">—</span>;
  return <span className={paid ? 'font-bold' : undefined}>{v}</span>;
}

export default function PlanStep({
  state, showCode, onToggleCode, onRedeemed, onEscapeCode, codeCardRef,
}: {
  state: PaywallState;
  showCode: boolean;
  onToggleCode: () => void;
  onRedeemed: () => void;
  onEscapeCode: () => void;
  codeCardRef: RefObject<HTMLDivElement>;
}) {
  const rows = planRows(RECAPS_LIVE);
  const returning = state === 'paid-today';
  // The laptop layout is a client-resolved width, the same call the Books
  // Recaps card makes: the server and the first render are today's column, so
  // nothing is added to the phone DOM. The wall is mounted after a tap, never
  // during SSR, so there is no hydration mismatch to avoid here either.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  // Fixed for the visit, like the timeline's: the date must not shift under the
  // reader between this page and the step they came from.
  const [{ remind }] = useState(() => trialDates());

  return (
    <div
      className="flex flex-col gap-3 px-4 pb-[18px] pt-1 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:items-start xl:gap-x-8 xl:gap-y-3 xl:px-14 xl:pb-6 xl:pt-1"
      style={{ animation: 'oi-slide .4s cubic-bezier(.2,.8,.2,1) both' }}
    >
      <figure
        className="m-0 rounded-2xl border border-[#efe4d2] bg-white px-[18px] pb-4 pt-[18px] xl:col-start-1"
        style={{ animation: 'oi-up .45s cubic-bezier(.2,.8,.2,1) .05s both' }}
      >
        <div className="flex"><Icon name="format_quote" size={30} filled className="text-primary" /></div>
        <blockquote className="m-0 mt-1 text-[16.5px] font-medium leading-[1.45] [text-wrap:pretty]">
          This app has been a blessing to me and my business. 30 seconds to make an invoice on the go.
        </blockquote>
        <figcaption className="mt-3.5 flex items-center gap-2.5 border-t border-[#f0e7d8] pt-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brands/cyril-handyman-door.jpg"
            alt="Cyril Handyman & Door logo"
            width={40}
            height={40}
            className="block h-10 w-10 rounded-[10px] bg-on-background object-cover"
          />
          <div>
            <div className="text-sm font-semibold leading-[1.2]">Cyril</div>
            <div className="text-[12.5px] leading-[1.3] text-[#4d4635]">Cyril Handyman &amp; Door LLC</div>
          </div>
        </figcaption>
      </figure>

      {/* Laptop only (design's page 3): when the reminder goes out. No trial to
          remind about for a returning customer, so it is not rendered then. */}
      {wide && !returning && (
        <div
          className="flex items-center gap-3 rounded-2xl border border-[#efe4d2] bg-white px-3.5 py-[13px] xl:col-start-1"
          style={{ animation: 'oi-up .4s cubic-bezier(.2,.8,.2,1) .12s both' }}
        >
          {/* The design draws `notifications_active`; the app's icon set has
              `notifications` (the same one the trial step's reminder uses) and
              icons are not extended in this round. */}
          <Icon name="notifications" size={22} className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold leading-[1.25]">Trial reminder</span>
            <span className="block text-[12.5px] leading-[1.35] text-[#4d4635]">
              We’ll email you {short(remind)} before it ends
            </span>
          </span>
        </div>
      )}

      {/* Access code: a real system (access_grants + /api/redeem), collapsed
          until asked for. Redeemed → free access is on; close so they can
          retry what was blocked. */}
      <div ref={codeCardRef} className={`${CARD} overflow-hidden xl:col-start-1`}>
        <button
          type="button"
          aria-expanded={showCode}
          aria-controls="paywall-code"
          onClick={onToggleCode}
          className="flex w-full items-center gap-3 px-3.5 py-[13px] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <Icon name="confirmation_number" size={22} className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold leading-[1.25]">Have a code?</span>
            <span className="block text-[12.5px] leading-[1.35] text-[#4d4635]">Founder and invite codes</span>
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold leading-none text-primary">
            <span className="max-[339px]:hidden">Enter code</span>
            <Icon
              name="expand_more"
              size={20}
              className={`transition-transform duration-[250ms] ease-out ${showCode ? 'rotate-180' : ''}`}
            />
          </span>
        </button>
        {showCode && (
          <div id="paywall-code" className="px-3.5 pb-3.5">
            <CodeEntry autoFocus onEscape={onEscapeCode} onRedeemed={onRedeemed} />
          </div>
        )}
      </div>

      {/* The one plan. A returning customer pays from today, so the card says
          so rather than naming a trial they don't have. */}
      <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-on-background bg-white px-4 py-[15px] xl:col-start-1">
        <span aria-hidden className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 border-on-background">
          <span className="h-[10px] w-[10px] rounded-full bg-on-background" />
        </span>
        <span className="flex-1 font-display text-[12.5px] font-extrabold uppercase leading-none tracking-[.08em]">
          {returning ? 'Monthly plan' : '14-day free trial'}
        </span>
        <span className="text-sm leading-none text-[#4d4635]">
          {returning ? 'starts today · ' : 'then '}<b className="font-bold text-on-background">$9.99</b> / month
        </span>
      </div>

      <h2
        id="paywall-step-title"
        tabIndex={-1}
        className="mt-2.5 font-display text-[20px] font-extrabold leading-[1.2] tracking-[-0.01em] outline-none xl:col-start-2 xl:row-start-1 xl:mt-0"
      >
        {STEP_TITLE.plan}
      </h2>

      <table
        className={`${CARD} w-full table-fixed border-separate border-spacing-0 overflow-hidden text-[13.5px] leading-[1.3] xl:col-start-2 xl:row-start-2 xl:row-span-4`}
        style={{ animation: 'oi-up .45s cubic-bezier(.2,.8,.2,1) .3s both' }}
      >
        <caption className="sr-only">What’s included with Free and On It</caption>
        <colgroup><col /><col className="w-[76px]" /><col className="w-[86px]" /></colgroup>
        <thead>
          <tr>
            <th scope="col" className="p-3"><span className="sr-only">Feature</span></th>
            <th scope="col" className={`${HEAD} font-bold text-[#4d4635]`}>FREE</th>
            <th scope="col" className={`${HEAD} bg-[#faefdc] font-extrabold`}>ON IT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="border-t border-[#f0e7d8] px-3.5 py-3 text-left font-medium">{r.label}</th>
              <td className="border-t border-[#f0e7d8] px-1.5 py-3 text-center text-[#4d4635]">
                <span className="flex items-center justify-center"><CellValue v={r.free} paid={false} /></span>
              </td>
              <td className="border-t border-[#f0e7d8] bg-[#faefdc] px-1.5 py-3 text-center">
                <span className="flex items-center justify-center"><CellValue v={r.paid} paid /></span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
