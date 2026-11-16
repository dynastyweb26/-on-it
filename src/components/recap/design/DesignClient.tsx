'use client';
// Slide 06, Top client (RecapPlayer.dc.html "06 TOP CLIENT"). Only in the
// sequence when the payload names one. A payload stored before the percentage
// or the invoice count existed leaves that piece out.
import type { SlideProps } from '@/components/recap/clock';
import { money, per, plural } from '@/components/recap/copy';
import { iconStyle, s } from '@/components/recap/design/css';
import Stage from '@/components/recap/design/Stage';

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default function DesignClient({ payload: p, clock, reduced }: SlideProps) {
  const c = p.topClient;
  if (!c) return null;
  return (
    <Stage clock={clock} reduced={reduced}>
      <div data-slide="client" style={s('position:absolute;inset:0')}>
        <div style={s('position:absolute;left:28px;right:28px;top:92px;bottom:36px;display:flex;flex-direction:column;align-items:center;text-align:center')}>
          <div data-a="up" data-d="0" style={s('align-self:stretch;text-align:left;font:600 12px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#735c00')}>Top client of the {per(p)}</div>
          <div style={s('position:relative;margin-top:56px;width:148px;height:148px;flex:none')}>
            <div data-a="pop" data-d="250" data-dur="600" style={s('position:absolute;inset:-34px;border-radius:999px;background:radial-gradient(closest-side,rgba(240,205,110,.5),rgba(212,175,55,.18) 55%,rgba(212,175,55,0))')} />
            <div data-a="pop" data-d="300" data-dur="600"
              style={s('position:absolute;inset:0;border-radius:999px;background:linear-gradient(160deg,#f1d57c,#d4af37 55%,#b8952a);box-shadow:0 24px 40px -18px rgba(115,92,0,.6),inset 0 2px 0 rgba(255,255,255,.45);display:grid;place-items:center;font:800 52px/1 Montserrat,system-ui,sans-serif;letter-spacing:-.02em;color:#1f1b13')}>
              <span data-f="top_client_initials">{initialsOf(c.name)}</span>
            </div>
          </div>
          <h2 data-a="up" data-d="700" data-f="top_client_name"
            style={s('margin:30px 0 0;max-width:100%;font:800 30px/36px Montserrat,system-ui,sans-serif;letter-spacing:-.015em;text-wrap:balance;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden')}>{c.name}</h2>
          <div data-a="up" data-d="950" style={s('margin-top:14px;font:400 15px/20px Inter,system-ui,sans-serif;color:#4d4635')}>paid you</div>
          <div data-a="count" data-v={c.amount} data-fmt="money" data-d="1050" data-dur="1100" data-fit="68" data-f="top_client_amount"
            style={s('margin-top:2px;width:100%;font:800 68px/72px Montserrat,system-ui,sans-serif;letter-spacing:-.03em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden')}>{money(c.amount)}</div>
          {!!c.invoiceCount && (
            <div data-a="pop" data-d="2100" style={s('margin-top:18px;height:36px;padding:0 14px;border-radius:999px;background:#efe8dc;color:#4d4635;font:600 14px/1 Inter,system-ui,sans-serif;display:inline-flex;align-items:center;gap:6px')}>
              <span style={iconStyle(18)}>receipt_long</span>
              <span data-f="top_client_invoice_count">{plural(c.invoiceCount, 'invoice paid', 'invoices paid')}</span>
            </div>
          )}
          <div style={s('flex:1 1 0')} />
          {c.pct != null && (
            <div data-a="up" data-d="1900" style={s('align-self:stretch;text-align:left;padding:16px 18px;border-radius:20px;background:#fff;border:1px solid rgba(31,27,19,.08);box-shadow:0 18px 36px -24px rgba(115,92,0,.45)')}>
              <div style={s('font:400 14px/20px Inter,system-ui,sans-serif;color:#4d4635')}>
                <b data-f="top_client_pct" style={s('font:800 16px/20px Montserrat,system-ui,sans-serif;color:#1f1b13')}>{c.pct}%</b> of everything you collected this {per(p)}.
              </div>
              <div style={s('margin-top:10px;height:10px;border-radius:999px;background:#efe6d6;overflow:hidden')}>
                <i data-a="gx" data-d="2100" data-dur="700" style={s(`display:block;height:100%;width:${c.pct}%;border-radius:999px;background:linear-gradient(90deg,#e8c766,#d4af37);transform-origin:left center`)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Stage>
  );
}
