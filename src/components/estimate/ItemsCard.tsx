'use client';

// Line items card (design spec §2.1.4): first three rows, tap a row to expand
// its 2-line description, View all / Show fewer, and the tinted totals block.
import { useState } from 'react';
import type { PublicEstimate } from '@/lib/estimates/types';
import { money } from '@/lib/financials';
import EstIcon from './EstIcon';
import { itemsLabel, lineAmount, lineDetail, lineMeta, taxRateLabel } from './model';
import s from './estimate.module.css';

export default function ItemsCard({ payload }: { payload: PublicEstimate }) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const total = payload.lineItems.length;
  const visible = showAll ? payload.lineItems : payload.lineItems.slice(0, 3);

  return (
    <section className={s.card} aria-label="Line items">
      <div className={s.sectionHead}>
        <span className={s.sectionTitle}>Line items</span>
        <span className={s.sectionCount}>{itemsLabel(total)}</span>
      </div>

      {visible.map((item, index) => {
        const detail = lineDetail(item);
        const isOpen = expanded === index;
        return (
          <button
            key={`${index}-${item.description}`}
            type="button"
            className={s.itemRow}
            aria-expanded={detail ? isOpen : undefined}
            onClick={() => detail && setExpanded(isOpen ? null : index)}
          >
            <span className={s.itemMain}>
              <span className={s.itemName}>{item.description}</span>
              <span className={s.itemAmount}>{money(lineAmount(item))}</span>
            </span>
            {detail && (
              <span className={`${s.itemDesc} ${isOpen ? '' : s.clamp2}`}>{detail}</span>
            )}
            <span className={s.itemMeta}>{lineMeta(item)}</span>
          </button>
        );
      })}

      {total > 3 && (
        <button type="button" className={s.toggleButton} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer items' : `View all ${total} items`}
          <EstIcon name="expand_more" size={18} />
        </button>
      )}

      <div className={s.totals}>
        <div className={s.totalRow}>
          <span>Subtotal</span>
          <span>{money(payload.subtotal)}</span>
        </div>
        <div className={s.totalRow}>
          <span>Tax ({taxRateLabel(payload.taxRate)})</span>
          <span>{money(payload.taxAmount)}</span>
        </div>
        <hr className={s.totalsDivider} />
        <div className={`${s.totalRow} ${s.totalRowStrong}`}>
          <span>Total</span>
          <span>{money(payload.total)}</span>
        </div>
      </div>
    </section>
  );
}
