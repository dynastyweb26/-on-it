'use client';
// Slide 04, What you kept (RecapPlayer.dc.html "04 KEPT"). Kept is the payload's
// net; a week that spent more than it collected draws the design as-is: an
// empty ring plus the change chip (RULE 11). The encouragement line has no
// payload field, so it is not drawn.
import type { SlideProps } from '@/components/recap/clock';
import { changeLine, money } from '@/components/recap/copy';
import { collectedOf } from '@/components/recap/design/data';
import { iconStyle, s } from '@/components/recap/design/css';
import Stage from '@/components/recap/design/Stage';

const C2 = 2 * Math.PI * 110;
const BOX = 'flex:1;min-width:0;padding:10px 14px;border-radius:14px;background:#fff;border:1px solid rgba(31,27,19,.08)';
const BOX_LABEL = 'font:600 11px/14px Inter,system-ui,sans-serif;color:#4d4635';
const BOX_NUM = 'font:800 20px/24px Montserrat,system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden';

export default function DesignKept({ payload: p, clock, reduced }: SlideProps) {
  const collected = collectedOf(p), kept = p.net, spent = p.spend.total;
  const kf = Math.min(1, Math.max(0, kept) / Math.max(1, collected));   // the ring's fill, not a reported number
  const kl = kf * C2;
  const arc = (w: number, o: number) =>
    ({ fill: 'none', stroke: '#d4af37', strokeOpacity: o, strokeWidth: w, strokeLinecap: kf > 0 ? 'round' : 'butt', strokeDasharray: `${kl.toFixed(2)} ${C2.toFixed(2)}` }) as const;
  const ch = changeLine(p);
  return (
    <Stage clock={clock} reduced={reduced}>
      <div data-slide="kept" style={s('position:absolute;inset:0')}>
        <div style={s('position:absolute;left:28px;right:28px;top:92px;bottom:36px;display:flex;flex-direction:column;align-items:center')}>
          <div data-a="up" data-d="0" style={s('align-self:stretch;font:600 12px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#735c00')}>What you kept</div>
          <div data-a="up" data-d="100" style={s('align-self:stretch;margin-top:18px;font:700 22px/28px Montserrat,system-ui,sans-serif')}>You kept</div>
          <div style={s('align-self:stretch;margin-top:20px;display:flex;align-items:center;gap:10px')}>
            <div data-a="up" data-d="300" style={s(BOX)}>
              <div style={s(BOX_LABEL)}>Money in</div>
              <div data-a="count" data-v={collected} data-fmt="money" data-d="300" data-dur="500" data-fit="20" data-f="collected_total" style={s(BOX_NUM)}>{money(collected)}</div>
            </div>
            <span data-a="pop" data-d="550" style={s('font:800 22px/1 Montserrat,system-ui,sans-serif;color:#735c00')}>−</span>
            <div data-a="up" data-d="700" style={s(BOX)}>
              <div style={s(BOX_LABEL)}>Money out</div>
              <div data-a="count" data-v={spent} data-fmt="money" data-d="700" data-dur="500" data-fit="20" data-f="spent_total" style={s(BOX_NUM)}>{money(spent)}</div>
            </div>
          </div>
          <div style={s('position:relative;width:260px;height:260px;margin-top:34px;flex:none')}>
            <div style={s('position:absolute;inset:32px;border-radius:999px;background:radial-gradient(circle at 50% 35%,#fff,#fbf2e3 70%);box-shadow:0 24px 50px -20px rgba(115,92,0,.35),inset 0 -6px 16px rgba(115,92,0,.08)')} />
            <svg width="260" height="260" style={s('position:absolute;inset:0;transform:rotate(-90deg);overflow:visible')}>
              <circle cx="130" cy="130" r="110" style={s('fill:none;stroke:#efe6d6;stroke-width:22')} />
              <circle data-a="draw" data-len={kl} data-d="1000" data-dur="1500" cx="130" cy="130" r="110" style={arc(38, 0.16)} />
              <circle data-a="draw" data-len={kl} data-d="1000" data-dur="1500" cx="130" cy="130" r="110" style={arc(22, 1)} />
            </svg>
            <div style={s('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px')}>
              <div data-a="count" data-v={kept} data-fmt="money" data-d="1000" data-dur="1500" data-fit="54" data-f="kept_total"
                style={s('width:176px;text-align:center;overflow:hidden;white-space:nowrap;font:800 54px/58px Montserrat,system-ui,sans-serif;letter-spacing:-.03em;font-variant-numeric:tabular-nums')}>{money(kept)}</div>
              <div data-a="up" data-d="1900" style={s('font:400 14px/20px Inter,system-ui,sans-serif;color:#4d4635')}>of <span data-f="collected_total">{money(collected)}</span> collected</div>
            </div>
          </div>
          {ch && (
            <div data-a="pop" data-d="2500"
              style={s(`margin-top:30px;height:40px;padding:0 16px;border-radius:999px;font:600 15px/1 Inter,system-ui,sans-serif;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;background:${ch.dir === 'up' ? '#e3efe3' : '#efe8dc'};color:${ch.dir === 'up' ? '#2e6b3f' : '#4d4635'}`)}>
              <span style={iconStyle(20)}>{ch.dir === 'up' ? 'trending_up' : ch.dir === 'down' ? 'trending_down' : 'trending_flat'}</span>
              <span data-f="change_vs_last_period">{ch.text}</span>
            </div>
          )}
        </div>
      </div>
    </Stage>
  );
}
