'use client';

// One event card in the thread. Presentational only: it draws what
// src/lib/events.ts decided the event says, and hands a tap (and the one
// decision the card offers) back to the caller.
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
  action,
  className = '',
}: {
  event: EventRow;
  money: (n: number) => string;
  onOpen?: () => void;
  /** The single decision this card offers (signed → Convert, overdue → Send
   *  reminder). Absent on every other card: they are read-only. */
  action?: { label: string; onClick: () => void; busy?: boolean };
  className?: string;
}) {
  const card = eventCard(event, money);
  const gold = GOLD_TONES.has(card.tone);
  const accent = gold ? 'text-primary' : 'text-on-surface-variant';

  const body = (
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
  );

  const shell = `onit-nudge-in w-full rounded-2xl border border-outline-variant/60 bg-surface-container px-4 py-3 text-left ${className}`;

  return (
    <div className={shell}>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="block w-full text-left transition active:scale-[0.99]">
          {body}
        </button>
      ) : (
        body
      )}
      {action && (
        <div className="mt-2.5 flex justify-end">
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.busy}
            aria-busy={action.busy || undefined}
            className="rounded-full border border-primary/40 px-4 py-2 text-[13px] font-bold text-primary transition active:scale-95 disabled:opacity-50"
          >
            {action.busy ? 'Working…' : action.label}
          </button>
        </div>
      )}
    </div>
  );
}
