'use client';
// Slide 03, Money out (RecapPlayer.dc.html "03 MONEY OUT"), with the designed
// "nothing spent" state. The bank strip is not drawn (RULE 7).
import type { SlideProps } from '@/components/recap/clock';
import { money, per } from '@/components/recap/copy';
import { categoryLabel } from '@/lib/recap/categories';
import { iconStyle, s } from '@/components/recap/design/css';
import Stage from '@/components/recap/design/Stage';

const DC = ['#d4af37', '#2f8a83', '#c0693f', '#5b77a8', '#6f8c5c'];
const C1 = 2 * Math.PI * 60;
const BOX = 'border-radius:20px;background:#fff;border:1px solid rgba(31,27,19,.08);box-shadow:0 18px 36px -24px rgba(115,92,0,.45)';

export default function DesignOut({ payload: p, clock, reduced }: SlideProps) {
  const cats = p.spend.categories;
  const ct = cats.reduce((a, c) => a + c.amount, 0) || 1;   // ring shares, not a reported number
  let acc = 0;
  const ring = cats.map((c, i) => {
    const fr = c.amount / ct, vis = Math.max(0, fr * C1 - (cats.length > 1 ? 3 : 0)), start = acc;
    acc += fr;
    return { key: c.key, len: vis, d: Math.round(900 + start * 1000), dur: Math.max(120, Math.round(fr * 1000)),
      st: { fill: 'none', stroke: DC[i % 5], strokeWidth: 16, strokeDasharray: `${vis.toFixed(2)} ${C1.toFixed(2)}`,
        transform: `rotate(${(start * 360).toFixed(2)}deg)`, transformOrigin: '75px 75px' } as const };
  });
  const rows = cats.slice(0, 3);
  // Categories the four named ones and "other" hide ("+2 more categories").
  const named = cats.filter((c) => c.key !== 'other').length;
  const more = Math.max(0, named + (p.spend.moreCategories ?? 0) - 3);
  const spent = p.spend.total;
  const v = p.topVendor;
  return (
    <Stage clock={clock} reduced={reduced}>
      <div data-slide="out" style={s('position:absolute;inset:0')}>
        <div style={s('position:absolute;left:28px;right:28px;top:92px;bottom:36px;display:flex;flex-direction:column')}>
          <div data-a="up" data-d="0" style={s('font:600 12px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#735c00')}>Money out</div>
          <div data-a="up" data-d="100" style={s('margin-top:18px;font:700 22px/28px Montserrat,system-ui,sans-serif')}>You spent</div>
          <div data-a="count" data-v={spent} data-fmt="money" data-d="250" data-dur="1400" data-fit="88" data-f="spent_total"
            style={s('margin-top:6px;font:800 88px/92px Montserrat,system-ui,sans-serif;letter-spacing:-.03em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden')}>{money(spent)}</div>
          {spent > 0 && cats.length > 0 && (
            <>
              <div style={s('margin-top:26px;display:flex;align-items:center;gap:18px')}>
                <div style={s('position:relative;width:150px;height:150px;flex:none')}>
                  <svg width="150" height="150" style={s('position:absolute;inset:0;transform:rotate(-90deg);overflow:visible')}>
                    <circle cx="75" cy="75" r="60" style={s('fill:none;stroke:#efe6d6;stroke-width:16')} />
                    {ring.map((c) => (
                      <circle key={c.key} data-a="draw" data-len={c.len} data-d={c.d} data-dur={c.dur} data-ease="linear" cx="75" cy="75" r="60" style={c.st} />
                    ))}
                  </svg>
                  <div data-a="up" data-d="1900" style={s('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px')}>
                    <span data-f="top_category_name" style={s('font:600 10.5px/1 Inter,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#4d4635;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{categoryLabel(cats[0].key)}</span>
                    <b data-f="top_category_pct" style={s('font:800 28px/30px Montserrat,system-ui,sans-serif')}>{Math.round((cats[0].amount / ct) * 100)}%</b>
                  </div>
                </div>
                <div style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:12px')}>
                  {rows.map((c, i) => (
                    <div key={c.key} data-a="left" data-d={1300 + i * 150}>
                      <div style={s('display:flex;align-items:center;gap:7px;font:400 13px/18px Inter,system-ui,sans-serif;color:#4d4635')}>
                        <i style={s(`width:9px;height:9px;border-radius:3px;background:${DC[i]};flex:none`)} />
                        <span data-f="category_name" style={s('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{categoryLabel(c.key)}</span>
                        <b data-f="category_amount" style={s('font:700 14px/18px Montserrat,system-ui,sans-serif;color:#1f1b13;font-variant-numeric:tabular-nums')}>{money(c.amount)}</b>
                      </div>
                      <div style={s('margin-top:5px;height:6px;border-radius:999px;background:#efe6d6;overflow:hidden')}>
                        <i data-a="gx" data-d={1500 + i * 150} data-dur="600"
                          style={s(`display:block;height:100%;width:${(c.amount / cats[0].amount) * 100}%;background:${DC[i]};border-radius:999px;transform-origin:left center`)} />
                      </div>
                    </div>
                  ))}
                  {more > 0 && (
                    <div data-a="fade" data-d="2000" data-dur="300" data-f="more_categories_count" style={s('font:600 12px/1 Inter,system-ui,sans-serif;color:#4d4635')}>
                      +{more} more {more === 1 ? 'category' : 'categories'}
                    </div>
                  )}
                </div>
              </div>
              {v && (
                <div data-a="up" data-d="2100" style={s(`margin-top:24px;padding:16px 18px;${BOX};font:400 15px/22px Inter,system-ui,sans-serif;color:#4d4635;text-wrap:pretty`)}>
                  Most of it at <b data-f="top_vendor_name" style={s('font:700 15px/22px Montserrat,system-ui,sans-serif;color:#1f1b13')}>{v.name}</b>:{' '}
                  <span data-f="top_vendor_amount">{money(v.amount)}</span>{' '}
                  <span data-f="top_vendor_trips">{v.tripCount === 1 ? 'in one trip' : `across ${v.tripCount} trips`}</span>.
                </div>
              )}
            </>
          )}
          {spent <= 0 && (
            <div data-a="up" data-d="1300" style={s(`margin-top:30px;padding:22px 20px;${BOX};display:flex;gap:14px;align-items:center`)}>
              <span data-a="pop" data-d="1600" style={s('width:48px;height:48px;border-radius:999px;background:#e3efe3;color:#2e6b3f;display:grid;place-items:center;flex:none')}>
                <span style={iconStyle(26)}>savings</span>
              </span>
              <div>
                <div style={s('font:700 17px/22px Montserrat,system-ui,sans-serif')}>Nothing spent this {per(p)}.</div>
                <div style={s('margin-top:3px;font:400 14px/20px Inter,system-ui,sans-serif;color:#4d4635')}>Everything that came in, stayed in.</div>
              </div>
            </div>
          )}
          <div style={s('flex:1 1 0')} />
        </div>
      </div>
    </Stage>
  );
}
