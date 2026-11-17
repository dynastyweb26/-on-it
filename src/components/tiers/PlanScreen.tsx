'use client';
// 06 Settings › Plan — design/tiers/Tiers_2_Locks_Plan_Cancel.dc.html §06.
// Plan card, usage, one action. The card renders /api/access's planCard and
// computes nothing: plan, price, dates, pending change, manage link and which
// actions exist are all the server's (lib/plan-card). Wording is
// lib/plan-screen-view. Every plan action goes through the one purchase
// interface (lib/subscription/start: purchases).
//
// States: loading (skeleton, shimmer 1.4s), load error (names it, Retry),
// pending (spinner in the tapped button, the others disabled; a synchronous
// ref ignores repeat taps), action error (the cause, inline). Past due,
// canceling and paused never reach this screen: they keep today's.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import PaywallModal from '@/components/PaywallModal';
import { purchases, type PurchaseOutcome } from '@/lib/subscription/start';
import type { PlanCard } from '@/lib/plan-card';
import {
  PLAN_COPY, manageLabel, planAction, planCardView, plansPaywallReason, usageRows,
  planScreenData, type CardView, type PlanAction, type PlanScreenData, type UsageRow,
} from '@/lib/plan-screen-view';
import { subscribeAccess } from '@/lib/upgrade-return';
import './plan.css';


type Busy = 'action' | 'manage' | 'restore' | null;


export default function PlanScreen({ above, below }: {
  /** Today's offer notice, when the cancel screen handed one back. */
  above?: ReactNode;
  /** Today's cancel entry for a paid plan (kept: the live cancel flow starts here). */
  below?: (card: PlanCard) => ReactNode;
}) {
  const [data, setData] = useState<PlanScreenData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await fetch('/api/access');
      const next = res.ok ? planScreenData(await res.json()) : null;
      if (!next) throw new Error('no plan card');
      setData(next);
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribeAccess(() => { void load(); }), [load]);

  if (!data) {
    return loadFailed
      ? <PlanScreenView state="error" onRetry={() => { setData(null); void load(); }} />
      : <PlanScreenView state="loading" />;
  }
  return <PlanScreenLive data={data} reload={load} above={above} below={below} />;
}

function PlanScreenLive({ data, reload, above, below }: {
  data: PlanScreenData;
  reload: () => Promise<void>;
  above?: ReactNode;
  below?: (card: PlanCard) => ReactNode;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);
  const busyRef = useRef(false);

  const run = async (which: Exclude<Busy, null>, task: () => Promise<PurchaseOutcome | void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(which);
    setError(null);
    setNotice(null);
    let keep = false;
    try {
      const out = await task();
      if (!out) return;
      if (out.status === 'failed') setError(out.message);
      else if (out.status === 'pending') keep = true; // the browser is leaving for checkout / the portal
      else if (out.status === 'cancelled' && which === 'restore') setNotice(PLAN_COPY.restoredNothing);
      else if (out.status !== 'cancelled') await reload();
    } finally {
      // Pending clears on every exit except a hand-over to another page.
      if (!keep) { busyRef.current = false; setBusy(null); }
    }
  };

  const action = planAction(data.card, data.catalog);
  const onAction = (a: PlanAction) => {
    if (a.kind === 'see-plans') {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy('action');
      setPaywall(true);
      return;
    }
    void run('action', () => (
      a.kind === 'upgrade' ? purchases.upgrade({ returnTo: 'settings' })
        : a.kind === 'switch-pro' ? purchases.switchToPro()
          : purchases.keepPlus()
    ));
  };
  const onManage = () => {
    const m = data.card.manage;
    if (!m) return;
    if (m.target !== 'portal' && m.url) {
      window.open(m.url, '_blank', 'noopener');
      return;
    }
    void run('manage', () => purchases.manage());
  };

  return (
    <>
      {above}
      <PlanScreenView
        state="ready"
        card={planCardView(data.card, data.catalog, data.trialEligible)}
        usage={usageRows(data.card, data.usage, data.catalog)}
        action={action}
        manage={data.card.manage ? { label: manageLabel(data.card) } : null}
        restore={data.card.canRestore}
        busy={busy}
        error={error}
        notice={notice}
        onAction={onAction}
        onManage={onManage}
        onRestore={() => void run('restore', () => purchases.restore())}
      />
      {below?.(data.card)}
      {paywall && (
        <PaywallModal
          variant="invoice"
          reason={plansPaywallReason(data.card)}
          returnTo="settings"
          onClose={() => { setPaywall(false); busyRef.current = false; setBusy(null); }}
        />
      )}
    </>
  );
}

// ── Presentational: every state, also drawn on /dev/tiers ──────────────────

type ViewProps =
  | { state: 'loading' }
  | { state: 'error'; onRetry: () => void }
  | {
    state: 'ready';
    card: CardView;
    usage: UsageRow[];
    action: PlanAction | null;
    manage: { label: string | null } | null;
    restore: boolean;
    busy: Busy;
    error: string | null;
    notice?: string | null;
    onAction: (a: PlanAction) => void;
    onManage: () => void;
    onRestore: () => void;
  };

const Sym = ({ name }: { name: string }) => <span className="material-symbols-outlined" aria-hidden>{name}</span>;
const Spinner = () => <span className="tp-spinner" aria-hidden />;

export function PlanScreenView(props: ViewProps) {
  if (props.state === 'loading') {
    return (
      <div className="tp-plan" data-plan-state="loading" aria-busy="true">
        <div className="tp-card tp-skel">
          <span className="tp-bone" style={{ width: 90, height: 22, borderRadius: 6 }} />
          <span className="tp-bone" style={{ width: 160, height: 14, borderRadius: 5 }} />
          <span className="tp-bone" style={{ width: '100%', height: 8, borderRadius: 4, marginTop: 6 }} />
        </div>
      </div>
    );
  }
  if (props.state === 'error') {
    return (
      <div className="tp-plan" data-plan-state="error">
        <div className="tp-loaderr" role="alert">
          <Sym name="error" />
          <span className="tp-loaderr-text">{PLAN_COPY.loadError}</span>
          <button type="button" className="tp-retry" onClick={props.onRetry}>{PLAN_COPY.retry}</button>
        </div>
      </div>
    );
  }

  const { card, usage, action, manage, restore, busy, error, notice, onAction, onManage, onRestore } = props;
  const anyBusy = busy !== null;
  const inCard = action && (action.kind === 'switch-pro' || action.kind === 'keep-plus');
  const actionButton = action && (
    <button
      type="button"
      className={action.kind === 'switch-pro' ? 'tp-outline' : 'tp-gold'}
      disabled={anyBusy && busy !== 'action'}
      aria-busy={busy === 'action' || undefined}
      data-busy={busy === 'action' ? '' : undefined}
      onClick={() => { if (!anyBusy) onAction(action); }}
    >
      {busy === 'action' && <Spinner />}
      {action.label}
    </button>
  );

  return (
    <div className="tp-plan is-ready" data-plan-state="ready" data-plan-kind={card.kind}>
      {/* Phone: display:contents, so these flow in the column by `order`. Laptop (6D): the 380 column. */}
      <div className="tp-left">
        {card.kind === 'founder' ? (
          <div className="tp-founder tp-a-card">
            <span className="tp-founder-icon"><Sym name="workspace_premium" /></span>
            <div className="tp-founder-text">
              <span className="tp-founder-title">{card.title}</span>
              <span className="tp-founder-sub">{card.sub}</span>
            </div>
          </div>
        ) : (
          <div className={`tp-card tp-a-card${card.kind === 'pending' ? ' is-pending' : ''}`}>
            {card.kind !== 'pending' && <span className="tp-eyebrow">{PLAN_COPY.yourPlan}</span>}
            {card.kind === 'paid' ? (
              <div className="tp-namerow">
                <span className="tp-name">{card.title}</span>
                {card.price && <span className="tp-price">{card.price}<span className="tp-per">/mo</span></span>}
              </div>
            ) : (
              <span className="tp-name">{card.title}</span>
            )}
            {(card.kind === 'free' || card.kind === 'paid') && card.sub && <span className="tp-sub">{card.sub}</span>}
            {card.kind === 'trial' && <span className="tp-sub">{card.sub}</span>}
            {card.kind === 'trial' && card.then && <span className="tp-then">{card.then}</span>}
            {inCard && <div className="tp-card-action">{actionButton}</div>}
            {action?.kind === 'switch-pro' && action.caption && <span className="tp-then">{action.caption}</span>}
          </div>
        )}

        {(error || notice) && (
          <div className="tp-a-msg">
            {error && <div className="tp-err" role="alert"><Sym name="error" /><span>{error}</span></div>}
            {notice && <p className="tp-notice" role="status">{notice}</p>}
          </div>
        )}

        {action && !inCard && (
          <div className="tp-action tp-a-action">
            {actionButton}
            {action.kind === 'upgrade' && action.caption && <span className="tp-caption">{action.caption}</span>}
          </div>
        )}

        {(manage || restore) && (
          <div className="tp-rows tp-a-rows">
            {manage && (
              <button type="button" className="tp-row" onClick={onManage} disabled={anyBusy && busy !== 'manage'}>
                {busy === 'manage' ? <Spinner /> : <Sym name="open_in_new" />}
                <span className="tp-row-label">{PLAN_COPY.manage}</span>
                {manage.label && <span className="tp-row-meta">{manage.label}</span>}
              </button>
            )}
            {restore && (
              <button type="button" className="tp-row" onClick={onRestore} disabled={anyBusy && busy !== 'restore'}>
                {busy === 'restore' ? <Spinner /> : <Sym name="restore" />}
                <span className="tp-row-label">{PLAN_COPY.restore}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {usage.length > 0 && (
        <div className={`tp-usage tp-a-usage${usage.length > 1 ? ' is-grid' : ''}`}>
          {usage.map((r) => (
            <div key={r.key} className="tp-urow" data-usage={r.key}>
              <div className="tp-uhead">
                <span>{r.label}</span>
                <span><strong>{r.used}</strong> of {r.limit}</span>
              </div>
              <div className="tp-bar"><div className={`tp-fill${r.full ? ' is-full' : ''}`} style={{ width: `${r.pct}%` }} /></div>
              {r.note && <span className={`tp-unote${r.full && r.key !== 'ai' ? ' is-full' : ''}`}>{r.note}</span>}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
