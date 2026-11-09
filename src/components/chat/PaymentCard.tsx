'use client';
// The chat's payment cards (alive layer 04 "in chat" + 05 success). Copy and
// buttons are decided by lib/payment-card; this draws them from the design:
//   recorded  "Payment recorded" · check tile · Partial chip · bar (.7s grow)
//   paid      56px disc (ringOnce .4s) + drawn check (.36s) + "Paid in full" + chip
//   deposit   meta line · "$X deposit from Name" + chip · no button
// The celebration plays once: `animate` is false for a restored card. Send
// receipt is omitted by decision; Open invoice and Undo remain.
import { methodLabel, type PaymentMethod } from '@/lib/record-payment';
import { money } from '@/lib/financials';
import { payCardActions, payCardProgress, type PayCard } from '@/lib/payment-card';
import { AssistantAvatar } from '@/components/chat/EventCard';
import Icon from '@/components/Icon';
import '@/components/alive/alive.css';

const first = (n: string) => n.trim().split(/\s+/)[0] || 'your client';
const dayOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const docNo = (n: number | null) => (n ? `INV-${String(n).padStart(4, '0')}` : 'Invoice');
const inter = (css: string) => `${css} var(--font-inter), system-ui, sans-serif`;

export default function PaymentCard({ card, onOpen, onUndo, animate = true }: {
  card: PayCard;
  onOpen: (invoiceId: string) => void;
  onUndo: (paymentId: string) => void;
  animate?: boolean;
}) {
  const actions = payCardActions(card);
  const pct = payCardProgress(card, card.total);
  const method = methodLabel(card.method as PaymentMethod);
  const name = first(card.clientName);
  const buttons = actions.length > 0 && (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      {actions.includes('open') && (
        <button type="button" className="al-btn-w" style={{ height: 36, fontSize: 13.5, padding: '0 14px' }} onClick={() => onOpen(card.invoiceId)}>Open invoice</button>
      )}
      {actions.includes('undo') && card.paymentId && (
        <button type="button" className="al-btn-w" style={{ height: 36, fontSize: 13.5, padding: '0 14px' }} onClick={() => onUndo(card.paymentId as string)}>Undo</button>
      )}
    </div>
  );

  if (card.kind === 'paid') {
    return (
      <div className={`mt-2 w-full ${animate ? 'al-fade-up' : ''}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <AssistantAvatar />
        <div className="al-wcard" style={{ flex: 1, minWidth: 0, padding: '16px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div
            className="al-anim"
            style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--al-gold)', display: 'grid', placeItems: 'center', animation: animate ? 'al-ring-once .4s cubic-bezier(.2,.9,.3,1.2) both' : undefined }}
          >
            <svg width="28" height="28" viewBox="0 0 40 40" aria-hidden>
              <path
                className="al-anim-ck"
                d="M10 21l6.5 6.5L30 14" fill="none" stroke="#1e1a15" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="40"
                style={animate ? { animation: 'al-ck-once .36s ease-out .12s both' } : undefined}
              />
            </svg>
          </div>
          <div className="al-h" style={{ fontSize: 19, marginTop: 10 }}>Paid in full</div>
          <div style={{ font: inter('400 13px'), color: 'var(--al-mute)', marginTop: 2 }}>
            {money(card.amount)} from {name} · {method} · balance $0.00
          </div>
          <span className="al-chip al-anim" style={{ background: 'var(--al-green-bg)', color: 'var(--al-green)', marginTop: 10, animation: animate ? 'al-pop-in .3s .4s both' : undefined }}>
            <Icon name="verified" size={14} />Paid
          </span>
          {buttons}
        </div>
      </div>
    );
  }

  if (card.kind === 'deposit') {
    return (
      <div className={`mt-2 w-full ${animate ? 'al-fade-up' : ''}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <AssistantAvatar />
        <div className="al-wcard" style={{ flex: 1, minWidth: 0, padding: 14 }}>
          <div className="al-meta" style={{ marginBottom: 8 }}>Deposit received · {new Date(card.paidAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div className="al-tt">{money(card.amount)} deposit from {name}</div>
            <span className="al-chip al-chip--sm" style={{ background: 'var(--al-gold-soft)', color: 'var(--al-gold-text)' }}>Deposit</span>
          </div>
          <div style={{ font: inter('400 13px'), color: 'var(--al-mute)', marginTop: 4 }}>
            {docNo(card.invoiceNo)} · {money(card.left)} due on completion
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`mt-2 w-full ${animate ? 'al-fade-up' : ''}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <AssistantAvatar />
      <div className="al-wcard" style={{ flex: 1, minWidth: 0, padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className={animate ? 'al-pop-in' : undefined} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--al-gold)', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Icon name="check" size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="al-tt">Payment recorded</div>
            <div className="al-td">{money(card.amount)} from {name} · {method} · {dayOf(card.paidAt)}</div>
          </div>
          <span className="al-chip al-chip--sm" style={{ background: 'var(--al-gold-soft)', color: 'var(--al-gold-text)' }}>Partial</span>
        </div>
        <div className="al-pbar" style={{ marginTop: 12 }}>
          <div className="al-pfill al-anim" style={{ width: `${pct}%`, animation: animate ? 'al-grow .7s cubic-bezier(.2,.8,.2,1) .2s both' : undefined }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', font: inter('400 12.5px'), color: 'var(--al-mute)', marginTop: 6 }}>
          <span>{docNo(card.invoiceNo)}</span>
          <span><b style={{ color: 'var(--al-ink)' }}>{money(card.left)}</b> left</span>
        </div>
        {buttons}
      </div>
    </div>
  );
}
