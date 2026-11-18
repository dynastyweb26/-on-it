'use client';
// 07 Cancel flow, two-plan additions — design/tiers/Tiers_2_Locks_Plan_Cancel.dc.html §07.
// 7A: a Plus user who picks "Too expensive" gets one new step, two offers,
// pick one (Switch to Pro preselected; the CTA follows the selection). 7B:
// "Slow season" where the store has no pause offers the Pro switch instead.
// Pro and Free never reach these: their cancel flow is today's.
//
// States: idle; pending (spinner in the CTA, cards frozen, Cancel anyway
// disabled, a ref ignores repeat taps); success ("You're set. Pro starts …",
// the flow ends); error (rust, above the CTA, names the cause, CTA stays live).
import { useRef, useState } from 'react';
import Icon from '@/components/Icon';
import {
  SEVEN_A, plusOfferCards, plusOfferCta, seasonalSwitchCard, switchedLine, type PlusChoice, type StoreManage,
} from '@/lib/cancel-plus-view';
import type { PlanCatalog } from '@/lib/plan-catalog';
import './plus-cancel.css';

export type PlusCancelState = 'idle' | 'pending' | 'success' | 'error';

export function PlusPriceStep({
  catalog, renewalAt, onBack, onTake, onCancelAnyway, initialState = 'idle', initialError = null, storeManage = null,
}: {
  catalog: PlanCatalog | null;
  renewalAt: string | null;
  onBack: () => void;
  /** Runs the chosen offer; rejects with the cause's message. */
  onTake: (choice: PlusChoice) => Promise<'done' | 'switched'>;
  onCancelAnyway: () => void;
  initialState?: PlusCancelState;
  initialError?: string | null;
  /** Web, store-billed Plus: no offer can be taken here; say where to manage it. */
  storeManage?: StoreManage | null;
}) {
  const cards = plusOfferCards(catalog, renewalAt);
  const [choice, setChoice] = useState<PlusChoice>('switch_pro');
  const [state, setState] = useState<PlusCancelState>(initialState);
  const [error, setError] = useState<string | null>(initialError);
  const busy = useRef(false);
  const pending = state === 'pending';

  const take = async () => {
    if (busy.current || pending || state === 'success') return;
    busy.current = true;
    setState('pending'); // visible in the tap's frame
    setError(null);
    try {
      const out = await onTake(choice);
      setState(out === 'switched' ? 'success' : 'idle');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : null);
      setState('error');
    } finally {
      busy.current = false;
    }
  };

  if (state === 'success') {
    return (
      <div className="pc-step" data-plus-cancel="success">
        <div className="pc-done" role="status">
          <span className="pc-done-icon"><Icon name="check" size={28} /></span>
          <span className="pc-done-text">{switchedLine(catalog, renewalAt)}</span>
        </div>
      </div>
    );
  }

  if (storeManage) {
    return (
      <div className="pc-step" data-plus-cancel="store">
        <button type="button" className="pc-back" aria-label="Back" onClick={onBack}>
          <Icon name="arrow_back" size={24} />
        </button>
        <div className="pc-body">
          <StoreManageCard manage={storeManage} />
        </div>
        <div className="pc-actions">
          <button type="button" className="pc-later" onClick={onCancelAnyway}>{SEVEN_A.cancelAnyway}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pc-step" data-plus-cancel={state}>
      <button type="button" className="pc-back" aria-label="Back" onClick={onBack} disabled={pending}>
        <Icon name="arrow_back" size={24} />
      </button>
      <div className="pc-body">
        <h2 className="pc-title">{SEVEN_A.title}</h2>
        <p className="pc-sub">{SEVEN_A.sub}</p>
        <div role="radiogroup" aria-label={SEVEN_A.title} className={`pc-cards${pending ? ' is-frozen' : ''}`}>
          {cards.map((c) => {
            const on = choice === c.kind;
            return (
              <button key={c.kind} type="button" role="radio" aria-checked={on} className={`pc-card${on ? ' is-on' : ''}`} onClick={() => setChoice(c.kind)} data-offer={c.kind}>
                <span className="pc-card-top">
                  <span className="pc-card-title">{c.title}</span>
                  <Icon name={on ? 'radio_button_checked' : 'radio_button_unchecked'} size={22} className="pc-radio" />
                </span>
                <span><span className="pc-price">{c.price}</span><span className="pc-per">{c.per}</span></span>
                <span className="pc-card-body">{c.body}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="pc-actions">
        {state === 'error' && error && (
          <div className="pc-err" role="alert"><Icon name="error" size={20} /><span>{error}</span></div>
        )}
        <button type="button" className={`pc-gold${pending ? ' is-pending' : ''}`} onClick={() => void take()} aria-busy={pending || undefined}>
          {pending && <span className="pc-spin" aria-hidden />}
          {plusOfferCta(choice, catalog)}
        </button>
        <button type="button" className="pc-later" onClick={onCancelAnyway} disabled={pending}>{SEVEN_A.cancelAnyway}</button>
      </div>
    </div>
  );
}

/** 7B: replaces the pause card where the store can't pause (iOS). */
export function SeasonalSwitchCard({ catalog, renewalAt }: { catalog: PlanCatalog | null; renewalAt: string | null }) {
  const c = seasonalSwitchCard(catalog, renewalAt);
  if (!c) return null;
  return (
    <div className="pc-seasonal" data-plus-seasonal="">
      <div className="pc-seasonal-top"><Icon name="trending_down" size={22} className="pc-radio is-on" /><span className="pc-card-title">{c.title}</span></div>
      <span className="pc-card-body">{c.body}</span>
    </div>
  );
}

/** Web, store-billed Plus: the one thing to do, in the store the plan came from. */
export function StoreManageCard({ manage }: { manage: StoreManage }) {
  return (
    <a className="pc-card pc-store" href={manage.url} target="_blank" rel="noopener noreferrer" data-plus-store={manage.store}>
      <span className="pc-card-top">
        <span className="pc-card-title">{manage.line}</span>
        <Icon name="open_in_new" size={22} className="pc-radio is-on" />
      </span>
    </a>
  );
}
