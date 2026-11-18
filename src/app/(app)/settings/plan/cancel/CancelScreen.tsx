'use client';
// The cancel screen (CANCEL-FLOW-SPEC.md §2-3, rules 3-6).
//
// Everything rendered comes from GET /api/subscription/cancel-summary, so a
// hard refresh mid-flow or on the done state shows the server's state (spec
// test 10). The done state IS the server's cancel_at_period_end.
//
// Billing goes only through lib/subscription-actions (cancel / resume /
// applyOffer): this screen knows nothing about the billing provider, so the
// Apple / Google versions can reuse it as is. Offer eligibility shown here is
// a display hint; the offer route re-checks it server-side.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { createClient } from '@/lib/supabase/client';
import { RECAPS_LIVE } from '@/lib/recaps-live';
import { applyOffer, cancel, getSummary, resume, type CancelSummary } from '@/lib/subscription-actions';
import { DETAIL_MAX, type CancelReason } from '@/lib/subscription/reasons';
import { offerFor, pauseResumesAt, PAUSE_MONTHS, type PauseMonths } from '@/lib/subscription/offers';
import type { StatTile } from '@/lib/subscription/stats';
import { discountCta, discountLine, discountTitle, endsWithPlanLine, fmtPlanDate, pauseOfferLine } from '@/lib/subscription/copy';
import { NEXT_PUBLIC_TIERS } from '@/lib/feature-flags';
import { planScreenData } from '@/lib/plan-screen-view';
import { cancelOffersFor } from '@/lib/subscription/offers';
import { plusOfferCta, plusPriceStep, plusSeasonalSwitch, storeManageFor, type PlusChoice } from '@/lib/cancel-plus-view';
import { purchases } from '@/lib/subscription/start';
import { recordSwitchToPro } from '@/lib/subscription-actions';
import type { PlanCatalog } from '@/lib/plan-catalog';
import { PlusPriceStep, SeasonalSwitchCard, StoreManageCard } from '@/components/tiers/PlusCancel';


const REASONS: { key: CancelReason; label: string; icon: IconName }[] = [
  { key: 'price', label: 'Too expensive', icon: 'payments' },
  { key: 'seasonal', label: 'Slow season / not using it right now', icon: 'pause' },
  { key: 'feature', label: 'Missing something I need', icon: 'build' },
  { key: 'switching', label: 'Switching to another app', icon: 'sync' },
  { key: 'other', label: 'Something else', icon: 'more_horiz' },
];

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function tileText(t: StatTile): { value: string; label: string } {
  switch (t.key) {
    case 'sent': return { value: t.value.toLocaleString('en-US'), label: t.value === 1 ? 'Invoice sent' : 'Invoices sent' };
    case 'collected': return { value: money(t.value), label: 'Collected through On It' };
    case 'daysToPaid': return { value: t.value.toFixed(1), label: 'Average days to get paid' };
    case 'clients': return { value: t.value.toLocaleString('en-US'), label: t.value === 1 ? 'Client saved' : 'Clients saved' };
  }
}

export default function CancelScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<CancelSummary | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [detail, setDetail] = useState('');
  const [months, setMonths] = useState<PauseMonths>(1);
  const [busy, setBusy] = useState<'cancel' | 'offer' | 'resume' | null>(null);
  const [notice, setNotice] = useState('');
  // Tiers (flag on): a Plus user's offers (design/tiers 07). Null for every
  // other plan, so Pro and Free keep today's flow exactly.
  const [plusCtx, setPlusCtx] = useState<{ catalog: PlanCatalog | null; renewalAt: string | null; billingSource: string | null } | null>(null);

  async function load() {
    setLoadFailed(false);
    const s = await getSummary();
    if (!s) {
      // Signed out → login; otherwise a retryable error, never a blank screen.
      const { data: { session } } = await createClient().auth.getSession();
      if (!session) { router.replace('/login'); return; }
      setLoadFailed(true);
      return;
    }
    // Founders and anyone without a live subscription have nothing to cancel.
    if (!s.subscribed || s.tier === 'founder') { router.replace('/settings/plan'); return; }
    if (NEXT_PUBLIC_TIERS) {
      const d = await fetch('/api/access').then((r) => (r.ok ? r.json() : null)).then(planScreenData).catch(() => null);
      if (d && d.card.plan === 'plus' && !d.card.founder) {
        setPlusCtx({ catalog: d.catalog, renewalAt: d.card.renewalAt, billingSource: d.card.billingSource });
      }
    }
    setSummary(s);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  if (loadFailed) {
    return (
      <Shell>
        <div className="card space-y-3">
          <p className="text-sm text-on-surface-variant">This didn’t load. Check your connection and try again.</p>
          <button className="btn-outline w-full" onClick={() => void load()}>
            <Icon name="refresh" size={18} /> Try again
          </button>
        </div>
      </Shell>
    );
  }
  if (!summary) {
    return (
      <Shell>
        <div className="card h-40 animate-pulse" aria-busy="true" aria-label="Loading" />
      </Shell>
    );
  }

  const ends = fmtPlanDate(summary.endsAt);
  const trialing = summary.status === 'trialing';

  // Done state: the subscription is set to end (from the server).
  if (summary.cancelAtPeriodEnd) {
    return (
      <Shell>
        <section className="card space-y-3">
          <p className="flex items-center gap-2 font-display text-[20px] font-bold text-on-background">
            <Icon name="check_circle" size={24} className="text-primary" /> Canceled.
          </p>
          <p className="text-sm text-on-surface-variant">
            {ends ? `Your plan ends ${ends}. You keep everything until then, and your history after.` : 'Your plan ends at the end of this period. You keep your history.'}
          </p>
          {notice && <p className="text-sm text-on-surface-variant" role="alert">{notice}</p>}
          <button className="btn-primary w-full" disabled={busy !== null} onClick={async () => {
            setBusy('resume'); setNotice('');
            const r = await resume();
            if (r.ok) { router.push('/settings/plan'); return; }
            setNotice(r.message); setBusy(null);
          }}>
            {busy === 'resume' ? 'Resuming…' : 'Resume subscription'}
          </button>
          <Link href="/settings" className="btn-outline w-full">Back to Settings</Link>
        </section>
      </Shell>
    );
  }

  const tiles = summary.tiles ?? [];
  // Plus (flag on): cancelOffersFor decides; pause stays today's card where
  // the store can pause. Everyone else: today's single offer.
  const plusOffers = plusCtx
    ? cancelOffersFor({ plan: 'plus', reason, trialing, billingSource: plusCtx.billingSource, eligible: Boolean(summary.offerEligible) })
    : null;
  const offer = plusOffers
    ? (plusOffers.includes('pause') ? 'pause' : null)
    : offerFor(reason, summary.status ?? '', Boolean(summary.offerEligible));
  // The pause starts when the paid period ends (summary.endsAt for a paid
  // period) and lasts N months from there — the same dates the route sets.
  const pauseFrom = summary.endsAt;
  const pauseUntil = pauseFrom ? pauseResumesAt(months, new Date(pauseFrom)).toISOString() : null;

  async function takeOffer(kind: 'discount' | 'pause') {
    setBusy('offer'); setNotice('');
    const r = await applyOffer(kind, kind === 'pause' ? months : undefined);
    if (r.ok) { router.push(`/settings/plan?done=${kind === 'discount' ? 'discount' : 'paused'}`); return; }
    setNotice(r.message); setBusy(null);
    // The server may know better (e.g. an offer already used): re-read it.
    void getSummary().then((s) => { if (s) setSummary(s); });
  }

  /** Plus → Pro at the end of the paid period. The switch goes through the one
   *  purchase interface first; only once it worked is it recorded as the offer
   *  taken (offer route, kind switch_pro), so a failed switch never spends it. */
  async function switchToPro(): Promise<boolean> {
    const out = await purchases.switchToPro();
    if (out.status === 'failed') throw new Error(out.message);
    if (out.status === 'cancelled') return false;
    const rec = await recordSwitchToPro();
    if (!rec.ok) console.error('[cancel] Pro switch not recorded as the offer', rec.message);
    return true;
  }

  async function takePlus(choice: PlusChoice): Promise<'done' | 'switched'> {
    if (choice === 'discount') {
      const r = await applyOffer('discount');
      if (!r.ok) throw new Error(r.message);
      router.push('/settings/plan?done=discount');
      return 'done';
    }
    if (!(await switchToPro())) return 'done';
    // "You're set" shows, then the flow ends on Plan.
    setTimeout(() => router.push('/settings/plan'), 1600);
    return 'switched';
  }

  async function takeSeasonalSwitch() {
    if (busy) return;
    setBusy('offer'); setNotice('');
    try {
      if (await switchToPro()) { router.push('/settings/plan'); return; }
      setBusy(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : ''); setBusy(null);
    }
  }

  async function doCancel() {
    setBusy('cancel'); setNotice('');
    const r = await cancel({ reason, detail: reason === 'feature' || reason === 'other' ? detail : null });
    if (!r.ok) { setNotice(r.message); setBusy(null); return; }
    const s = await getSummary();
    // Show the server's done state; fall back to the route's answer if the
    // summary read is late.
    setSummary(s ?? { ...summary!, cancelAtPeriodEnd: true, endsAt: r.endsAt ?? summary!.endsAt });
    setBusy(null);
  }

  // 7A: one new step for a Plus user who picked Too expensive.
  // Web, store-billed Plus: neither offer can be taken here (both are the
  // store's); 7A and 7B show where to manage the plan instead.
  const storeManage = plusCtx ? storeManageFor(plusCtx.billingSource, purchases.source === 'native', plusCtx.catalog) : null;

  if (plusCtx && plusOffers && plusPriceStep(plusOffers)) {
    return (
      <div className="mx-auto max-w-lg">
        <PlusPriceStep
          catalog={plusCtx.catalog}
          renewalAt={plusCtx.renewalAt}
          onBack={() => setReason(null)}
          onTake={takePlus}
          onCancelAnyway={() => { setReason(null); void doCancel(); }}
          storeManage={storeManage}
        />
      </div>
    );
  }

  return (
    <Shell>
      {tiles.length > 0 && (
        <section className="card space-y-3" aria-label="What you’ve built">
          <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">What you’ve built</h2>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map((t) => {
              const { value, label } = tileText(t);
              return (
                <div key={t.key} className="rounded-card bg-surface-container px-3 py-3">
                  <p className="font-display text-[26px] font-extrabold leading-tight text-on-background">{value}</p>
                  <p className="text-[13px] text-on-surface-variant">{label}</p>
                </div>
              );
            })}
          </div>
          <p className="text-sm text-on-surface-variant">{endsWithPlanLine(RECAPS_LIVE)}</p>
        </section>
      )}

      <section className="card space-y-3">
        <div>
          <h2 className="font-display text-[22px] font-bold leading-tight text-on-background">Before you go</h2>
          <p className="text-sm text-on-surface-variant">Mind telling us why? It’s optional.</p>
        </div>
        <div role="radiogroup" aria-label="Reason" className="space-y-2">
          {REASONS.map((r) => {
            const on = reason === r.key;
            return (
              <button key={r.key} type="button" role="radio" aria-checked={on}
                onClick={() => { setReason(on ? null : r.key); setNotice(''); }}
                className={`flex min-h-[52px] w-full items-center gap-3 rounded-card border px-3 py-2 text-left text-[15px] transition-colors active:scale-[0.99]
                  ${on ? 'ring-gold-selected border-transparent bg-surface-container-lowest font-semibold text-on-background' : 'border-outline-variant/60 bg-surface-container-lowest text-on-surface'}`}>
                <Icon name={r.icon} size={22} className="shrink-0 text-on-surface-variant" />
                <span className="min-w-0 flex-1">{r.label}</span>
                {on && <Icon name="check_circle" size={20} filled className="shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>

        {/* The one offer for the picked reason (or none). */}
        {offer === 'discount' && (
          <div className="space-y-2 rounded-card bg-surface-container p-4">
            <p className="font-display text-[17px] font-bold text-on-background">{discountTitle}</p>
            <p className="text-sm text-on-surface-variant">{discountLine(trialing)}</p>
            <button className="btn-primary w-full" disabled={busy !== null} onClick={() => void takeOffer('discount')}>
              {busy === 'offer' ? 'Applying…' : discountCta}
            </button>
          </div>
        )}
        {offer === 'pause' && (
          <div className="space-y-2 rounded-card bg-surface-container p-4">
            <p className="font-display text-[17px] font-bold text-on-background">Pause instead</p>
            <div role="radiogroup" aria-label="Pause length" className="grid grid-cols-3 rounded-[14px] bg-surface-container-high p-1">
              {PAUSE_MONTHS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={months === m} onClick={() => setMonths(m)}
                  className={`h-10 rounded-[10px] text-[15px] transition-colors active:scale-95
                    ${months === m ? 'bg-surface-container-lowest font-bold text-on-background shadow-card' : 'text-on-surface-variant'}`}>
                  {m} {m === 1 ? 'month' : 'months'}
                </button>
              ))}
            </div>
            <p className="text-sm text-on-surface-variant">{pauseOfferLine(pauseFrom, pauseUntil)}</p>
            <button className="btn-primary w-full" disabled={busy !== null} onClick={() => void takeOffer('pause')}>
              {busy === 'offer' ? 'Pausing…' : `Pause for ${months} ${months === 1 ? 'month' : 'months'}`}
            </button>
          </div>
        )}
        {plusCtx && plusOffers && plusSeasonalSwitch(plusOffers) && (
          // 7B: where the store can't pause (iOS), the Pro switch replaces it.
          <div className="space-y-2">
            {storeManage ? <StoreManageCard manage={storeManage} /> : (
              <>
                <SeasonalSwitchCard catalog={plusCtx.catalog} renewalAt={plusCtx.renewalAt} />
                <button className="btn-primary w-full" disabled={busy !== null} onClick={() => void takeSeasonalSwitch()}>
                  {busy === 'offer' ? 'Switching…' : plusOfferCta('switch_pro', plusCtx.catalog)}
                </button>
              </>
            )}
          </div>
        )}
        {(reason === 'feature' || reason === 'other') && (
          <label className="block rounded-card border border-outline-variant/60 bg-surface-container-lowest px-4 py-2.5">
            <span className="block text-[13px] text-on-surface-variant">
              {reason === 'feature' ? 'What’s missing? · optional' : 'Anything you want to tell us · optional'}
            </span>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value.slice(0, DETAIL_MAX))}
              rows={3} maxLength={DETAIL_MAX}
              className="mt-1 w-full resize-none bg-transparent text-[15px] text-on-background outline-none" />
          </label>
        )}
        {reason === 'feature' && (
          <p className="text-sm font-semibold text-primary">
            Your data stays on the free plan, and we read every request.
          </p>
        )}
      </section>

      {/* Always visible, before and after a reason is picked (spec rule 4). */}
      <section className="space-y-2">
        {notice && <p className="px-1 text-sm text-on-surface-variant" role="alert">{notice}</p>}
        <button className="btn-outline w-full" disabled={busy !== null} onClick={() => void doCancel()}>
          {busy === 'cancel' ? 'Canceling…' : 'Cancel subscription'}
        </button>
        <p className="px-1 text-center text-sm text-on-surface-variant">
          {ends ? `You keep your plan until ${ends}.` : 'You keep your plan until the end of this period.'}
        </p>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl space-y-4 overflow-x-hidden px-4 py-4 md:px-6">
      <div className="flex items-center gap-1">
        <Link href="/settings/plan" aria-label="Back to Plan"
          className="-ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-on-background active:bg-surface-container">
          <Icon name="arrow_back" size={24} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-[26px] font-extrabold leading-tight text-on-background">Cancel subscription</h1>
      </div>
      {children}
    </div>
  );
}
