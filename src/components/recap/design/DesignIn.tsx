'use client';
// Slide 02, Money in (RecapPlayer.dc.html "02 MONEY IN"). Money in is
// collected.total (income.total only for a payload stored before it). The bank
// strip and the encouragement line are not drawn: no bank yet (RULE 7) and
// no payload field for the line.
import type { SlideProps } from '@/components/recap/clock';
import { money, plural } from '@/components/recap/copy';
import { clientsCount, collectedOf, invoicesPaidTotal, otherReceivedTotal, paymentsCount } from '@/components/recap/design/data';
import { iconStyle, s } from '@/components/recap/design/css';
import Stage from '@/components/recap/design/Stage';
import type { PaymentMethodKey } from '@/lib/recap/payload';

// label, colour, icon: the design's table, plus the three methods it doesn't draw.
const METHOD: Record<PaymentMethodKey, [string, string, string]> = {
  zelle: ['Zelle', '#5b77a8', 'swap_horiz'], card: ['Card', '#2f8a83', 'credit_card'], cashapp: ['Cash App', '#6f8c5c', 'smartphone'],
  check: ['Check', '#c0693f', 'receipt_long'], cash: ['Cash', '#d4af37', 'payments'], other: ['Other', '#a39a86', 'more_horiz'],
  bank: ['Bank', '#6f8c5c', 'account_balance'], paypal: ['PayPal', '#5b77a8', 'payments'], venmo: ['Venmo', '#2f8a83', 'payments'],
};

const CARD = 'padding:12px 14px;border-radius:16px;background:#fff;border:1px solid rgba(31,27,19,.08);box-shadow:0 12px 24px -20px rgba(115,92,0,.5)';
const CARD_LABEL = 'display:flex;align-items:center;gap:6px;font:600 12px/16px Inter,system-ui,sans-serif;color:#4d4635';
const CARD_NUM = 'margin-top:4px;font:800 24px/28px Montserrat,system-ui,sans-serif;letter-spacing:-.02em;font-variant-numeric:tabular-nums';
const split = (v: number, c: string) =>
  s(v ? `display:block;height:100%;flex:${v} 0 0;background:${c};border-radius:999px;transform-origin:left center` : 'display:none');

export default function DesignIn({ payload: p, clock, reduced }: SlideProps) {
  const collected = collectedOf(p), invPaid = invoicesPaidTotal(p), other = otherReceivedTotal(p);
  const methods = p.paymentMethods;
  const mt = methods.reduce((a, m) => a + m.amount, 0) || 1;   // the share bar's denominator, not a reported number
  return (
    <Stage clock={clock} reduced={reduced}>
      <div data-slide="in" style={s('position:absolute;inset:0')}>
        <div style={s('position:absolute;left:28px;right:28px;top:92px;bottom:36px;display:flex;flex-direction:column')}>
          <div data-a="up" data-d="0" style={s('font:600 12px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#735c00')}>Money in</div>
          <div data-a="up" data-d="100" style={s('margin-top:18px;font:700 22px/28px Montserrat,system-ui,sans-serif')}>You collected</div>
          <div data-a="count" data-v={collected} data-fmt="money" data-d="250" data-dur="1400" data-fit="88" data-f="collected_total"
            style={s('margin-top:6px;font:800 88px/92px Montserrat,system-ui,sans-serif;letter-spacing:-.03em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden')}>{money(collected)}</div>
          <div data-a="up" data-d="700" style={s('margin-top:6px;font:400 15px/20px Inter,system-ui,sans-serif;color:#4d4635')}>
            <span data-f="payments_count · clients_count">{plural(paymentsCount(p), 'payment', 'payments')} · {plural(clientsCount(p), 'client', 'clients')}</span>
          </div>
          <div style={s('margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
            <div data-a="up" data-d="1100" style={s(CARD)}>
              <div style={s(CARD_LABEL)}><i style={s('width:8px;height:8px;border-radius:999px;background:#d4af37;flex:none')} />Invoices paid</div>
              <div data-a="count" data-v={invPaid} data-fmt="money" data-d="1100" data-dur="600" data-f="invoices_paid_total" style={s(CARD_NUM)}>{money(invPaid)}</div>
            </div>
            <div data-a="up" data-d="1250" style={s(CARD)}>
              <div style={s(CARD_LABEL)}><i style={s('width:8px;height:8px;border-radius:999px;background:#2f8a83;flex:none')} />Other money received</div>
              <div data-a="count" data-v={other} data-fmt="money" data-d="1250" data-dur="600" data-f="other_received_total" style={s(CARD_NUM)}>{money(other)}</div>
            </div>
          </div>
          <div style={s('margin-top:10px;height:8px;border-radius:999px;background:#efe6d6;overflow:hidden;display:flex;gap:2px')}>
            <i data-a="gx" data-d="1500" data-dur="600" style={split(invPaid, '#d4af37')} />
            <i data-a="gx" data-d="1700" data-dur="600" style={split(other, '#2f8a83')} />
          </div>
          {methods.length > 0 && (
            <>
              <div data-a="fade" data-d="1700" data-dur="300" style={s('margin-top:22px;font:600 12px/1 Inter,system-ui,sans-serif;color:#4d4635')}>How it came in</div>
              <div style={s('margin-top:10px;display:flex;flex-wrap:wrap;gap:6px')}>
                {methods.map((m, i) => {
                  const [label, c, icon] = METHOD[m.method];
                  const ink = c === '#d4af37' || c === '#a39a86';
                  return (
                    <div key={m.method} data-a="up" data-d={1750 + i * 80}
                      style={s('height:34px;padding:0 10px 0 4px;border-radius:999px;background:#fff;border:1px solid #d0c5af;display:flex;align-items:center;gap:6px;font:600 12.5px/1 Inter,system-ui,sans-serif')}>
                      <span style={s(`width:26px;height:26px;border-radius:999px;background:${c};color:${ink ? '#1f1b13' : '#fff'};display:grid;place-items:center;flex:none`)}>
                        <span style={iconStyle(16)}>{icon}</span>
                      </span>
                      <span data-f="method_name">{label}</span>
                      <span data-f="method_amount" style={s('font-weight:400;color:#4d4635;font-variant-numeric:tabular-nums')}>{money(m.amount)}</span>
                    </div>
                  );
                })}
              </div>
              <div style={s('margin-top:12px;height:44px;border-radius:14px;background:#efe6d6;overflow:hidden;display:flex;box-shadow:inset 0 2px 6px rgba(31,27,19,.12);flex:none')}>
                {methods.map((m, i) => {
                  const c = METHOD[m.method][1];
                  const ink = c === '#d4af37' || c === '#a39a86';
                  const share = m.amount / mt;
                  return (
                    <div key={m.method} data-a="wipe" data-d={1950 + i * 110} data-dur="600"
                      style={s(`flex:${m.amount} 0 0;min-width:0;overflow:hidden;background:${c};color:${ink ? '#1f1b13' : '#fff'};display:flex;align-items:flex-end;padding:0 0 8px 10px;font:700 12px/1 Montserrat,system-ui,sans-serif;border-right:${i === methods.length - 1 ? '0' : '2px solid #fff8f0'};box-sizing:border-box`)}>
                      {share >= 0.12 ? `${Math.round(share * 100)}%` : ''}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <div style={s('flex:1 1 0')} />
        </div>
      </div>
    </Stage>
  );
}
