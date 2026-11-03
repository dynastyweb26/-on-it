'use client';
// Money in: one card per deposit that still needs a decision.
//
// Two buttons, never three (CHANGES.md · item 3/B). The three paths are the
// choice, Save applies the chosen one, and Don't add moves the deposit to
// Ignored:
//
//   An existing payment      link a payment already in the ledger
//   A new payment for an invoice   write one ledger row (never offered on STRIPE)
//   Other money received     one of six classifications: two count in Collected,
//                            three are recorded and count nowhere, Unknown stays
//                            unaccounted outside every total
//
// A STRIPE descriptor is a guess, never proof: the card says so, offers no new
// payment, and the route refuses one anyway. A pending deposit cannot be saved
// yet. A deposit your bank removed offers nothing, because nothing here ever
// reverses a ledger row.
//
// Writes only through the preview-gated deposits route; the URL lives in
// lib/bank-deposits, which bank-tracking.test.ts scans.
import { useState, type Ref } from 'react';
import Icon from '@/components/Icon';
import PaymentPicker from './PaymentPicker';
import type { IconName } from '@/components/icon-names';
import {
  OTHER_MONEY_RECEIVED, classificationNote, type DepositClassification,
} from '@/lib/other-income';
import {
  DEPOSITS_URL, EXISTING_EMPTY, EXISTING_EMPTY_HELPER, depositBody, depositDoneToast,
  depositMetaLine, depositNote, depositPaths, depositRefusalMessage, depositSubmit,
  paymentCandidates, type ApiDeposit, type DepositInvoice,
  type DepositPath, type DepositPayment,
} from '@/lib/bank-deposits';
import { formatMoney } from '@/lib/bank-tracking';

const PATH_COPY: Record<DepositPath, { label: string; sub: string; icon: IconName }> = {
  existing: {
    label: 'An existing payment',
    sub: 'Link it to one you already logged',
    icon: 'link',
  },
  invoice: {
    label: 'A new payment for an invoice',
    sub: 'Marks the invoice paid',
    icon: 'receipt_long',
  },
  other: {
    label: 'Other money received',
    sub: 'Not from an invoice',
    icon: 'payments',
  },
};

const invoiceLabel = (invoice: DepositInvoice): string => {
  const number = Number.isInteger(invoice.invoice_number) && (invoice.invoice_number ?? 0) > 0
    ? `INV-${String(invoice.invoice_number).padStart(4, '0')}`
    : 'Invoice';
  const client = (invoice.client_name ?? '').trim();
  return `${number}${client ? ` · ${client}` : ''} · ${formatMoney(invoice.balance_cents / 100)}`;
};

export default function DepositCard({
  deposit, invoices, payments, headingRef, onResolved,
}: {
  deposit: ApiDeposit;
  invoices: DepositInvoice[];
  payments: DepositPayment[];
  headingRef?: Ref<HTMLHeadingElement>;
  /** A write landed: the stack drops the card and shows this toast. */
  onResolved: (id: string, toast: string, kind: string) => void;
}) {
  const paths = depositPaths(deposit);
  const candidates = paymentCandidates(payments);
  // No path is chosen for the owner: they pick. The one exception is a
  // suggestion from the bank, which opens on the invoice it points at.
  const [path, setPath] = useState<DepositPath | null>(deposit.suggestion ? 'invoice' : null);
  const [paymentId, setPaymentId] = useState('');
  const [invoiceId, setInvoiceId] = useState(deposit.suggestion?.invoice_id ?? '');
  const [classification, setClassification] = useState<DepositClassification | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = path
    ? depositSubmit(deposit, {
      path,
      payment_id: paymentId || undefined,
      invoice_id: invoiceId || undefined,
      classification: classification ?? undefined,
    })
    : null;
  const note = depositNote(deposit);
  const waiting = deposit.pending;

  async function post(action: 'record' | 'already' | 'ignored' | 'classified',
    extra: { invoice_id?: string; payment_id?: string; classification?: DepositClassification }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(DEPOSITS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(depositBody(deposit.id, action, extra)),
      });
      if (res.ok) {
        const kind = action === 'classified'
          ? 'classified'
          : action === 'ignored' ? 'ignored' : action === 'already' ? 'linked' : 'recorded';
        onResolved(deposit.id, depositDoneToast(action, extra.classification), kind);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(depositRefusalMessage(body?.error));
    } catch {
      setError(depositRefusalMessage(null));
    }
    setBusy(false);
  }

  function save() {
    if (!submit) return;
    void post(submit.action, submit.extra);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--oi-radius-card)] border border-outline-variant/70 bg-surface-container-lowest shadow-[0_14px_34px_-14px_rgba(52,40,12,.24)]">
      <div className="flex min-h-0 flex-auto flex-col gap-3.5 overflow-y-auto overscroll-contain px-[18px] py-[22px]">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="min-w-0 font-display text-[28px] font-extrabold leading-[1.12] tracking-[-0.02em] break-words outline-none"
            >
              {deposit.merchant || deposit.name}
            </h3>
            <span className="inline-flex h-[26px] shrink-0 items-center gap-1 rounded-full bg-primary-soft pl-2 pr-2.5 text-[12px] font-bold text-primary">
              <Icon name="payments" size={15} />
              Income
            </span>
            {deposit.pending && (
              <span className="inline-flex h-[26px] shrink-0 items-center rounded-full bg-surface-container-high px-2.5 text-[12px] font-bold text-on-surface-variant">
                Pending
              </span>
            )}
          </div>
          {/* date · account, the same shape as an expense card. */}
          <div className="truncate text-[15px] text-on-surface-variant">{depositMetaLine(deposit)}</div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="bank-money-in font-display text-[40px] font-extrabold leading-none tracking-[-1px] tabular-nums">
            +{formatMoney(deposit.amount_cents / 100)}
          </span>
          {Number.isInteger(deposit.suggestion?.invoice_number) && (deposit.suggestion?.invoice_number ?? 0) > 0 && (
            <span className="text-[13px] text-on-surface-variant">
              Looks like INV-{String(deposit.suggestion?.invoice_number).padStart(4, '0')}
            </span>
          )}
        </div>

        {note && <p className="text-sm leading-[1.45] text-on-surface-variant">{note}</p>}

        {!deposit.removed && (
          <div role="radiogroup" aria-label="What is this deposit?" className="flex flex-col gap-2">
            {paths.map((option) => {
              const copy = PATH_COPY[option];
              const on = path === option;
              const empty = option === 'existing' && candidates.length === 0;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={empty}
                  onClick={() => setPath(option)}
                  className={`flex min-h-[56px] items-center gap-3 rounded-[16px] border px-3.5 py-2.5 text-left transition-transform active:scale-[0.99] ${
                    on ? 'border-primary-container bg-primary-soft' : 'border-outline-variant bg-surface-container-lowest'
                  } ${empty ? 'opacity-60' : ''}`}
                >
                  <Icon name={copy.icon} size={20} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{copy.label}</span>
                    <span className="mt-px block text-[13px] text-on-surface-variant">{copy.sub}</span>
                    {empty && (
                      <span className="mt-1 block text-[13px] leading-[1.45] text-on-surface-variant">
                        {EXISTING_EMPTY} {EXISTING_EMPTY_HELPER}
                      </span>
                    )}
                  </span>
                  <span
                    aria-hidden
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                      on ? 'border-primary' : 'border-outline-variant'
                    }`}
                  >
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {path === 'invoice' && !deposit.removed && (
          <label className="block text-[13px] font-semibold" htmlFor={`invoice-${deposit.id}`}>
            Which invoice?
            <select
              id={`invoice-${deposit.id}`}
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="mt-1 w-full rounded-input border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-normal"
            >
              <option value="">Choose an invoice</option>
              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>{invoiceLabel(invoice)}</option>
              ))}
            </select>
          </label>
        )}

        {path === 'existing' && !deposit.removed && candidates.length > 0 && (
          <PaymentPicker candidates={candidates} selected={paymentId} onPick={setPaymentId} />
        )}

        {path === 'other' && !deposit.removed && (
          <div className="flex flex-col gap-2">
            <div role="radiogroup" aria-label="Other money received" className="flex flex-wrap gap-1.5">
              {OTHER_MONEY_RECEIVED.map((option) => {
                const on = classification === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setClassification(option.value)}
                    className={`h-11 rounded-full border px-3 text-sm font-semibold transition-transform active:scale-[0.96] ${
                      on ? 'border-primary-container bg-primary-soft' : 'border-outline-variant bg-surface-container-lowest'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[13px] text-on-surface-variant">
              {classification
                ? classificationNote(classification)
                : 'Pick what the money was, so the totals can say whether it counts.'}
            </p>
          </div>
        )}

        {error && <p role="alert" className="text-sm font-semibold text-on-surface-variant">{error}</p>}
      </div>

      <div className="flex shrink-0 flex-col gap-2 p-[18px] pt-3">
        {/* Exactly two, stacked full-width. */}
        {deposit.removed ? null : (
          <>
            <button
              type="button"
              disabled={busy || waiting || !submit}
              aria-busy={busy || undefined}
              onClick={save}
              className="min-h-[54px] rounded-full bg-primary-container font-display text-base font-bold text-on-background transition-transform active:scale-[0.97] disabled:opacity-60"
            >
              {waiting ? 'Waiting for the bank' : busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              disabled={busy || waiting}
              onClick={() => void post('ignored', {})}
              className="min-h-[46px] w-full rounded-full border-[1.5px] border-outline-variant bg-surface-container-lowest text-sm font-semibold transition-transform active:scale-[0.96] disabled:opacity-60"
            >
              Don&apos;t add
            </button>
          </>
        )}
      </div>
    </div>
  );
}
