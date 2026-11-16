'use client';
// Slide 05, Invoices and estimates (RecapPlayer.dc.html "05 INVOICES AND ESTIMATES").
// A row whose field the payload never had (an old recap) is left out; a row
// that is 0 reads "None this time", as designed.
import { useRef } from 'react';
import type { SlideProps } from '@/components/recap/clock';
import { money, plural } from '@/components/recap/copy';
import { iconStyle, s } from '@/components/recap/design/css';
import Stage from '@/components/recap/design/Stage';

const BOX = 'border-radius:20px;background:#fff;border:1px solid rgba(31,27,19,.08);box-shadow:0 18px 36px -24px rgba(115,92,0,.45)';

export default function DesignInv({ payload: p, clock, reduced, onAction }: SlideProps) {
  const sent = useRef(false);
  const list: { n: number; label: string; icon: 'send' | 'task_alt' | 'thumb_up'; field: string; c: string }[] = [];
  if (p.invoicesSent != null) list.push({ n: p.invoicesSent, label: 'Invoices sent', icon: 'send', field: 'invoices_sent_count', c: '#d4af37' });
  list.push({ n: p.paid.count, label: 'Invoices paid', icon: 'task_alt', field: 'invoices_paid_count', c: '#2e6b3f' });
  if (p.estimatesApproved != null) list.push({ n: p.estimatesApproved, label: 'Estimates approved', icon: 'thumb_up', field: 'estimates_approved_count', c: '#2f8a83' });
  const rows = list.map((r, i) => {
    const d = 350 + i * 500, shown = Math.min(r.n, 20);
    return { ...r, d, nd: d + 300 + shown * 25, shown, note: r.n === 0 ? 'None this time' : r.n > 20 ? `+${r.n - 20}` : '' };
  });
  const owedLine = [
    p.viewedUnpaid ? `${p.viewedUnpaid} ${p.viewedUnpaid === 1 ? 'client opened their invoice but hasn’t paid yet.' : 'clients opened their invoice but haven’t paid yet.'}` : '',
    p.quotesPending ? `${plural(p.quotesPending, 'estimate', 'estimates')} waiting on an answer.` : '',
  ].filter(Boolean).join(' ');
  const owed = p.owed.total > 0;
  return (
    <Stage clock={clock} reduced={reduced}>
      <div data-slide="inv" style={s('position:absolute;inset:0')}>
        <div style={s('position:absolute;left:28px;right:28px;top:92px;bottom:36px;display:flex;flex-direction:column')}>
          <div data-a="up" data-d="0" style={s('font:600 12px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#735c00')}>Invoices and estimates</div>
          <h2 data-a="up" data-d="100" style={s('margin:18px 0 0;font:800 32px/38px Montserrat,system-ui,sans-serif;letter-spacing:-.015em;text-wrap:balance')}>Here’s what went out.</h2>
          <div style={s('margin-top:14px;display:flex;flex-direction:column')}>
            {rows.map((r) => (
              <div key={r.field} data-a="up" data-d={r.d} style={s('display:flex;align-items:center;gap:14px;padding:16px 0;border-bottom:1px solid rgba(31,27,19,.1)')}>
                <div data-a="count" data-v={r.n} data-fmt="int" data-d={r.d} data-dur="700" data-f={r.field}
                  style={s('width:92px;flex:none;font:800 52px/56px Montserrat,system-ui,sans-serif;letter-spacing:-.03em;font-variant-numeric:tabular-nums')}>{r.n}</div>
                <div style={s('flex:1;min-width:0')}>
                  <div style={s('display:flex;align-items:center;gap:6px;font:700 15px/20px Montserrat,system-ui,sans-serif')}>
                    <span style={iconStyle(18, `color:${r.c === '#d4af37' ? '#735c00' : r.c}`)}>{r.icon}</span>{r.label}
                  </div>
                  <div style={s('margin-top:8px;display:flex;flex-wrap:wrap;gap:3px;align-items:center;min-height:12px')}>
                    {Array.from({ length: r.shown }, (_, j) => (
                      <i key={j} data-a="pop" data-d={r.d + 250 + j * 25} data-dur="260" style={s(`width:10px;height:10px;border-radius:3px;background:${r.c};display:block`)} />
                    ))}
                    <span data-a="fade" data-d={r.nd} data-dur="300" style={s('font:600 12px/12px Inter,system-ui,sans-serif;color:#4d4635')}>{r.note}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={s('flex:1 1 0')} />
          {owed ? (
            <div data-a="up" data-d="2000" style={s(`padding:16px 18px 18px;${BOX}`)}>
              <div style={s('display:flex;align-items:baseline;justify-content:space-between;gap:10px')}>
                <div style={s('font:600 13px/18px Inter,system-ui,sans-serif;color:#4d4635')}>Still owed to you<br /><span data-f="owed_invoice_count" style={s('font-weight:400')}>{plural(p.owed.count, 'invoice', 'invoices')}</span></div>
                <div data-a="count" data-v={p.owed.total} data-fmt="money" data-d="2000" data-dur="700" data-f="owed_total"
                  style={s('font:800 30px/34px Montserrat,system-ui,sans-serif;letter-spacing:-.02em;font-variant-numeric:tabular-nums')}>{money(p.owed.total)}</div>
              </div>
              {owedLine && (
                <div data-f="viewed_unpaid_count, estimates_pending_count" style={s('margin-top:10px;font:400 13px/19px Inter,system-ui,sans-serif;color:#4d4635;text-wrap:pretty')}>{owedLine}</div>
              )}
              <button type="button" data-act="1" onClick={(e) => { e.stopPropagation(); if (sent.current) return; sent.current = true; onAction('view-invoices'); }}
                style={{ ...s('margin-top:14px;width:100%;height:48px;border:0;border-radius:999px;background:linear-gradient(180deg,#dcb94a,#d4af37 50%,#c9a42c);color:#1f1b13;font:700 15px/1 Montserrat,system-ui,sans-serif;cursor:pointer;box-shadow:0 10px 24px -10px rgba(212,175,55,.6),inset 0 1px 0 rgba(255,255,255,.35)') }}>View invoices</button>
            </div>
          ) : (
            <div data-a="up" data-d="2000" style={s(`padding:18px 20px;${BOX};display:flex;gap:14px;align-items:center`)}>
              <span data-a="pop" data-d="2250" style={s('width:44px;height:44px;border-radius:999px;background:#e3efe3;color:#2e6b3f;display:grid;place-items:center;flex:none')}>
                <span style={iconStyle(24)}>task_alt</span>
              </span>
              <div>
                <div style={s('font:700 17px/22px Montserrat,system-ui,sans-serif')}>You’re all caught up.</div>
                <div style={s('margin-top:2px;font:400 14px/20px Inter,system-ui,sans-serif;color:#4d4635')}>Nobody owes you a dime.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Stage>
  );
}
