'use client';

// One event card in the thread. Presentational only: it draws what
// src/lib/events.ts decided the event says, and hands a tap back to the caller.
//
// Same shell as the other in-chat cards (ChatNudgeCard anatomy: 2xl, hairline
// border, surface-container) so the feed cannot drift from the rest of the
// thread. No red in-app — gold is the only accent here; tone 'overdue' reads as
// emphasis, not alarm, and the client-facing pages keep their own colours.
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { eventCard, type EventRow } from '@/lib/events';

const GOLD_TONES = new Set(['gold', 'success']);

/** Local time for today, a short date before that. Never a relative phrase
 *  that goes stale in a restored thread. */
function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function EventCard({
  event,
  money,
  onOpen,
  className = '',
}: {
  event: EventRow;
  money: (n: number) => string;
  onOpen?: () => void;
  className?: string;
}) {
  const card = eventCard(event, money);
  const gold = GOLD_TONES.has(card.tone);
  const accent = gold ? 'text-primary' : 'text-on-surface-variant';

  const inner = (
    <>
      <div className="flex items-start gap-3">
        <Icon name={card.icon as IconName} size={18} className={`mt-0.5 shrink-0 ${accent}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-on-surface">{card.title}</p>
          {card.detail && (
            <p className="mt-0.5 truncate text-[13px] leading-snug text-on-surface-variant">{card.detail}</p>
          )}
        </div>
        <span className="shrink-0 pt-0.5 text-[11px] font-medium tabular-nums text-on-surface-variant/70">
          {stamp(event.occurred_at)}
        </span>
      </div>
    </>
  );

  const shell = `onit-nudge-in w-full rounded-2xl border border-outline-variant/60 bg-surface-container px-4 py-3 text-left ${className}`;

  if (!onOpen) return <div className={shell}>{inner}</div>;

  return (
    <button type="button" onClick={onOpen} className={`${shell} transition active:scale-[0.99]`}>
      {inner}
    </button>
  );
}
