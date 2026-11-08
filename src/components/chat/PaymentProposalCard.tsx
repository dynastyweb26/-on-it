'use client';
// The record-payment proposal (alive layer item 5). The parser PROPOSES; this
// card is the only thing that can write. Rules it must keep:
//   - Every field is visible and editable here — client, invoice, amount,
//     method, date. Nothing is applied behind an invisible default.
//   - The amount is focused with the gold ring and a numeric keypad, because it
//     is the field a spoken message most often gets wrong.
//   - Two matching clients or two open invoices arrive as a picker row; the card
//     never silently chooses between them.
//   - An amount over the balance shows a warning and disables Confirm. No
//     overpayments from chat.
//   - The button carries the amount, so the tap is unambiguous.
import { useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { money } from '@/lib/financials';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/record-payment';

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
const label = (inv: ProposalInvoice) =>
  `${inv.invoiceNo ? `#${inv.invoiceNo} · ` : ''}${inv.clientName} · ${money(leftOf(inv))} left`;

export default function PaymentProposalCard({ proposal, onConfirm, onCancel }: {
  proposal: PaymentProposal;
  onConfirm: (input: ProposalInput) => Promise<ProposalResult>;
  onCancel: () => void;
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

  async function confirm() {
    if (!canConfirm || confirming.current) return;
    confirming.current = true;
    setBusy(true);
    setError('');
    try {
      const out = await onConfirm({
        invoiceId: invoiceId as string,
        amount,
        method: method as PaymentMethod,
        paidOn,
      });
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
    <div className="mt-2 w-full rounded-[18px] border border-outline-variant/50 bg-surface-container p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-container text-on-background">
          <Icon name="payments" size={18} />
        </span>
        <p className="text-[13px] font-bold text-on-surface">Record a payment</p>
      </div>

      {/* Client — editable; two matches means two buttons, never a guess. */}
      <label className="mt-3 block text-[12px] font-semibold text-on-surface-variant" htmlFor="pay-client">Client</label>
      <input
        id="pay-client"
        value={clientName}
        onChange={(e) => setClientName(e.target.value)}
        placeholder="Who paid you?"
        className="mt-1 min-h-touch w-full rounded-input border border-outline-variant/40 bg-surface-container-lowest px-3 text-[15px] text-on-surface outline-none focus:ring-2 focus:ring-primary-container"
      />
      {proposal.clients.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {proposal.clients.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setClientName(name)}
              className={`min-h-touch rounded-[10px] border px-2.5 text-[13px] font-semibold transition active:opacity-60 ${
                clientName === name
                  ? 'border-primary-container bg-primary-soft text-on-surface'
                  : 'border-outline-variant/40 text-on-surface-variant'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Invoice — a picker row whenever there is more than one candidate. */}
      <p className="mt-3 text-[12px] font-semibold text-on-surface-variant">
        {proposal.invoices.length > 1 ? `Invoice — ${proposal.invoices.length} open` : 'Invoice'}
      </p>
      {proposal.invoices.length === 0 ? (
        <p className="mt-1 text-[13px] text-on-surface-variant">No open invoice found for that client.</p>
      ) : proposal.invoices.length === 1 ? (
        <p className="mt-1 text-[14px] text-on-surface">{label(proposal.invoices[0])}</p>
      ) : (
        <div className="mt-1 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {proposal.invoices.map((inv) => (
            <button
              key={inv.id}
              type="button"
              onClick={() => setInvoiceId(inv.id)}
              aria-pressed={invoiceId === inv.id}
              className={`min-h-touch shrink-0 rounded-[10px] border px-2.5 text-[13px] font-semibold transition active:opacity-60 ${
                invoiceId === inv.id
                  ? 'border-primary-container bg-primary-soft text-on-surface'
                  : 'border-outline-variant/40 text-on-surface-variant'
              }`}
            >
              {label(inv)}
            </button>
          ))}
        </div>
      )}

      {/* Amount — gold ring, numeric keypad, focused on arrival. */}
      <label className="mt-3 block text-[12px] font-semibold text-on-surface-variant" htmlFor="pay-amount">Amount</label>
      <input
        id="pay-amount"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        inputMode="decimal"
        type="number"
        min="0"
        step="0.01"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value)}
        placeholder="0.00"
        aria-invalid={overpay}
        aria-describedby={overpay ? 'pay-overpay' : undefined}
        className={`mt-1 min-h-touch w-full rounded-input border bg-surface-container-lowest px-3 text-[15px] tabular-nums text-on-surface outline-none ring-2 ring-primary-container ${
          overpay ? 'border-error' : 'border-outline-variant/40'
        }`}
      />
      {overpay && invoice && (
        <p id="pay-overpay" className="mt-1 flex items-start gap-1.5 text-[12px] font-semibold text-error">
          <Icon name="error" size={15} className="mt-px shrink-0" />
          That&apos;s more than the {money(leftOf(invoice))} left on this invoice.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <div className="flex-1">
          <label className="block text-[12px] font-semibold text-on-surface-variant" htmlFor="pay-method">Method</label>
          <select
            id="pay-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}
            className="mt-1 min-h-touch w-full rounded-input border border-outline-variant/40 bg-surface-container-lowest px-2 text-[14px] text-on-surface outline-none focus:ring-2 focus:ring-primary-container"
          >
            <option value="">How?</option>
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-[12px] font-semibold text-on-surface-variant" htmlFor="pay-date">Date</label>
          <input
            id="pay-date"
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            className="mt-1 min-h-touch w-full rounded-input border border-outline-variant/40 bg-surface-container-lowest px-2 text-[14px] text-on-surface outline-none focus:ring-2 focus:ring-primary-container"
          />
        </div>
      </div>

      {(!validAmount || !method) && (
        <p className="mt-2 text-[12px] text-on-surface-variant">
          {!validAmount ? 'How much did they pay?' : 'How did they pay?'}
        </p>
      )}
      {error && <p className="mt-2 text-[12px] font-semibold text-error">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => void confirm()}
          className="btn-primary min-h-touch flex-1 disabled:opacity-40"
        >
          {busy ? 'Recording…' : validAmount ? `Confirm ${money(amount)}` : 'Confirm'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="min-h-touch shrink-0 px-3 text-[13px] font-semibold text-on-surface-variant underline transition active:opacity-60 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
      <p className="mt-2 text-[11px] text-on-surface-variant">Nothing is saved until you tap Confirm.</p>
    </div>
  );
}
