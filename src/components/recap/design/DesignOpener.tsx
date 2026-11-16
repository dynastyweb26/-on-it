'use client';
// Slide 01, Overview (RecapPlayer.dc.html "01 OVERVIEW"). Weekly only: a month
// keeps its old opener (RULES 3, 12).
import type { SlideProps } from '@/components/recap/clock';
import { AFFIRMATIONS, compactMoney, money } from '@/components/recap/copy';
import { collectedOf, rangeLabel } from '@/components/recap/design/data';
import { iconStyle, s } from '@/components/recap/design/css';
import Stage from '@/components/recap/design/Stage';

const W = 390, H = 280, PAD = 8, SCALE = 1000;   // the design's curve box and its $1,000 floor
const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const CARD = 'padding:12px 14px;border-radius:16px;background:#fff;border:1px solid rgba(31,27,19,.08);box-shadow:0 12px 24px -20px rgba(115,92,0,.5)';
const CAP = 'font:600 10.5px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#735c00';
const NUM = 'margin-top:6px;font:800 26px/30px Montserrat,system-ui,sans-serif;letter-spacing:-.02em;font-variant-numeric:tabular-nums';

/** The design's smoothed curve through the day values. */
function curve(daily: number[]) {
  const n = daily.length;
  const mx = Math.max(SCALE, ...daily);
  const pts = daily.map((v, i): [number, number] => [PAD + (i + 0.5) * ((W - 2 * PAD) / n), H - (v / mx) * 215]);
  const all: [number, number][] = [[0, H], ...pts, [W, H]];
  let line = `M0,${H}`;
  for (let i = 1; i < all.length; i++) {
    const [x0, y0] = all[i - 1], [x1, y1] = all[i], h = (x1 - x0) / 2;
    line += ` C${(x0 + h).toFixed(1)},${y0.toFixed(1)} ${(x1 - h).toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return { line, area: `${line} Z`, pts };
}

export default function DesignOpener({ payload: p, clock, reduced, opens }: SlideProps) {
  const daily = p.daily.length === 7 ? p.daily : [];
  const c = curve(daily);
  const collected = collectedOf(p);
  const peak = collected > 0 ? p.peakDay : null;
  const peakPt = peak ? c.pts[peak.index] : null;
  const line = AFFIRMATIONS[(Math.max(1, opens) - 1) % AFFIRMATIONS.length];
  return (
    <Stage clock={clock} reduced={reduced}>
      <div data-slide="opener" style={s('position:absolute;inset:0')}>
        <div style={s('position:absolute;left:28px;right:28px;top:92px')}>
          <div data-a="up" data-d="0" style={s('font:600 12px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#735c00')}>Weekly recap</div>
          <h1 data-a="up" data-d="120" style={s('margin:14px 0 0;font:800 38px/42px Montserrat,system-ui,sans-serif;letter-spacing:-.02em')}>
            <span data-f="period_title">Your week:</span><br /><span data-f="period_range" style={s('color:#735c00')}>{rangeLabel(p)}</span>
          </h1>
          <div data-a="up" data-d="260" data-f="opener_line" style={s('margin-top:10px;font:400 15px/20px Inter,system-ui,sans-serif;color:#4d4635')}>{line}</div>
        </div>
        <div style={s('position:absolute;left:28px;right:28px;top:256px;display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
          <div data-a="pop" data-d="1500" style={s(CARD)}>
            <div style={s(CAP)}>Collected</div>
            <div data-a="count" data-v={collected} data-fmt="money" data-d="1500" data-dur="700" data-f="collected_total" style={s(NUM)}>{money(collected)}</div>
          </div>
          <div data-a="pop" data-d="1750" style={s(CARD)}>
            <div style={s(CAP)}>Spent</div>
            <div data-a="count" data-v={p.spend.total} data-fmt="money" data-d="1750" data-dur="700" data-f="spent_total" style={s(NUM)}>{money(p.spend.total)}</div>
          </div>
        </div>
        <div style={s('position:absolute;left:0;top:340px;width:390px;height:310px;pointer-events:none')}>
          <div data-a="wipe" data-d="500" data-dur="1300" style={s('position:absolute;inset:0;-webkit-mask-image:linear-gradient(180deg,#000 10%,rgba(0,0,0,.12) 92%);mask-image:linear-gradient(180deg,#000 10%,rgba(0,0,0,.12) 92%)')}>
            <svg width="390" height="310" style={s('display:block')}><path d={c.area} style={s('fill:#d4af37;opacity:.5')} /></svg>
          </div>
          <svg width="390" height="310" style={s('position:absolute;left:0;top:0;overflow:visible')}>
            <path data-a="draw" data-d="500" data-dur="1300" d={c.line} style={s('fill:none;stroke:#d4af37;stroke-opacity:.16;stroke-width:16;stroke-linecap:round;stroke-linejoin:round')} />
            <path data-a="draw" data-d="500" data-dur="1300" d={c.line} style={s('fill:none;stroke:#f1d57c;stroke-opacity:.6;stroke-width:7;stroke-linecap:round;stroke-linejoin:round')} />
            <path data-a="draw" data-d="500" data-dur="1300" d={c.line} style={s('fill:none;stroke:#b8952a;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round')} />
          </svg>
          <div data-a="gx" data-d="150" data-dur="800" style={s('position:absolute;left:0;right:0;top:279px;height:2px;transform-origin:left center;background:linear-gradient(90deg,rgba(212,175,55,0),#d4af37 10%,#d4af37 90%,rgba(212,175,55,0))')} />
          {LABELS.map((t, i) => c.pts[i] && (
            <span key={i} data-a="fade" data-d={900 + i * 60} data-dur="300"
              style={s(`position:absolute;top:290px;left:${c.pts[i][0] - 24}px;width:48px;text-align:center;font:600 11px/14px Inter,system-ui,sans-serif;color:#4d4635`)}>{t}</span>
          ))}
          {peak && peakPt && (
            <div data-a="pop" data-d="1500"
              style={s(`position:absolute;left:${Math.min(W - 84, Math.max(4, peakPt[0] - 40))}px;top:${peakPt[1] - 30}px;width:80px;text-align:center;font:700 13px/16px Montserrat,system-ui,sans-serif;color:#1f1b13`)}>
              <span data-f="peak_day_amount">{compactMoney(peak.amount)}</span>
            </div>
          )}
        </div>
        <div style={s('position:absolute;left:28px;right:28px;top:668px;display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
          <div data-a="pop" data-d="2000" style={s('padding:12px 14px;border-radius:16px;background:linear-gradient(180deg,#f1d57c,#d4af37);box-shadow:0 12px 24px -14px rgba(212,175,55,.8),inset 0 1px 0 rgba(255,255,255,.4)')}>
            <div style={s('font:600 10.5px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#1f1b13')}>Kept</div>
            <div data-a="count" data-v={p.net} data-fmt="money" data-d="2000" data-dur="700" data-f="kept_total" style={s(NUM)}>{money(p.net)}</div>
          </div>
          {p.invoicesSent != null && (
            <div data-a="pop" data-d="2250" style={s(CARD)}>
              <div style={s(CAP)}>Invoices sent</div>
              <div data-a="count" data-v={p.invoicesSent} data-fmt="int" data-d="2250" data-dur="600" data-f="invoices_sent_count" style={s(NUM)}>{p.invoicesSent}</div>
            </div>
          )}
        </div>
        <div data-a="fade" data-d="2700" data-dur="300" style={s('position:absolute;left:0;right:0;bottom:30px;display:flex;justify-content:center;align-items:center;gap:4px;font:600 12px/1 Inter,system-ui,sans-serif;color:#4d4635')}>
          Tap for the details<span style={iconStyle(16)}>chevron_right</span>
        </div>
      </div>
    </Stage>
  );
}
