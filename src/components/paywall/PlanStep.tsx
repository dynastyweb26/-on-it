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
import PaywallCodeEntry from '@/components/paywall/PaywallCodeEntry';
import { INCLUDED_TITLE, STEP_TITLE, planRows, type PaywallState, type PlanCell } from '@/lib/paywall-copy';
import { TRIAL_DAYS } from '@/lib/trial';
import { RECAPS_LIVE } from '@/lib/recaps-live';

// Card styles from the design: white, hairline warm border, 16px radius.
const CARD = 'rounded-2xl border border-hairline bg-surface-container-lowest';

function CellValue({ v }: { v: PlanCell }): ReactNode {
  if (v === true) return <span role="img" aria-label="Included"><Icon name="check" size={19} className="text-primary" /></span>;
  if (v === false) return <span role="img" aria-label="Not included" className="text-muted">—</span>;
  return v;
}

export default function PlanStep({
  state, showCode, onToggleCode, onRedeemed, onEscapeCode, codeCardRef,
}: {
  /** What the access check answered: the plan row promises a trial only when
   *  one is really coming. */
  state: PaywallState;
  showCode: boolean;
  onToggleCode: () => void;
  onRedeemed: () => void;
  onEscapeCode: () => void;
  codeCardRef: RefObject<HTMLDivElement>;
}) {
  const rows = planRows(RECAPS_LIVE);
  const trial = state === 'trial';

  return (
    <div className="flex flex-col gap-4 px-4">
      {/* The mockup has no step title on the plan screen; keep one for the
          dialog's label and for screen readers, out of the visual flow. */}
      <h2 id="paywall-step-title" tabIndex={-1} className="sr-only">
        {STEP_TITLE.plan}
      </h2>

      {/* The one selected plan (single tier). A trial customer sees the trial
          they are getting; everyone else sees what starts today. */}
      <div role="radiogroup" aria-label="Plan">
        <div
          role="radio"
          aria-checked="true"
          className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-on-background bg-surface-container-lowest px-4 py-[15px]"
        >
          <Icon name="radio_button_checked" size={22} className="text-on-background" />
          <span className="flex-1 font-display text-[12.5px] font-extrabold uppercase tracking-[.08em]">
            {trial ? `${TRIAL_DAYS}-DAY FREE TRIAL` : 'MONTHLY'}
          </span>
          <span className="text-[14px] leading-none text-on-surface-variant">
            {trial && 'then '}
            <b className="font-bold text-on-background">$9.99</b> / month
          </span>
        </div>
      </div>

      <h3 className="font-display text-[20px] font-extrabold leading-[1.2] tracking-[-0.01em]">{INCLUDED_TITLE}</h3>

      {/* Free vs On It, to the mockup: a fixed 76/86px pair of value columns,
          small display-caps headers, and the gold OUTLINED check (never a
          filled glyph). */}
      <table className={`${CARD} w-full table-fixed border-separate border-spacing-0 overflow-hidden text-[13.5px] leading-[1.3]`}>
        <caption className="sr-only">What’s included with Free and On It</caption>
        <colgroup>
          <col />
          <col className="w-[76px]" />
          <col className="w-[86px]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="px-3.5 py-3 text-left"><span className="sr-only">Feature</span></th>
            <th scope="col" className="px-1.5 py-3 text-center font-display text-[10.5px] font-bold uppercase tracking-[.12em] text-on-surface-variant">Free</th>
            <th scope="col" className="bg-tile px-1.5 py-3 text-center font-display text-[10.5px] font-extrabold uppercase tracking-[.12em]">On It</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="border-t border-hairline px-3.5 py-3 text-left font-medium">{r.label}</th>
              <td className="border-t border-hairline px-1.5 py-3 text-center text-on-surface-variant">
                <span className="inline-flex justify-center"><CellValue v={r.free} /></span>
              </td>
              <td className="border-t border-hairline bg-tile px-1.5 py-3 text-center font-bold">
                <span className="inline-flex justify-center"><CellValue v={r.paid} /></span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Access code: a real system (access_grants + /api/redeem), collapsed
          until asked for. Redeemed → free access is on; close so they can
          retry what was blocked. Styled to the mockup, forked from the shared
          CodeEntry so Settings keeps its own look. */}
      <div ref={codeCardRef} className={`${CARD} overflow-hidden`}>
        <button
          type="button"
          aria-expanded={showCode}
          aria-controls="paywall-code"
          onClick={onToggleCode}
          className="flex w-full items-center gap-3 px-[14px] py-[13px] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <Icon name="confirmation_number" size={22} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-semibold leading-[1.25]">Have a code?</div>
            <div className="text-[12.5px] leading-[1.35] text-on-surface-variant">Founder and invite codes</div>
          </div>
          <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-primary">
            Enter code
            <Icon
              name="expand_more"
              size={20}
              className={`transition-transform duration-200 ${showCode ? 'rotate-180' : ''}`}
            />
          </span>
        </button>
        {showCode && (
          <div id="paywall-code" className="px-[14px] pb-[14px]">
            <PaywallCodeEntry onEscape={onEscapeCode} onRedeemed={onRedeemed} />
          </div>
        )}
      </div>
    </div>
  );
}
