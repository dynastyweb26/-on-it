'use client';

// One event card in the thread (alive layer 07). Presentational: it draws what
// src/lib/events.ts says the event reads as. In its lane: the assistant's
// avatar, then a #FFFDF9 card (r18) with the same tinted tile as the toast.
// The whole card is tappable (pressed: scale .98, bg #F6EEDF). Only a signed
// estimate (Convert to invoice) and an overdue invoice (Send reminder) carry a
// gold button. Paid in full is the one celebration, played once, Direction A.
import { useRef } from 'react';
import Icon from '@/components/Icon';
import { eventAction, eventCard, type EventRow } from '@/lib/events';
import { EventTile } from '@/components/alive/EventParts';
import { useConvertState } from '@/components/alive/useConvert';
import { formatDocNumber } from '@/lib/documents';
import '@/components/alive/alive.css';

/** Clock time for the thread ("9:31 AM"); never a relative phrase that goes stale. */
function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function AssistantAvatar() {
  return <div className="al-av" aria-hidden />;
}

/** A plain assistant line in the thread, as the design's `.ba` bubble. */
export function AssistantLine({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingRight: 34 }} className="al-fade-up">
      <AssistantAvatar />
      <div
        style={{
          background: '#f4ebdd', border: '1px solid #e7dac4', borderRadius: 18, padding: '10px 14px',
          font: "400 15.5px/1.4 var(--font-inter), system-ui", color: 'var(--al-ink)', textWrap: 'pretty',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function EventCard({
  event,
  money,
  onOpen,
  onRemind,
  onConvert,
  className = '',
}: {
  event: EventRow;
  money: (n: number) => string;
  onOpen?: () => void;
  /** Overdue: lands on the invoice, where Request balance is the existing re-share. */
  onRemind?: () => void;
  /** Signed: runs the conversion in place (idempotent), then shows the check row. */
  onConvert?: () => void;
  className?: string;
}) {
  const card = eventCard(event, money, { when: clock(event.occurred_at) });
  const action = eventAction(String(event.kind));
  const conv = useConvertState(event);
  // A card that arrives unseen plays its moment once; a restored one is static.
  const fresh = useRef(!event.seen_at).current;

  const open = (ev: React.MouseEvent) => {
    if ((ev.target as HTMLElement).closest('[data-card-action]')) return;
    onOpen?.();
  };
  const tappable = Boolean(onOpen);

  // ── Paid in full: the earned moment (04, Direction A) ──
  if (event.kind === 'paid_in_full') {
    return (
      <div className={`${fresh ? 'al-fade-up' : ''} ${className}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <AssistantAvatar />
        <div
          className={`al-wcard${tappable ? ' al-press' : ''}`}
          onClick={open}
          style={{ flex: 1, minWidth: 0, padding: '16px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: tappable ? 'pointer' : undefined }}
        >
          <div style={{ position: 'relative', width: 56, height: 56 }}>
            {fresh && (
              <div className="al-anim" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--al-gold)', animation: 'al-halo-once .9s ease-out both' }} />
            )}
            <div
              className="al-anim"
              style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--al-gold)', display: 'grid', placeItems: 'center', animation: fresh ? 'al-ring-once .4s cubic-bezier(.2,.9,.3,1.2) both' : undefined }}
            >
              <svg width="28" height="28" viewBox="0 0 40 40" aria-hidden>
                <path
                  className="al-anim-ck"
                  d="M10 21l6.5 6.5L30 14" fill="none" stroke="#1e1a15" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="40"
                  style={fresh ? { animation: 'al-ck-once .36s ease-out .12s both' } : undefined}
                />
              </svg>
            </div>
          </div>
          <div className="al-h" style={{ fontSize: 19, marginTop: 10 }}>Paid in full</div>
          <div style={{ font: "400 13px var(--font-inter), system-ui", color: 'var(--al-mute)', marginTop: 2 }}>
            {[(event.client_name ?? '').trim() || 'Your client', event.document_number != null ? formatDocNumber(event.document_kind, event.document_number) : null, typeof event.amount === 'number' ? money(event.amount) : null, 'balance $0.00'].filter(Boolean).join(' · ')}
          </div>
          <span
            className="al-chip al-anim"
            style={{ background: 'var(--al-green-bg)', color: 'var(--al-green)', marginTop: 10, animation: fresh ? 'al-pop-in .3s .4s both' : undefined }}
          >
            <Icon name="verified" size={14} />Paid
          </span>
        </div>
      </div>
    );
  }

  // ── Deposit: meta line, title + chip, detail (04 "in chat") ──
  if (card.chip) {
    return (
      <div className={`${fresh ? 'al-fade-up' : ''} ${className}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <AssistantAvatar />
        <div
          className={`al-wcard${tappable ? ' al-press' : ''}`}
          onClick={open}
          style={{ flex: 1, minWidth: 0, padding: 14, cursor: tappable ? 'pointer' : undefined }}
        >
          <div className="al-meta" style={{ marginBottom: 8 }}>{card.metaLabel} · {clock(event.occurred_at)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div className="al-tt">{card.title}</div>
            <span className="al-chip al-chip--sm" style={{ background: 'var(--al-gold-soft)', color: 'var(--al-gold-text)' }}>{card.chip}</span>
          </div>
          <div style={{ font: "400 13px var(--font-inter), system-ui", color: 'var(--al-mute)', marginTop: 4 }}>{card.detail}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${fresh ? 'al-fade-up' : ''} ${className}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <AssistantAvatar />
      <div
        className={`al-wcard${tappable ? ' al-press' : ''}`}
        onClick={open}
        style={{ flex: 1, minWidth: 0, overflow: 'hidden', cursor: tappable ? 'pointer' : undefined }}
      >
        <div className="al-trow" style={{ padding: '12px 14px' }}>
          <EventTile card={card} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="al-tt">{card.title}</div>
            {card.detail && <div className="al-td" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.detail}</div>}
          </div>
          {tappable && <span style={{ color: 'var(--al-faint)', display: 'inline-flex' }}><Icon name="chevron_right" size={18} /></span>}
        </div>
        {card.bar && (
          <div style={{ padding: '0 14px 12px' }}>
            <div className="al-pbar" style={{ height: 6 }}>
              <div className="al-pfill al-anim" style={{ width: `${card.bar.pct}%`, animation: fresh ? 'al-grow .8s cubic-bezier(.2,.8,.2,1)' : undefined }} />
            </div>
          </div>
        )}
        {action === 'convert' && (
          <div style={{ padding: '0 14px 12px' }}>
            {conv.phase === 'done' ? (
              <div className="al-fade-up" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="al-pop-in" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--al-gold)', display: 'grid', placeItems: 'center', flex: 'none' }}>
                  <Icon name="check" size={17} />
                </div>
                <div style={{ flex: 1, font: "600 14px var(--font-inter), system-ui" }}>
                  {conv.number != null ? `${formatDocNumber('invoice', conv.number)} created` : 'Invoice created'}
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  data-card-action
                  className="al-btn-g"
                  style={{ height: 38, fontSize: 14, width: '100%' }}
                  disabled={conv.phase === 'busy'}
                  aria-busy={conv.phase === 'busy' || undefined}
                  onClick={onConvert}
                >
                  {conv.phase === 'busy' ? (<><span className="al-spinner" style={{ width: 15, height: 15 }} />Creating invoice…</>) : (<><Icon name="swap_horiz" size={18} />Convert to invoice</>)}
                </button>
                {conv.phase === 'error' && (
                  <div role="alert" style={{ font: "400 12.5px var(--font-inter), system-ui", color: 'var(--al-rust)', marginTop: 6 }}>{conv.message}</div>
                )}
              </>
            )}
          </div>
        )}
        {action === 'remind' && (
          <div style={{ padding: '0 14px 12px' }}>
            <button type="button" data-card-action className="al-btn-g" style={{ height: 38, fontSize: 14, width: '100%' }} onClick={onRemind}>
              <Icon name="notifications_active" size={18} />Send reminder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
