'use client';
// 03 AI limit card — design/tiers/Tiers_1_Paywall_and_AI.dc.html §03.
// The assistant's answer to a question sent at the daily limit. The question
// stays in the thread; this card answers it. Reset time and the + reassurance
// first, the upgrade row last and only where there is a plan to move to.
// A second question the same day gets the collapsed one-line version.
//
// States: idle; pending (the paywall is opening — spinner in the button,
// repeat taps ignored through a synchronous ref); no upgrade row (Plus, or no
// target). Errors belong to the paywall it opens, not to this card.
import { useEffect, useRef, useState } from 'react';
import AssistantMark from '@/components/chat/AssistantMark';
import { LIMIT_COPY, usedAllLine, type UpgradeRow } from '@/lib/ai-meter-view';
import './ai-tiers.css';

export default function AiLimitCard({
  limit, collapsed = false, upgrade, onUpgrade, pending = false, live = false, showMark = true,
}: {
  limit: number;
  collapsed?: boolean;
  /** null hides the row (Plus, a founder, or no plan to open yet). */
  upgrade: UpgradeRow | null;
  onUpgrade?: () => void;
  /** The host's view: the paywall this card opened is still up. */
  pending?: boolean;
  /** Just arrived (not restored): the card plays its arrive motion. */
  live?: boolean;
  /** The monogram opens a run of On It's messages. */
  showMark?: boolean;
}) {
  const busy = useRef(false);
  const [tapped, setTapped] = useState(false);
  // Pending clears on every exit: the host closing the paywall ends it.
  useEffect(() => {
    if (!pending) { busy.current = false; setTapped(false); }
  }, [pending]);
  const isPending = tapped || pending;

  const tap = () => {
    if (busy.current || !onUpgrade) return;
    busy.current = true;
    setTapped(true); // visible in the same frame as the tap
    onUpgrade();
  };

  return (
    <div className={`ail-wrap${live ? ' ail-arrive' : ''}`} data-ai-limit={collapsed ? 'collapsed' : 'full'}>
      {showMark ? <AssistantMark /> : <span aria-hidden style={{ width: 22, flexShrink: 0 }} />}
      <div className="ail-card" role="group" aria-label={LIMIT_COPY.title}>
        {collapsed ? (
          <div className="ail-collapsed">
            <span className="material-symbols-outlined" aria-hidden>hourglass_bottom</span>
            {LIMIT_COPY.collapsed}
          </div>
        ) : (
          <>
            <div className="ail-head">
              <span className="ail-icon" aria-hidden><span className="material-symbols-outlined">hourglass_bottom</span></span>
              <div className="ail-text">
                <span className="ail-title">{LIMIT_COPY.title}</span>
                <span className="ail-body">{usedAllLine(limit)}</span>
              </div>
            </div>
            <div className="ail-row">
              <span className="material-symbols-outlined" aria-hidden>schedule</span>
              {LIMIT_COPY.reset}
            </div>
            <div className="ail-row is-wrap">
              <span className="material-symbols-outlined" aria-hidden>add_circle</span>
              <span>{LIMIT_COPY.plusMenu}</span>
            </div>
            {upgrade && onUpgrade && (
              <div className="ail-up">
                <div className="ail-up-top">
                  <span className="ail-up-label">
                    {upgrade.label}
                    <span className="ail-up-inline"> · {upgrade.price}</span>
                  </span>
                  <span className="ail-up-price">{upgrade.price}</span>
                </div>
                <button
                  type="button"
                  className={`ail-btn${isPending ? ' is-pending' : ''}`}
                  aria-busy={isPending || undefined}
                  onClick={tap}
                >
                  {isPending && <span className="ail-spinner" aria-hidden />}
                  {upgrade.cta}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
