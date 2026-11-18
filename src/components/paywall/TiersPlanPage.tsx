'use client';
// 01 Paywall page 3 — design/tiers/Tiers_1_Paywall_and_AI.dc.html §01.
// Replaces today's PlanStep behind NEXT_PUBLIC_TIERS (pages 1 and 2 are
// untouched). Free: two plan cards, Cyril, the reminder line and the code row,
// the Free / Pro / Plus table, one CTA pinned to the bottom (1A). Pro, opened
// from a Plus lock or the AI limit: "Move up to Plus" (1B). Laptop (1C): two
// columns, the CTA in the left one.
//
// Every plan, price, trial length and table cell is the catalog's; the line
// above the headline and the preselected plan are lib/paywall-entry's. Buying
// goes through `purchases` (lib/subscription/start), and a store "yes" waits
// on the server through lib/subscription/confirm.
//
// States (board "CTA · all states"): idle (also where "cancelled" lands, no
// message); pending (picker frozen at 55%, repeat taps ignored by a ref);
// confirming; slow (> 20s, Try again re-asks the server); failed (names the
// cause, the CTA stays live); success (only after the server confirms: the
// access is published, which plays today's celebration and closes the wall).
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import CodeEntry from '@/components/CodeEntry';
import { purchases, type CheckoutReturn, type PurchaseOutcome } from '@/lib/subscription/start';
import { createPlanConfirmation, type PlanConfirmation } from '@/lib/subscription/confirm';
import { publishAccess } from '@/lib/upgrade-return';
import type { AccessRead } from '@/lib/access-poll';
import { paywallEntryFor, type PaywallEntry } from '@/lib/paywall-entry';
import { TRIAL_REMINDER_DAYS, trialDates } from '@/lib/trial';
import type { TierPlan } from '@/lib/entitlements';
import type { PlanCatalog } from '@/lib/plan-catalog';
import {
  CODE_ROW, CONFIRM_COPY, canBuy, preselectFor, ctaFor, freeCapsFrom, headline, payStateFor, pickerFrozen,
  planCards, plusAdds, plusAddsTitle, reminderLine, tableRows, topLineFor,
  type Cell, type CtaView, type PaidChoice, type PayState,
} from '@/lib/paywall-plan-view';
import './tiers-paywall.css';

export interface TiersPlanPageProps {
  entry: PaywallEntry | null;
  /** A soft prompt's own line replaces the entry's. */
  reason?: string;
  viewerPlan: TierPlan;
  catalog: PlanCatalog | null;
  trialEligible: boolean;
  returnTo: CheckoutReturn;
  /** The modal's dismiss guard: × / Escape do nothing while this is true. */
  onBusy: (busy: boolean) => void;
  onRedeemed: () => void;
  /** /dev fixtures: start in a given state. */
  initialState?: PayState;
  initialError?: string | null;
  /** /dev fixtures: draw as the native build would (default: purchases.source). */
  native?: boolean;
}

/** Laptop (1C) from 1280 wide, by the viewport (not the container). */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return wide;
}

const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function TiersPlanPage(props: TiersPlanPageProps) {
  const { entry, reason, viewerPlan, catalog, trialEligible, returnTo, onBusy, onRedeemed } = props;
  // A Pro viewer is only ever sold Plus (1B): an entry that would sell Pro
  // (a free limit, or the variant default from Settings) has no line for them.
  const rawTarget = entry ? paywallEntryFor(entry, viewerPlan) : null;
  const target = rawTarget && (viewerPlan !== 'pro' || rawTarget.plan === 'plus') ? rawTarget : null;
  const isPro = viewerPlan === 'pro';
  const native = props.native ?? purchases.source === 'native';
  const [selected, setSelected] = useState<PaidChoice>(() => preselectFor(target, viewerPlan, native));
  const [pay, setPay] = useState<PayState>(props.initialState ?? 'idle');
  const [error, setError] = useState<string | null>(props.initialError ?? null);
  const [showCode, setShowCode] = useState(false);
  const busyRef = useRef(false);
  const confirmRef = useRef<PlanConfirmation | null>(null);
  const [freeUntil] = useState(() => short(trialDates().end));
  const wide = useWide();

  useEffect(() => { onBusy(pay === 'pending' || pay === 'confirming' || pay === 'slow'); }, [pay, onBusy]);
  useEffect(() => () => confirmRef.current?.cancel(), []);

  const caps = useMemo(() => freeCapsFrom(catalog, viewerPlan), [catalog, viewerPlan]);
  const top = reason ? { icon: 'workspace_premium', text: reason } : topLineFor(target?.topLineKey, catalog, caps);
  const head = headline(viewerPlan, catalog, trialEligible);
  const cards = planCards(catalog, trialEligible);
  const rows = tableRows(catalog, caps);
  const cta = ctaFor({ viewerPlan, selected, catalog, trialEligible, native, freeUntil });

  async function landed() {
    // Success only after the server confirms: publishing the new access plays
    // today's celebration and closes the wall (PaywallModal listens).
    try {
      const res = await fetch('/api/access');
      if (res.ok) publishAccess((await res.json()) as AccessRead);
    } catch { /* the unlock poll and the next read still pick it up */ }
  }

  async function waitForServer(kind: 'start' | 'retry') {
    const c = confirmRef.current ?? createPlanConfirmation({
      fetch: (url, init) => fetch(url, init),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      expect: selected,
    });
    confirmRef.current = c;
    setPay('confirming');
    const out = kind === 'start' ? await c.start() : await c.retry();
    if (out.status === 'success') { setPay('success'); await landed(); return; }
    setPay(out.status === 'slow' ? 'slow' : 'idle');
  }

  async function buy() {
    if (busyRef.current || !canBuy(pay)) return; // no second store sheet
    busyRef.current = true;
    setError(null);
    setPay('pending'); // visible in the tap's frame
    try {
      const out: PurchaseOutcome = isPro
        ? await purchases.upgrade({ returnTo })
        : await purchases.start(selected, { returnTo });
      if (out.status === 'failed') { setError(out.message); setPay('failed'); return; }
      if (out.status === 'confirming' || out.status === 'slow') { await waitForServer('start'); return; }
      if (out.status === 'success') { setPay('success'); await landed(); return; }
      setPay(payStateFor(out)); // pending = the browser is leaving for checkout
    } finally {
      busyRef.current = false;
    }
  }

  async function retry() {
    if (busyRef.current) return;
    busyRef.current = true;
    try { await waitForServer('retry'); } finally { busyRef.current = false; }
  }

  async function restore() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    try {
      const out = await purchases.restore();
      if (out.status === 'failed') setError(out.message);
      else if (out.status === 'success') await landed();
    } finally {
      busyRef.current = false;
    }
  }

  const frozen = pickerFrozen(pay);
  const ctaBlock = cta && (
    <CtaBlock cta={cta} pay={pay} error={error} onBuy={() => void buy()} onRetry={() => void retry()} onRestore={() => void restore()} isPro={isPro} />
  );

  const headEl = (
    <div className="twp-head">
      {top && (
        <div className="twp-top"><Icon name={top.icon as 'description'} size={18} />{top.text}</div>
      )}
      <h2 id="paywall-step-title" tabIndex={-1} className="twp-title">{head.title}</h2>
      {head.sub && <div className="twp-sub">{head.sub}</div>}
    </div>
  );

  const cardsEl = (
    <div className={`twp-cards${frozen ? ' is-frozen' : ''}`} role="radiogroup" aria-label={head.title}>
      {cards.map((c, i) => {
        const mine = isPro && c.plan === 'pro';
        const on = selected === c.plan && !mine;
        return (
          <button
            key={c.plan}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={mine || frozen || (isPro && c.plan !== 'plus')}
            onClick={() => setSelected(c.plan)}
            className={`twp-card${on ? ' is-on' : ''}${mine ? ' is-mine' : ''}`}
            style={{ animationDelay: `${i * 40}ms` }}
            data-plan={c.plan}
          >
            <span className="twp-card-top">
              <span className="twp-card-name">{c.name}</span>
              {!mine && <Icon name={on ? 'radio_button_checked' : 'radio_button_unchecked'} size={22} className="twp-radio" />}
            </span>
            <span className="twp-price">{c.price}<span className="twp-per">/mo</span></span>
            {!isPro && <span className="twp-blurb">{c.blurb}</span>}
            {mine ? (
              <span className="twp-chip is-mine"><Icon name="check" size={14} />{CONFIRM_COPY.yourPlan}</span>
            ) : isPro ? (
              <span className="twp-chip">{CONFIRM_COPY.opensNow}</span>
            ) : c.chip ? (
              <span className="twp-chip">{c.chip}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const rowsEl = isPro ? (
    <div className="twp-rows">
      <div className="twp-rows-title">{plusAddsTitle(catalog)}</div>
      {plusAdds(catalog).map((r) => (
        <div key={r.label} className="twp-row is-adds">
          <Icon name={r.icon as 'forum'} size={22} className="twp-row-icon" />
          <span className="twp-row-label">{r.label}</span>
          {r.from && <s className="twp-from">{r.from}</s>}
          {r.to && <span className="twp-to">{r.to}</span>}
        </div>
      ))}
    </div>
  ) : (
    <div className="twp-rows">
      {/* Decided (founder): no reminder toggle. The email goes out
          TRIAL_REMINDER_DAYS before the end; the line says so. */}
      {trialEligible && (
        <div className="twp-row">
          <Icon name="notifications" size={22} className="twp-row-icon" />
          <span className="twp-row-label">{reminderLine(TRIAL_REMINDER_DAYS)}</span>
        </div>
      )}
      <button type="button" className="twp-row is-tap" aria-expanded={showCode} onClick={() => setShowCode((v) => !v)}>
        <Icon name="key" size={22} className="twp-row-icon" />
        <span className="twp-row-label">{CODE_ROW}</span>
        <Icon name="chevron_right" size={20} className={`twp-chev${showCode ? ' is-open' : ''}`} />
      </button>
      {showCode && (
        <div className="twp-code"><CodeEntry autoFocus onEscape={() => setShowCode(false)} onRedeemed={onRedeemed} /></div>
      )}
    </div>
  );

  const tableEl = (
    <table className="twp-table" data-selected={selected}>
      <caption className="sr-only">What each plan includes</caption>
      <thead>
        <tr>
          <th scope="col"><span className="sr-only">Feature</span></th>
          {(['free', 'pro', 'plus'] as const).map((p) => (
            <th key={p} scope="col" className={selected === p ? 'is-on' : undefined}>
              {(catalog?.plans.find((o) => o.plan === p)?.name ?? p).toUpperCase()}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <th scope="row">{r.label}</th>
            <td><CellView c={r.free} /></td>
            <td className={selected === 'pro' ? 'is-on' : undefined}><CellView c={r.pro} paid /></td>
            <td className={selected === 'plus' ? 'is-on' : undefined}><CellView c={r.plus} paid /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const legalEl = cta && (
    <div className="twp-legal">
      <span>{cta.legal}</span>
      <span className="twp-links">
        <a href="/terms">Terms of Use</a><a href="/privacy">Privacy Policy</a><a href="/eula">EULA</a>
      </span>
    </div>
  );

  // The layout follows the viewport (board: phone 1A/1B below 1280, laptop 1C
  // from 1280), resolved on the client like today's PlanStep. Each layout is
  // its own markup in the board's order: no display:contents, no reordering.
  return (
    <>
      <div className="twp-scroll" data-tiers-paywall={isPro ? 'pro' : 'free'} data-pay={pay} data-layout={wide ? 'laptop' : 'phone'}>
        {wide ? (
          <div className="twp-page is-wide">
            <div className="twp-col">{headEl}{cardsEl}<div className="twp-cta-wide">{ctaBlock}</div>{rowsEl}</div>
            <div className="twp-col">{tableEl}<Testimonial />{legalEl}</div>
          </div>
        ) : (
          <div className="twp-page">
            {headEl}{cardsEl}<Testimonial />{rowsEl}{tableEl}{legalEl}
          </div>
        )}
      </div>
      {!wide && <div className="twp-footer" data-kb-hide="">{ctaBlock}</div>}
    </>
  );
}

function CellView({ c, paid = false }: { c: Cell; paid?: boolean }) {
  if (c.kind === 'icon') {
    return <span role="img" aria-label={c.label} className={`twp-cell-icon${c.icon === 'remove' ? ' is-no' : ''}`}><Icon name={c.icon} size={18} /></span>;
  }
  return <span className={`twp-cell-text${paid ? ' is-paid' : ''}`}>{c.text}</span>;
}

/** Cyril's testimonial exactly as today's PlanStep draws it (RULES 2). */
function Testimonial() {
  return (
    <figure className="m-0 rounded-2xl border border-[#efe4d2] bg-white px-[18px] pb-4 pt-[18px]">
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
  );
}

/** The CTA and its states (board "CTA · all states"). */
export function CtaBlock({ cta, pay, error, onBuy, onRetry, onRestore, isPro }: {
  cta: CtaView;
  pay: PayState;
  error: string | null;
  onBuy: () => void;
  onRetry: () => void;
  onRestore: () => void;
  isPro: boolean;
}) {
  const waiting = pay === 'confirming' || pay === 'slow';
  return (
    <div className="twp-cta" data-cta-state={pay}>
      {pay === 'failed' && error && (
        <div className="twp-err" role="alert"><Icon name="error" size={20} /><span>{error}</span></div>
      )}
      {waiting && (
        <>
          <div className="twp-confirm" role="status"><span className="twp-spin is-soft" aria-hidden />{CONFIRM_COPY.confirming}</div>
          {pay === 'confirming' ? (
            <div className="twp-note">{CONFIRM_COPY.storeSaidYes}</div>
          ) : (
            <div className="twp-slow">
              <span>{CONFIRM_COPY.slow}</span>
              <button type="button" className="twp-retry" onClick={onRetry}>{CONFIRM_COPY.tryAgain}</button>
            </div>
          )}
        </>
      )}
      {!waiting && pay !== 'success' && (
        <>
          <button type="button" className={`twp-gold${pay === 'pending' ? ' is-pending' : ''}`} onClick={onBuy} aria-busy={pay === 'pending' || undefined}>
            {pay === 'pending' && <span className="twp-spin" aria-hidden />}
            {cta.label}
          </button>
          {cta.sub && <div className={`twp-ctasub${isPro ? ' is-pro' : ''}`}>{cta.sub}</div>}
        </>
      )}
      <div className="twp-bottom">
        <span>{cta.renews}</span>
        <button type="button" className="twp-restore" onClick={onRestore}>{CONFIRM_COPY.restore}</button>
      </div>
    </div>
  );
}
