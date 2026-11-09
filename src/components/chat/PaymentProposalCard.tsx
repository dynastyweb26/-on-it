'use client';
// The record-payment confirm card (alive layer 05). The parser PROPOSES; this
// card is the only thing that can write. Rules it keeps:
//   - Every field is visible and editable here: client, invoice, amount, method,
//     date. Nothing is applied behind an invisible default.
//   - The amount is focused with the gold ring and a numeric keypad.
//   - Two matching clients or two open invoices arrive as a picker row; the card
//     never silently chooses between them.
//   - An amount over the balance shows a warning and disables Confirm.
//   - "After this, X owes $Y" updates live; the button carries the amount.
// States (design 05): idle, saving ("Saving…", Cancel dims), cancelled
// ("Cancelled. Nothing saved." + Undo), error (names the real cause).
import { useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { money } from '@/lib/financials';
import { PAYMENT_METHODS, localDateString, type PaymentMethod } from '@/lib/record-payment';
import { AssistantAvatar } from '@/components/chat/EventCard';
import '@/components/alive/alive.css';

export interface ProposalInvoice {
  id: string;
  invoiceNo: number | null;
  clientName: string;
  total: number;
  amountPaid: number;
}

export interface PaymentProposal {
  /** What the message said; null means the card asks. */
  amount: number | null;
  method: PaymentMethod | null;
  clientName: string;
  /** YYYY-MM-DD, already defaulted to today. */
  paidOn: string;
  /** The invoice the card starts on (oldest open one for the single client). */
  invoiceId: string | null;
  /** Every invoice the owner may choose from. */
  invoices: ProposalInvoice[];
  /** Distinct client names that matched, when the message was ambiguous. */
  clients: string[];
}

export type ProposalInput = { invoiceId: string; amount: number; method: PaymentMethod; paidOn: string };
export type ProposalResult = { ok: true } | { ok: false; message: string };

const leftOf = (inv: ProposalInvoice) => Math.max(0, inv.total - inv.amountPaid);
const docNo = (inv: ProposalInvoice) => (inv.invoiceNo ? `INV-${String(inv.invoiceNo).padStart(4, '0')}` : 'Invoice');
const label = (inv: ProposalInvoice) => `${docNo(inv)} · ${inv.clientName} · ${money(leftOf(inv))} left`;
const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'They';
const prettyDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const text = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return ymd === localDateString(new Date()) ? `Today, ${text}` : text;
};

const ROW = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #e6d9c3', fontSize: 14 } as const;
const LBL = { color: '#7a7166' } as const;
const body = (css: string) => `${css} var(--font-inter), system-ui, sans-serif`;

export default function PaymentProposalCard({ proposal, onConfirm, onCancel, cancelled = false, onUndo }: {
  proposal: PaymentProposal;
  onConfirm: (input: ProposalInput) => Promise<ProposalResult>;
  onCancel: () => void;
  /** Collapsed to one line with Undo (the parent keeps the proposal for it). */
  cancelled?: boolean;
  onUndo?: () => void;
}) {
  const [clientName, setClientName] = useState(proposal.clientName);
  const [invoiceId, setInvoiceId] = useState(proposal.invoiceId);
  const [amountText, setAmountText] = useState(proposal.amount != null ? String(proposal.amount) : '');
  const [method, setMethod] = useState<PaymentMethod | ''>(proposal.method ?? '');
  const [paidOn, setPaidOn] = useState(proposal.paidOn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One tap, one submission: the caller mints the idempotency key at Confirm,
  // and this ref makes a second tap in the same frame impossible.
  const confirming = useRef(false);

  const invoice = proposal.invoices.find((i) => i.id === invoiceId) ?? null;
  const amount = Number(amountText);
  const validAmount = Number.isFinite(amount) && amount > 0;
  const overpay = invoice != null && validAmount && amount > leftOf(invoice) + 1e-9;
  const canConfirm = Boolean(invoiceId) && validAmount && Boolean(method) && !overpay && !busy;
  const owesAfter = invoice ? Math.max(0, leftOf(invoice) - (validAmount ? amount : 0)) : null;

  async function confirm() {
    if (!canConfirm || confirming.current) return;
    confirming.current = true;
    setBusy(true);
    setError('');
    try {
      const out = await onConfirm({ invoiceId: invoiceId as string, amount, method: method as PaymentMethod, paidOn });
      if (!out.ok) { setError(out.message); setBusy(false); }
      // On success the caller replaces this card with the recorded one.
    } catch (e) {
      console.error('[payment proposal] confirm failed', e);
      setError("That didn't go through. Try again.");
      setBusy(false);
    } finally {
      confirming.current = false;
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }} className="mt-2 w-full">
      <AssistantAvatar />
      <div className="al-wcard" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 6px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="al-tile al-tile--36" style={{ background: 'var(--al-gold-soft)', color: 'var(--al-gold-text)' }}>
            <Icon name="payments" size={20} />
          </div>
          <div>
            <div className="al-tt">Record this payment?</div>
            <div className="al-td">Nothing&apos;s saved until you confirm.</div>
          </div>
        </div>

        <div style={{ padding: '0 14px' }}>
          {/* Client — editable; two matches means two buttons, never a guess. */}
          <div style={{ ...ROW, padding: '9px 0' }}>
            <span style={LBL}>Client</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, minWidth: 0 }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--al-gold-soft)', display: 'grid', placeItems: 'center', font: body('700 10px'), color: 'var(--al-gold-text)', flex: 'none' }}>
                {initials(clientName)}
              </span>
              <input
                id="pay-client"
                aria-label="Client"
                value={clientName}
                disabled={cancelled || busy}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Who paid you?"
                style={{ border: 0, outline: 0, background: 'transparent', font: body('600 14px'), color: 'var(--al-ink)', minWidth: 0, width: '9.5em', textAlign: 'right', padding: 0 }}
              />
            </span>
          </div>
          {proposal.clients.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '8px 0', borderBottom: '1px dashed #e6d9c3' }}>
              {proposal.clients.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setClientName(name)}
                  style={chip(clientName === name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {/* Invoice — a picker row whenever there is more than one candidate. */}
          <div style={{ ...ROW, padding: '9px 0', gap: 8 }}>
            <span style={LBL}>{proposal.invoices.length > 1 ? `Invoice · ${proposal.invoices.length} open` : 'Invoice'}</span>
            {proposal.invoices.length === 0 ? (
              <span style={{ ...LBL, fontSize: 13 }}>No open invoice found</span>
            ) : proposal.invoices.length === 1 ? (
              <span style={{ fontWeight: 600 }}>
                <span style={{ fontFamily: 'var(--font-plex-mono), ui-monospace, monospace', fontSize: 13 }}>{docNo(proposal.invoices[0])}</span> · {money(proposal.invoices[0].total)}
              </span>
            ) : null}
          </div>
          {proposal.invoices.length > 1 && (
            <div style={{ display: 'flex', gap: 5, overflowX: 'auto', padding: '8px 0', borderBottom: '1px dashed #e6d9c3' }}>
              {proposal.invoices.map((inv) => (
                <button
                  key={inv.id}
                  type="button"
                  aria-pressed={invoiceId === inv.id}
                  onClick={() => setInvoiceId(inv.id)}
                  style={{ ...chip(invoiceId === inv.id), flex: 'none' }}
                >
                  {label(inv)}
                </button>
              ))}
            </div>
          )}

          {/* Amount — gold ring, numeric keypad, focused on arrival. */}
          <div style={{ ...ROW, padding: '7px 0' }}>
            <span style={LBL}>Amount</span>
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: 2, height: 38, borderRadius: 12,
                border: `1.5px solid ${overpay ? 'var(--al-rust)' : 'var(--al-gold)'}`, background: 'var(--al-gold-wash)', padding: '0 10px',
                boxShadow: overpay ? '0 0 0 3px rgba(168,70,31,.18)' : '0 0 0 3px rgba(212,175,55,.18)',
              }}
            >
              <span className="al-h" style={{ fontSize: 18 }}>$</span>
              <input
                id="pay-amount"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={!cancelled}
                inputMode="decimal"
                type="number"
                min="0"
                step="0.01"
                value={amountText}
                disabled={cancelled || busy}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="0.00"
                aria-label="Amount"
                aria-invalid={overpay}
                aria-describedby={overpay ? 'pay-overpay' : undefined}
                style={{ width: 70, border: 0, outline: 0, background: 'transparent', font: '800 18px var(--font-montserrat), Montserrat, sans-serif', color: 'var(--al-ink)', textAlign: 'right', padding: 0 }}
              />
              <span style={{ color: 'var(--al-gold-deep)', marginLeft: 6, display: 'inline-flex' }}><Icon name="edit" size={16} /></span>
            </label>
          </div>
          {overpay && invoice && (
            <p id="pay-overpay" role="alert" style={{ margin: 0, padding: '6px 0', font: body('600 12px'), color: 'var(--al-rust)', display: 'flex', gap: 6 }}>
              <Icon name="error" size={15} className="shrink-0" />
              That&apos;s more than the {money(leftOf(invoice))} left on this invoice.
            </p>
          )}

          {/* Method — the app's own list, in the design's chip style. */}
          <div style={{ ...ROW, padding: '9px 0', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ ...LBL, paddingTop: 5 }}>Method</span>
            <div role="radiogroup" aria-label="Method" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'flex-end' }}>
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={method === m.value}
                  disabled={cancelled || busy}
                  onClick={() => setMethod(m.value)}
                  style={chip(method === m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date — the label is the tap target for the native picker. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', fontSize: 14, position: 'relative' }}>
            <span style={LBL}>Date</span>
            <span style={{ fontWeight: 600, display: 'flex', gap: 4, alignItems: 'center' }}>
              {prettyDate(paidOn)}
              <span style={{ color: 'var(--al-faint)', display: 'inline-flex' }}><Icon name="expand_more" size={18} /></span>
            </span>
            <input
              type="date"
              aria-label="Date"
              value={paidOn}
              disabled={cancelled || busy}
              onChange={(e) => setPaidOn(e.target.value)}
              style={{ position: 'absolute', right: 0, top: 0, width: '60%', height: '100%', opacity: 0, cursor: 'pointer' }}
            />
          </div>
        </div>

        <div style={{ background: 'var(--al-card-bg)', padding: '10px 14px', fontSize: 13, color: 'var(--al-ink2)', borderTop: '1px solid #efe4d2' }}>
          {owesAfter != null
            ? <>After this, {firstName(clientName)} owes <b>{money(owesAfter)}</b>.</>
            : (!validAmount ? 'How much did they pay?' : 'Pick the invoice this pays.')}
          {owesAfter != null && !method && <div style={{ marginTop: 2, color: 'var(--al-mute)' }}>How did they pay?</div>}
        </div>

        {error && (
          <p role="alert" style={{ margin: 0, padding: '8px 14px 0', font: body('600 12.5px'), color: 'var(--al-rust)' }}>{error}</p>
        )}

        {cancelled ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px 14px', fontSize: 13.5, color: 'var(--al-mute)' }}>
            <span>Cancelled. Nothing saved.</span>
            <button type="button" onClick={onUndo} style={{ font: body('700 13.5px'), color: 'var(--al-gold-link)', background: 'none', border: 0, cursor: 'pointer', padding: '6px 4px' }}>Undo</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 8, padding: '12px 14px 14px' }}>
            <button type="button" className="al-btn-w" disabled={busy} onClick={onCancel} style={busy ? { opacity: 0.5 } : undefined}>Cancel</button>
            <button
              type="button"
              className="al-btn-g"
              disabled={!canConfirm}
              aria-busy={busy || undefined}
              onClick={() => void confirm()}
              style={!canConfirm && !busy ? { opacity: 0.4 } : undefined}
            >
              {busy ? (<><span className="al-spinner" />Saving…</>) : validAmount ? `Confirm ${money(amount)}` : 'Confirm'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function chip(on: boolean): React.CSSProperties {
  return on
    ? { height: 30, padding: '0 10px', borderRadius: 15, background: 'var(--al-ink)', color: '#fbf4e8', display: 'flex', alignItems: 'center', font: body('600 12.5px'), cursor: 'pointer', border: 0 }
    : { height: 30, padding: '0 10px', borderRadius: 15, background: '#fff', border: '1px solid var(--al-btn-line)', display: 'flex', alignItems: 'center', font: body('600 12.5px'), cursor: 'pointer', boxSizing: 'border-box', color: 'var(--al-ink)' };
}
