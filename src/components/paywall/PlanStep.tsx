'use client';
// Step 3 · What's included — the founder/invite code row, the plan card, then
// Free vs On It side by side, true rows only (each matches what the code
// enforces: free_invoice_limit() / free_estimate_limit() / free_expense_limit(),
// recurring expenses paid-only, PDF exports paid-only). Layout is
// design-reference/paywall-mockup.html's step 3; the testimonial and the
// reminder switch are not here (see TrialStep for why).
//
// The rows and their caps live in lib/paywall-copy (one source, unit-tested);
// the recaps row rides lib/recaps-live. One tier only: there is no second
// price and no plan picker here.
import type { ReactNode, RefObject } from 'react';
import Icon from '@/components/Icon';
import CodeEntry from '@/components/CodeEntry';
import { STEP_TITLE, planRows, type PaywallState, type PlanCell } from '@/lib/paywall-copy';
import { RECAPS_LIVE } from '@/lib/recaps-live';

const CARD = 'rounded-2xl border border-[#efe4d2] bg-white';
const HEAD = 'px-1.5 py-3 text-center font-display text-[10.5px] leading-none tracking-[.12em]';

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

  return (
    <div
      className="flex flex-col gap-3 px-4 pb-[18px] pt-1"
      style={{ animation: 'oi-slide .4s cubic-bezier(.2,.8,.2,1) both' }}
    >
      {/* Access code: a real system (access_grants + /api/redeem), collapsed
          until asked for. Redeemed → free access is on; close so they can
          retry what was blocked. */}
      <div ref={codeCardRef} className={`${CARD} overflow-hidden`}>
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
      <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-on-background bg-white px-4 py-[15px]">
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
        className="mt-2.5 font-display text-[20px] font-extrabold leading-[1.2] tracking-[-0.01em] outline-none"
      >
        {STEP_TITLE.plan}
      </h2>

      <table
        className={`${CARD} w-full table-fixed border-separate border-spacing-0 overflow-hidden text-[13.5px] leading-[1.3]`}
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
