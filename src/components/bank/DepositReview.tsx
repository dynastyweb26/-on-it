'use client';
// Money in: one card per deposit that still needs a decision.
//
// Three buttons on an ordinary deposit — Record payment / Already recorded /
// Not income. A Stripe payout keeps ONLY "Not income", with a short note; a
// deposit the bank removed keeps none, because nothing here ever reverses a
// ledger row.
//
// Presentational plus its own read/post of the preview-only deposits route:
// the URL lives in lib/bank-deposits, so the bank-component guard still holds.
// Nothing writes to Supabase from here.
import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { useBankTracking } from './BankTrackingProvider';
import {
  DEPOSITS_URL, depositActions, depositBody, depositDoneToast, depositNote, depositPlan,
  depositRefusalMessage, depositSubline,
  type ApiDeposit, type DepositAction, type DepositInvoice, type DepositPayment,
} from '@/lib/bank-deposits';
import { formatMoney } from '@/lib/bank-tracking';

type Rows = { deposits: ApiDeposit[]; invoices: DepositInvoice[]; payments: DepositPayment[] };

const invoiceLabel = (invoice: DepositInvoice): string => {
  const number = Number.isInteger(invoice.invoice_number) && (invoice.invoice_number ?? 0) > 0
    ? `INV-${String(invoice.invoice_number).padStart(4, '0')}`
    : 'Invoice';
  const client = (invoice.client_name ?? '').trim();
  return `${number}${client ? ` · ${client}` : ''} · ${formatMoney(invoice.balance_cents / 100)}`;
};

const paymentLabel = (payment: DepositPayment): string => {
  const number = Number.isInteger(payment.invoice_number) && (payment.invoice_number ?? 0) > 0
    ? `INV-${String(payment.invoice_number).padStart(4, '0')}`
    : 'Payment';
  return `${number} · ${formatMoney(payment.amount_cents / 100)} · ${payment.method}`;
};

export default function DepositReview() {
  const ctx = useBankTracking();
  const [rows, setRows] = useState<Rows>({ deposits: [], invoices: [], payments: [] });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(DEPOSITS_URL, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as unknown;
      const plan = depositPlan(res.status, body);
      if (plan.kind !== 'rows') return;
      setRows({ deposits: plan.deposits, invoices: plan.invoices, payments: plan.payments });
      setError(null);
    } catch {
      // Offline or the gate: leave the section quiet rather than claim "none".
      setError(null);
    }
  }, []);

  useEffect(() => {
    if (!ctx?.enabled) return;
    void load();
  }, [ctx?.enabled, load]);

  async function decide(deposit: ApiDeposit, action: DepositAction, extra: { invoice_id?: string; payment_id?: string }) {
    setBusyId(deposit.id);
    setError(null);
    try {
      const res = await fetch(DEPOSITS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(depositBody(deposit.id, action, extra)),
      });
      if (res.ok) {
        setRows((current) => ({ ...current, deposits: current.deposits.filter((row) => row.id !== deposit.id) }));
        setNotice(depositDoneToast(action));
        setBusyId(null);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(depositRefusalMessage(body?.error));
    } catch {
      setError(depositRefusalMessage(null));
    }
    setBusyId(null);
  }

  if (!ctx?.enabled || rows.deposits.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Money in to review">
      <div>
        <h2 className="font-display text-lg font-extrabold">Money in</h2>
        <p className="text-[13px] text-on-surface-variant">
          Deposits that came into your bank. Record one as a payment, match one you already recorded, or say it is not income.
        </p>
      </div>
      {notice && <p role="status" className="text-[13px] font-semibold text-paid">{notice}</p>}
      {error && <p role="alert" className="text-[13px] font-semibold text-error">{error}</p>}
      {rows.deposits.map((deposit) => (
        <DepositCard
          key={deposit.id}
          deposit={deposit}
          invoices={rows.invoices}
          payments={rows.payments}
          busy={busyId === deposit.id}
          onDecide={(action, extra) => void decide(deposit, action, extra)}
        />
      ))}
    </section>
  );
}

function DepositCard({
  deposit, invoices, payments, busy, onDecide,
}: {
  deposit: ApiDeposit;
  invoices: DepositInvoice[];
  payments: DepositPayment[];
  busy: boolean;
  onDecide: (action: DepositAction, extra: { invoice_id?: string; payment_id?: string }) => void;
}) {
  const actions = depositActions(deposit);
  const note = depositNote(deposit);
  const [mode, setMode] = useState<'record' | 'already' | null>(null);
  const [invoiceId, setInvoiceId] = useState(deposit.suggestion?.invoice_id ?? '');
  const [paymentId, setPaymentId] = useState('');

  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-primary-soft">
          <Icon name="payments" size={19} className="text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{deposit.merchant || deposit.name}</p>
          <p className="text-[13px] text-on-surface-variant">{depositSubline(deposit)}</p>
        </div>
      </div>

      {note && <p className="text-[13px] text-on-surface-variant">{note}</p>}

      {mode === 'record' && (
        <div className="space-y-2">
          <label className="block text-[13px] font-semibold" htmlFor={`invoice-${deposit.id}`}>
            Which invoice?
          </label>
          <select
            id={`invoice-${deposit.id}`}
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            className="w-full rounded-input border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm"
          >
            <option value="">Choose an invoice</option>
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>{invoiceLabel(invoice)}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !invoiceId}
              onClick={() => onDecide('record', { invoice_id: invoiceId })}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {busy ? 'Recording…' : 'Record payment'}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode(null)} className="btn-outline px-4">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'already' && (
        <div className="space-y-2">
          <label className="block text-[13px] font-semibold" htmlFor={`payment-${deposit.id}`}>
            Which payment did you already record?
          </label>
          <select
            id={`payment-${deposit.id}`}
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            className="w-full rounded-input border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm"
          >
            <option value="">Choose a payment</option>
            {payments.map((payment) => (
              <option key={payment.id} value={payment.id}>{paymentLabel(payment)}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !paymentId}
              onClick={() => onDecide('already', { payment_id: paymentId })}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {busy ? 'Linking…' : 'Link payment'}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode(null)} className="btn-outline px-4">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === null && actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.includes('record') && (
            <button type="button" disabled={busy} onClick={() => setMode('record')} className="btn-primary flex-1">
              Record payment
            </button>
          )}
          {actions.includes('already') && (
            <button type="button" disabled={busy} onClick={() => setMode('already')} className="btn-outline flex-1">
              Already recorded
            </button>
          )}
          {actions.includes('not_income') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide('not_income', {})}
              className="btn-outline flex-1"
            >
              Not income
            </button>
          )}
        </div>
      )}
    </div>
  );
}
