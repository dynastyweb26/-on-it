'use client';
// Step 3 · Plan — Free vs On It, side by side, true rows only (each matches
// what the code enforces: free_invoice_limit() / free_estimate_limit() /
// free_expense_limit(), recurring expenses paid-only, PDF exports paid-only),
// then the founder/invite code row.
//
// The rows and their caps live in lib/paywall-copy (one source, unit-tested);
// the recaps row rides lib/recaps-live. One tier only: there is no second
// price and no plan picker here.
import type { ReactNode, RefObject } from 'react';
import Icon from '@/components/Icon';
import CodeEntry from '@/components/CodeEntry';
import { STEP_TITLE, planRows, type PlanCell } from '@/lib/paywall-copy';
import { RECAPS_LIVE } from '@/lib/recaps-live';

// Card styles from the design: white, hairline warm border, 16px radius.
const CARD = 'rounded-2xl border border-[#efe4d2] bg-surface-container-lowest';
// Rows tighten on short screens (SE), per the design's SE frames.
const ROW_H = 'min-h-[60px] [@media(max-height:700px)]:min-h-[52px]';

function CellValue({ v }: { v: PlanCell }): ReactNode {
  if (v === true) return <span role="img" aria-label="Included"><Icon name="check" size={20} className="text-primary" /></span>;
  if (v === false) return <span role="img" aria-label="Not included" className="text-on-surface-variant">—</span>;
  return v;
}

export default function PlanStep({
  showCode, onToggleCode, onRedeemed, onEscapeCode, codeCardRef,
}: {
  showCode: boolean;
  onToggleCode: () => void;
  onRedeemed: () => void;
  onEscapeCode: () => void;
  codeCardRef: RefObject<HTMLDivElement>;
}) {
  const rows = planRows(RECAPS_LIVE);

  return (
    <div className="flex flex-col gap-4 px-4">
      <h2
        id="paywall-step-title"
        tabIndex={-1}
        className="text-center font-display text-[22px] font-extrabold tracking-[-0.01em] outline-none"
      >
        {STEP_TITLE.plan}
      </h2>

      <table className={`${CARD} w-full border-separate border-spacing-0 overflow-hidden text-[14px] leading-5`}>
        <caption className="sr-only">What’s included with Free and On It</caption>
        <thead>
          <tr className="text-[12px] font-semibold uppercase tracking-[.08em] text-on-surface-variant">
            <th scope="col" className="px-3.5 py-2.5 text-left font-semibold"><span className="sr-only">Feature</span></th>
            <th scope="col" className="w-[84px] px-2 py-2.5 text-center font-semibold">Free</th>
            <th scope="col" className="w-[96px] bg-primary-container/25 px-2 py-2.5 text-center font-display font-extrabold text-on-background">On It</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
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

      {/* Access code: a real system (access_grants + /api/redeem), collapsed
          until asked for. Redeemed → free access is on; close so they can
          retry what was blocked. */}
      <div ref={codeCardRef} className={`${CARD} overflow-hidden`}>
        <button
          type="button"
          aria-expanded={showCode}
          aria-controls="paywall-code"
          onClick={onToggleCode}
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
            <CodeEntry autoFocus onEscape={onEscapeCode} onRedeemed={onRedeemed} />
          </div>
        )}
      </div>
    </div>
  );
}
