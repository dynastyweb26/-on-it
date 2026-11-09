'use client';

// The locked "Ready to share" estimate card in the thread (alive layer 02 + 03).
// Presentational; the thread supplies the data and the two slots it already
// owns (the photos, and Copy link / Share with their flip confirmation).
//
// 02: chip "● Ready to share" + E-number, client h19, "Estimate · N items ·
//     valid until Dec 7", the total at 30px; the Preview | Revise footer.
// 03: the line items as a three-column grid, `18px · minmax(0,1fr) · auto`, gap
//     3px 10px. The description clamps at 3 lines and gives up its width; the
//     price sizes to its content, never wraps or clips ($10,000.00+ still fits
//     at 390px). Qty × rate sits under the description.
import { useState, type ReactNode } from 'react';
import Icon from '@/components/Icon';
import { AssistantAvatar } from '@/components/chat/EventCard';
import { calculateLineAmount, money } from '@/lib/financials';
import { unitLabel } from '@/lib/line-units';
import type { LineItem } from '@/lib/ai';
import '@/components/alive/alive.css';

const inter = (css: string) => `${css} var(--font-inter), system-ui, sans-serif`;
const mono = { fontFamily: 'var(--font-plex-mono), ui-monospace, monospace' } as const;

const validText = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? null : `valid until ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
};

function Row({ index, item, last }: { index: number; item: LineItem; last: boolean }) {
  const [open, setOpen] = useState(false);
  const amount = calculateLineAmount(Number(item.qty), Number(item.unit_price));
  return (
    <div
      onClick={() => setOpen((o) => !o)}
      style={{
        display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) auto', gap: '3px 10px', padding: '10px 4px',
        borderBottom: last ? undefined : '1px solid var(--al-hair)', alignItems: 'start', cursor: 'pointer',
      }}
    >
      <span style={{ ...mono, color: 'var(--al-meta)', fontSize: 12.5, paddingTop: 2 }}>{index + 1}.</span>
      <span
        style={{
          font: inter('600 14.5px/1.35'), textWrap: 'pretty',
          ...(open ? null : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
        }}
      >
        {item.description}
      </span>
      <span style={{ font: inter('700 14.5px/1.35'), whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{money(amount)}</span>
      <span />
      <span style={{ fontSize: 12.5, color: '#7a7166' }}>{Number(item.qty)} {unitLabel(item.unit ?? null)} × {money(Number(item.unit_price))}</span>
      <span />
    </div>
  );
}

export default function ReadyEstimateCard({
  docNumber, clientName, items, photoCount, validUntil, total, photos, actions, onPreview, onRevise, className = '',
}: {
  docNumber: string;
  clientName: string;
  items: LineItem[];
  photoCount: number;
  validUntil: string | null;
  total: number;
  /** The existing read-only photo grid, unchanged. */
  photos?: ReactNode;
  /** Copy link / Share (with the flip confirmation and the URL line). */
  actions: ReactNode;
  onPreview: () => void;
  onRevise: () => void;
  className?: string;
}) {
  const sub = [
    'Estimate',
    `${items.length} ${items.length === 1 ? 'item' : 'items'}`,
    photoCount > 0 ? `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}` : null,
    validText(validUntil),
  ].filter(Boolean).join(' · ');

  return (
    <div className={`al-fade-up ${className}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <AssistantAvatar />
      <div className="al-wcard" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="al-chip" style={{ background: 'var(--al-gold-soft)', color: 'var(--al-gold-text)' }}>● Ready to share</span>
            <span style={{ ...mono, fontSize: 12, color: 'var(--al-mute)' }}>{docNumber}</span>
          </div>
          <div className="al-h" style={{ fontSize: 19, marginTop: 12 }}>{clientName}</div>
          <div style={{ fontSize: 13, color: 'var(--al-mute)', marginTop: 2 }}>{sub}</div>
          {items.length === 0 && (
            <div className="al-h" style={{ fontSize: 30, color: 'var(--al-gold-num)', marginTop: 10 }}>{money(total)}</div>
          )}
        </div>

        {photos && <div style={{ padding: '0 14px 12px' }}>{photos}</div>}

        {items.length > 0 && (
          <>
            <div style={{ padding: '4px 14px 6px', display: 'flex', justifyContent: 'space-between' }}>
              <span className="al-meta" style={{ color: 'var(--al-ink2)' }}>Line items</span>
              <span style={{ fontSize: 12.5, color: '#7a7166' }}>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
            </div>
            <div style={{ padding: '0 10px' }}>
              {items.map((it, i) => <Row key={`${i}-${it.description}`} index={i} item={it} last={i === items.length - 1} />)}
            </div>
            <div style={{ background: 'var(--al-card-bg)', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--al-card-line)' }}>
              <span style={{ font: inter('700 14px') }}>Total</span>
              <span className="al-h" style={{ fontSize: 22, color: 'var(--al-gold-num)' }}>{money(total)}</span>
            </div>
          </>
        )}

        <div style={{ padding: '12px 14px 12px' }}>{actions}</div>

        <div style={{ display: 'flex', gap: 18, padding: '10px 14px 14px', borderTop: '1px solid var(--al-hair)', font: inter('600 13.5px'), color: 'var(--al-ink2)' }}>
          <button type="button" onClick={onPreview} style={{ display: 'flex', gap: 5, alignItems: 'center', background: 'none', border: 0, padding: '4px 0', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
            <Icon name="visibility" size={18} />Preview
          </button>
          <button type="button" onClick={onRevise} style={{ display: 'flex', gap: 5, alignItems: 'center', background: 'none', border: 0, padding: '4px 0', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
            <Icon name="edit" size={18} />Revise
          </button>
        </div>
      </div>
    </div>
  );
}
