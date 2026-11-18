'use client';
// The "N of these were picked up from your bank automatically." card at the
// foot of slides 02 (money in) and 03 (money out) — RecapPlayer.dc.html,
// `show.bankIn` / `show.bankOut`: only when the payload carries `bank` (RULE 7)
// and the bank produced at least one record on that side.
import { iconStyle, s } from '@/components/recap/design/css';
import { pickedVerb } from '@/components/recap/design/bank-view';

export default function BankPickedUp({ count, field, d }: { count: number; field: 'bank_auto_in_count' | 'bank_auto_out_count'; d: number }) {
  if (!(count > 0)) return null;
  return (
    <div data-a="up" data-d={d} style={s('display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:#fbf3e5;border:1px solid #d0c5af')}>
      <span style={s('width:36px;height:36px;border-radius:999px;background:#f0e3b8;color:#735c00;display:grid;place-items:center;flex:none')}>
        <span style={iconStyle(20)}>account_balance</span>
      </span>
      <div style={s('font:400 14px/19px Inter,system-ui,sans-serif;color:#4d4635')}>
        <b data-f={field} style={s('font:800 15px/19px Montserrat,system-ui,sans-serif;color:#1f1b13')}>{count}</b> of these {pickedVerb(count)} picked up from your bank automatically.
      </div>
    </div>
  );
}
