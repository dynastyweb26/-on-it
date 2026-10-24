'use client';

// Sticky bar (design spec §2.1.9): pending only, slides in once the hero has
// scrolled out of view, hidden while a sheet or the viewer is open.
import { money } from '@/lib/financials';
import s from './estimate.module.css';

export default function StickyBar({
  total,
  show,
  onSign,
  disabled = false,
}: {
  total: number;
  show: boolean;
  onSign: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`${s.stickyBar} ${show ? s.stickyBarVisible : ''}`} aria-hidden={!show}>
      <div>
        <div className={s.stickyLabel}>ESTIMATE TOTAL</div>
        <div className={s.stickyTotal}>{money(total)}</div>
      </div>
      <button
        type="button"
        className={s.stickyAction}
        onClick={onSign}
        disabled={disabled}
        tabIndex={show ? 0 : -1}
      >
        Review &amp; sign
      </button>
    </div>
  );
}
