'use client';

// Shared pieces of the event toast and the in-chat event card (alive layer
// 01 + 07): the tinted tile, the title/detail block with the partial-payment bar.
// Values are the design's; tints come from alive.css (--al-*).
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import type { EventCardModel, EventTint } from '@/lib/events';

const TINTS: Record<EventTint, { bg: string; fg: string }> = {
  signed: { bg: 'var(--al-green-bg)', fg: 'var(--al-green)' },
  paid: { bg: 'var(--al-gold-soft)', fg: 'var(--al-gold-text)' },
  deposit: { bg: 'var(--al-gold-soft)', fg: 'var(--al-gold-text)' },
  partial: { bg: 'var(--al-gold-soft2)', fg: 'var(--al-gold-text)' },
  overdue: { bg: 'var(--al-rust-bg)', fg: 'var(--al-rust)' },
  view: { bg: 'var(--al-neutral-bg)', fg: 'var(--al-ink2)' },
};

export function EventTile({ card, size = 40 }: { card: Pick<EventCardModel, 'tint' | 'icon'>; size?: 40 | 36 | 34 }) {
  const t = TINTS[card.tint];
  const glyph = size === 40 ? 22 : size === 36 ? 20 : 19;
  const cls = size === 36 ? 'al-tile al-tile--36' : 'al-tile';
  return (
    <div
      className={cls}
      style={{ background: t.bg, color: t.fg, ...(size === 34 ? { width: 34, height: 34, fontSize: 19 } : null) }}
    >
      <Icon name={card.icon as IconName} size={glyph} />
    </div>
  );
}

/** Title, detail and (for a partial payment) the 5px bar. */
export function EventText({ card, compact = false, animateBar = false }: { card: EventCardModel; compact?: boolean; animateBar?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="al-tt" style={compact ? { fontSize: 14 } : undefined}>{card.title}</div>
      {card.detail && (
        <div className="al-td" style={{ ...(compact ? { fontSize: 12 } : null), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {card.detail}
        </div>
      )}
      {card.bar && (
        <div className="al-pbar" style={{ height: 5, marginTop: 7 }}>
          <div
            className="al-pfill al-anim"
            style={{ width: `${card.bar.pct}%`, ...(animateBar ? { animation: 'al-grow .8s cubic-bezier(.2,.8,.2,1)' } : null) }}
          />
        </div>
      )}
    </div>
  );
}

export function Chevron() {
  return <Icon name="chevron_right" size={18} className="shrink-0" />;
}
