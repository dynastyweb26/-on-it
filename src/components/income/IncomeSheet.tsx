'use client';
// Add income, edit an other-income row, or read a customer payment.
//
// A hand-typed row is Other income — one of the two classifications that count
// in Collected — and it writes through /api/income, which takes user_id from the
// session. Editing never touches a row's classification or its deposit link, so
// a deposit's decision cannot be turned into a hand-typed one. Deleting is a
// soft delete: the row leaves Collected and the ledger keeps its history.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { incomeDateOptions, incomeError, parseIncomeInput } from '@/lib/income-form';
import { incomeMoney, type IncomeRow } from '@/lib/income';
import { formatDay, todayIso } from '@/lib/bank-tracking';

export type IncomeSheetState =
  | { mode: 'add' }
  | { mode: 'edit'; row: IncomeRow }
  | { mode: 'payment'; row: IncomeRow };

const INCOME_URL = '/api/income';

export default function IncomeSheet({ state, onClose, onSaved }: {
  state: IncomeSheetState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const editing = state.mode === 'edit';
  const row = state.mode === 'add' ? null : state.row;
  const [amount, setAmount] = useState(row ? (row.amountCents / 100).toFixed(2) : '');
  const [title, setTitle] = useState(row && state.mode === 'edit' ? row.title : '');
  const [client, setClient] = useState(row?.client ?? '');
  const [date, setDate] = useState(row?.date ?? todayIso());
  const [note, setNote] = useState(row?.note ?? '');
  // A bank deposit decided this row: its amount and its delete belong to that
  // deposit, so the sheet shows neither.
  const fromDeposit = Boolean(editing && row?.fromDeposit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    const parsed = parseIncomeInput({
      amount, title, client_name: client, received_on: date, note,
    });
    if (!parsed.ok) { setError(incomeError(parsed.code)); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(INCOME_URL, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(editing ? { id: row?.id, ...parsed.value } : parsed.value),
      });
      if (res.ok) { onSaved(); return; }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(incomeError(body?.error));
    } catch {
      setError(incomeError(null));
    }
    setBusy(false);
  }

  async function remove() {
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(INCOME_URL, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      });
      if (res.ok) { onSaved(); return; }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(incomeError(body?.error));
    } catch {
      setError(incomeError(null));
    }
    setBusy(false);
  }

  const field = 'w-full rounded-input border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-[16px] outline-none';

  const body = state.mode === 'payment' && row ? (
    <div className="space-y-3">
      <p className="text-sm text-on-surface-variant">
        Money received against an invoice. Payments are recorded from the invoice, so
        this is read-only.
      </p>
      <div className="rounded-[18px] bg-surface-container-low px-4 py-3.5">
        <div className="text-[11px] font-bold uppercase tracking-[.14em] text-on-surface-variant">Payment</div>
        <div className="mt-1 text-[17px] font-semibold">{row.title}</div>
        <div className="mt-1 text-[13px] text-on-surface-variant">{formatDay(row.date)} · {row.detail}</div>
        <div className="mt-2 font-display text-[22px] font-extrabold tabular-nums" style={{ color: 'var(--oi-green)' }}>
          {incomeMoney(row.amountCents)}
        </div>
        {row.bankVerified && (
          <div className="mt-2 text-[12.5px] font-semibold text-primary">Bank-verified · matched to a bank deposit</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => router.push(`/invoices/${row.id}`)}
        className="min-h-[46px] w-full rounded-full border-[1.5px] border-outline-variant bg-surface-container-lowest text-sm font-semibold"
      >
        Open the invoice
      </button>
    </div>
  ) : (
    <div className="space-y-3">
      {fromDeposit ? (
        <p className="rounded-[14px] bg-surface-container-low px-3.5 py-2.5 text-[13px] text-on-surface-variant">
          This income came from a bank deposit, so its amount is the deposit's. Undo it from Bank activity.
        </p>
      ) : (
      <label className="block text-[13px] font-semibold">
        Amount
        <span className="mt-1 flex items-center gap-1 rounded-input border border-outline-variant bg-surface-container-lowest px-3">
          <span aria-hidden className="font-display text-[22px] font-extrabold" style={{ color: 'var(--oi-green)' }}>+$</span>
          <input
            inputMode="decimal"
            aria-label="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className="min-h-touch min-w-0 flex-1 bg-transparent py-2 font-display text-[22px] font-extrabold tabular-nums outline-none"
            placeholder="0.00"
          />
        </span>
      </label>
      )}
      <label className="block text-[13px] font-semibold">
        What was it for?
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={`mt-1 ${field}`} placeholder="Storage unit rent" />
      </label>
      <label className="block text-[13px] font-semibold">
        Client <span className="font-normal text-on-surface-variant">(optional)</span>
        <input value={client} onChange={(e) => setClient(e.target.value)} className={`mt-1 ${field}`} placeholder="Who paid it" />
      </label>
      <div>
        <span className="block text-[13px] font-semibold">When it arrived</span>
        <div role="radiogroup" aria-label="When it arrived" className="mt-1 flex flex-wrap gap-1.5">
          {incomeDateOptions(editing ? row?.date ?? null : null, todayIso()).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={date === value}
              onClick={() => setDate(value)}
              className={`h-11 rounded-full border px-3 text-sm font-semibold ${
                date === value ? 'border-primary-container bg-primary-soft' : 'border-outline-variant bg-surface-container-lowest'
              }`}
            >
              {formatDay(value)}
            </button>
          ))}
        </div>
      </div>
      <label className="block text-[13px] font-semibold">
        Note <span className="font-normal text-on-surface-variant">(optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`mt-1 ${field}`} />
      </label>
      <p className="text-[13px] text-on-surface-variant">Counts in Collected as Other income.</p>
      {error && <p role="alert" className="text-sm font-semibold text-on-surface-variant">{error}</p>}
    </div>
  );

  return createPortal(
    <div data-bank-motion className="fixed inset-0 z-[88] flex items-end justify-center md:items-center">
      <div aria-hidden onClick={onClose} className="absolute inset-0" style={{ background: 'var(--oi-scrim)' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={state.mode === 'payment' ? 'Payment detail' : editing ? 'Edit income' : 'Add income'}
        className="bank-sheet-up relative flex max-h-[88dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-[var(--oi-radius-sheet)] bg-background shadow-card-raised md:rounded-[var(--oi-radius-sheet)]"
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between px-4">
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-surface-container-high active:scale-90">
            <Icon name="close" size={22} />
          </button>
          <span className="font-display text-[17px] font-extrabold">
            {state.mode === 'payment' ? 'Payment' : editing ? 'Edit income' : 'Add income'}
          </span>
          <span aria-hidden className="h-11 w-11" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{body}</div>
        {state.mode !== 'payment' && (
          <div className="flex shrink-0 flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="min-h-[54px] rounded-full bg-primary-container font-display text-base font-bold text-on-background disabled:opacity-60"
            >
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add income'}
            </button>
            {editing && !fromDeposit && (
              <button
                type="button"
                disabled={busy}
                onClick={() => (confirming ? void remove() : setConfirming(true))}
                className="min-h-[46px] w-full rounded-full border-[1.5px] border-outline-variant text-sm font-semibold text-on-surface-variant"
              >
                {confirming ? 'Tap again to delete' : 'Delete this income'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
