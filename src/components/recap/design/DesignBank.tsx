'use client';
// Slide 07, Bank activity (RecapPlayer.dc.html "07 BANK ACTIVITY"). Only in the
// sequence when the payload carries `bank` and the bank produced at least one
// record (RULE 7, the design's keys()). Counts only: the slide prints no money.
import type { SlideProps } from '@/components/recap/clock';
import { per } from '@/components/recap/copy';
import { iconStyle, s } from '@/components/recap/design/css';
import Stage from '@/components/recap/design/Stage';
import { bankDots, pickedVerb } from '@/components/recap/design/bank-view';

export default function DesignBank({ payload: p, clock, reduced }: SlideProps) {
  const b = p.bank;
  if (!b) return null;
  const autoVerb = pickedVerb(b.auto);
  return (
    <Stage clock={clock} reduced={reduced}>
      <div data-slide="bank" style={s('position:absolute;inset:0')}>
        <div style={s('position:absolute;left:28px;right:28px;top:92px;bottom:36px;display:flex;flex-direction:column')}>
          <div data-a="up" data-d="0" style={s('font:600 12px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#735c00')}>Bank activity</div>
          <div data-a="up" data-d="100" style={s('margin-top:18px;font:700 20px/26px Montserrat,system-ui,sans-serif;text-wrap:pretty')}>
            <span data-f="activity_total">{b.total}</span> payments and expenses this {per(p)}.
          </div>
          <div data-a="count" data-v={b.auto} data-fmt="int" data-d="400" data-dur="1200" data-f="bank_auto_count"
            style={s('margin-top:14px;font:800 120px/118px Montserrat,system-ui,sans-serif;letter-spacing:-.04em;font-variant-numeric:tabular-nums')}>{b.auto}</div>
          <div data-a="up" data-d="800" style={s('margin-top:4px;font:700 22px/28px Montserrat,system-ui,sans-serif;text-wrap:pretty')}>
            of these {autoVerb} picked up from your bank automatically.
          </div>
          <div style={s('margin-top:26px;display:flex;flex-wrap:wrap;gap:6px')}>
            {bankDots(b.total, b.auto).map((dot, i) => (
              <i key={i} data-a="pop" data-d={dot.d} data-dur="260"
                style={s(`width:16px;height:16px;border-radius:999px;background:${dot.bank ? '#d4af37' : '#e1d9cc'};display:block`)} />
            ))}
          </div>
          <div data-a="fade" data-d="2300" data-dur="300" style={s('margin-top:14px;display:flex;gap:16px;font:400 13px/16px Inter,system-ui,sans-serif;color:#4d4635')}>
            <span style={s('display:flex;align-items:center;gap:6px')}><i style={s('width:10px;height:10px;border-radius:999px;background:#d4af37')} />From your bank</span>
            <span style={s('display:flex;align-items:center;gap:6px')}><i style={s('width:10px;height:10px;border-radius:999px;background:#e1d9cc')} />Added by you</span>
          </div>
          <div style={s('flex:1 1 0')} />
          <div data-a="up" data-d="2400" style={s('display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:20px;background:#fff;border:1px solid rgba(31,27,19,.08);box-shadow:0 18px 36px -24px rgba(115,92,0,.45)')}>
            <span style={s('width:40px;height:40px;border-radius:999px;background:#f0e3b8;color:#735c00;display:grid;place-items:center;flex:none')}>
              <span style={iconStyle(22)}>account_balance</span>
            </span>
            <div style={s('flex:1;min-width:0')}>
              <div data-f="bank_name · bank_last4" style={s('font:700 15px/20px Montserrat,system-ui,sans-serif')}>{b.name}</div>
              <div style={s('font:400 13px/18px Inter,system-ui,sans-serif;color:#4d4635')}>
                <span data-f="bank_auto_in_count">{b.autoIn}</span> money in · <span data-f="bank_auto_out_count">{b.autoOut}</span> money out
              </div>
            </div>
          </div>
        </div>
      </div>
    </Stage>
  );
}
