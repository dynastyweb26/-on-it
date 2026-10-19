'use client';
// Record payment — the invoice detail bottom sheet (invoice detail redesign).
// Presentation only: every selection is mapped by lib/record-payment into the
// exact { amount, method, paid_at } the page's recordPayment already inserted.
// The custom keypad means the OS keyboard never covers the form; the only native
// input is the hidden date picker on "Other day".
import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import BrandMark from '@/components/BrandMark';
import type { IconName } from '@/components/icon-names';
import { useSheetDrag } from '@/lib/use-sheet-drag';
import { KEYS, pressKey, type Key } from '@/lib/keypad';
import { money } from '@/lib/financials';
import {
  PAYMENT_METHODS, buildRecordPayment, localDateString, methodLabel, payAmountValue,
  yesterdayString, type PayDateMode, type PayMode, type PaymentMethod, type RecordPaymentInput,
} from '@/lib/record-payment';

const METHOD_ICONS: Partial<Record<PaymentMethod, IconName>> = {
  card: 'credit_card', bank: 'account_balance', other: 'more_horiz',
};

// Same marks and brand colours as the Payouts screen.
const METHOD_MARKS: Partial<Record<PaymentMethod, { src: string; color: string }>> = {
  zelle: { src: '/brands/zelle.svg', color: '#6D1ED4' },
  cashapp: { src: '/brands/cashapp.svg', color: '#00D632' },
  paypal: { src: '/brands/paypal.svg', color: '#003087' },
  venmo: { src: '/brands/venmo.svg', color: '#008CFF' },
};

function MethodMark({ method }: { method: PaymentMethod }) {
  const mark = METHOD_MARKS[method];
  if (mark) return <BrandMark src={mark.src} color={mark.color} className="h-[18px] w-[18px]" />;
  return <Icon name={METHOD_ICONS[method] ?? 'payments'} size={18} />;
}

const shortDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function RecordPaymentSheet({
  clientName, balance, depositRemaining, onClose, onSave,
}: {
  clientName: string;
  /** The full amount still owed against the total. */
  balance: number;
  /** The deposit still due; 0 when the invoice has none. */
  depositRemaining: number;
  onClose: () => void;
  /** Same save path as the page's recordPayment; resolves false on failure. */
  onSave: (input: RecordPaymentInput) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<PayMode>('full');
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('zelle');
  const [dateMode, setDateMode] = useState<PayDateMode>('today');
  const [pickedDate, setPickedDate] = useState(() => localDateString(new Date()));
  const [saving, setSaving] = useState(false);
  const { handleProps, sheetStyle, scrimStyle } = useSheetDrag(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const press = (k: Key) => setAmountText((t) => pressKey(t, k, 'price'));

  const amount = payAmountValue(mode, amountText, balance, depositRemaining);
  const valid = amount > 0;
  const hasDeposit = depositRemaining > 0;

  const modes: { key: PayMode; top: string; main: string }[] = [
    { key: 'full', top: 'Paid in full', main: money(balance) },
    ...(hasDeposit ? [{ key: 'deposit' as PayMode, top: 'Deposit', main: money(depositRemaining) }] : []),
    { key: 'other', top: 'Partial', main: mode === 'other' && amountText ? `$${amountText}` : 'Other amount' },
  ];

  let leavesText = 'Type the amount received';
  let leavesTone = 'text-on-surface-variant';
  if (mode === 'other') {
    if (balance > 0 && amount > balance + 1e-9) { leavesText = `More than the ${money(balance)} balance`; leavesTone = 'text-error'; }
    else if (valid && Math.abs(amount - balance) < 1e-9) { leavesText = 'Pays it off in full'; leavesTone = 'text-paid'; }
    else if (valid) { leavesText = `Leaves ${money(Math.max(0, balance - amount))} due`; }
  }

  const saveLabel = mode === 'full'
    ? `Mark paid · ${money(balance)} ${methodLabel(method)}`
    : mode === 'deposit'
      ? `Record deposit · ${money(depositRemaining)} ${methodLabel(method)}`
      : valid ? `Save ${money(amount)}` : 'Enter an amount';

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    const ok = await onSave(buildRecordPayment({
      mode, amountText, balance, depositRemaining, method, dateMode, pickedDate, now: new Date(),
    }));
    // A success unmounts the sheet from the parent; only a failure stays open.
    if (!ok) setSaving(false);
  }

  const dateTiles: { key: PayDateMode; top: string; sub: string }[] = [
    { key: 'today', top: 'Today', sub: shortDay(localDateString(new Date())) },
    { key: 'yesterday', top: 'Yesterday', sub: shortDay(yesterdayString(new Date())) },
  ];

  const tileBase = 'flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[14px] border text-[13px] font-semibold transition';
  const selected = 'border-primary-container bg-primary-container/10 text-on-background';
  const unselected = 'border-outline-variant/50 bg-surface-container-lowest text-on-surface-variant';

  return createPortal(
    <div className="fixed inset-0 z-[78] flex items-end justify-center" data-no-tab-swipe="true">
      <div className="onit-composer-scrim absolute inset-0 bg-on-background/40" style={scrimStyle} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Record payment"
        style={sheetStyle as CSSProperties}
        className="onit-sheet-in relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-card bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card-raised"
      >
        <div data-sheet-handle="" className="cursor-grab select-none" {...handleProps}>
          <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-outline-variant" />
          <div className="flex items-start gap-3 pb-1 pt-2">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-bold text-on-background">Record payment</h2>
              <p className="mt-0.5 truncate text-[13px] text-on-surface-variant">
                {clientName} · {money(balance)} balance
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-container text-on-surface-variant transition active:scale-95"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        {/* Amount mode */}
        <div className="mt-2 grid grid-cols-2 gap-2.5">
          {modes.map((m) => {
            const on = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                aria-pressed={on}
                className={`relative flex min-h-[62px] flex-col items-start justify-center gap-0.5 rounded-[16px] border-2 px-3.5 py-2.5 text-left transition ${
                  on ? 'border-primary-container bg-primary-container/10' : 'border-outline-variant/50 bg-surface-container-lowest'
                }`}
              >
                <span className="text-[13px] font-semibold text-on-surface-variant">{m.top}</span>
                <span className="font-display text-[17px] font-bold text-on-background">{m.main}</span>
                {on && (
                  <span aria-hidden className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-primary-container text-on-background">
                    <Icon name="check" size={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {mode === 'other' && (
          <>
            <div className="mt-3.5 flex flex-col items-center">
              <div className={`font-display text-[42px] font-bold leading-tight tracking-tight tabular-nums ${amountText ? 'text-on-background' : 'text-on-surface-variant/40'}`}>
                ${amountText || '0'}
              </div>
              <div className={`text-[13px] font-semibold ${leavesTone}`}>{leavesText}</div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={k === 'back' ? 'Delete digit' : k}
                  onClick={() => press(k)}
                  className="grid h-[46px] place-items-center rounded-[12px] bg-surface-container font-display text-[21px] font-semibold text-on-background transition active:bg-surface-container-high"
                >
                  {k === 'back' ? <Icon name="backspace" size={22} /> : k}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mx-1 mb-2 mt-4 text-[12px] font-bold uppercase tracking-[.08em] text-on-surface-variant">Paid with</div>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.filter((m) => m.value !== 'other').map((m) => {
            const on = method === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                aria-pressed={on}
                className={`${tileBase} ${on ? selected : unselected}`}
              >
                <MethodMark method={m.value} />
                <span className="whitespace-nowrap">{m.label}</span>
              </button>
            );
          })}
        </div>
        {PAYMENT_METHODS.filter((m) => m.value === 'other').map((m) => {
          const on = method === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => setMethod(m.value)}
              aria-pressed={on}
              className={`mt-2 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[14px] border text-[13px] font-semibold transition ${
                on ? selected : unselected
              }`}
            >
              <MethodMark method={m.value} />
              <span>{m.label}</span>
            </button>
          );
        })}

        <div className="mx-1 mb-2 mt-4 text-[12px] font-bold uppercase tracking-[.08em] text-on-surface-variant">Date received</div>
        <div className="grid grid-cols-3 gap-2">
          {dateTiles.map((d) => {
            const on = dateMode === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setDateMode(d.key)}
                aria-pressed={on}
                className={`${tileBase} ${on ? selected : unselected}`}
              >
                <span className="text-[14px] font-semibold text-on-background">{d.top}</span>
                <span className="text-[12px] text-on-surface-variant">{d.sub}</span>
              </button>
            );
          })}
          {/* "Other day" is a real date picker: an invisible input covers the tile. */}
          <div className={`${tileBase} relative overflow-hidden ${dateMode === 'other' ? selected : unselected}`}>
            <span className="text-[14px] font-semibold text-on-background">Other day</span>
            <span className="text-[12px] text-on-surface-variant">{dateMode === 'other' ? shortDay(pickedDate) : 'Calendar'}</span>
            <input
              type="date"
              aria-label="Pick a date"
              value={pickedDate}
              onChange={(e) => {
                setPickedDate(e.target.value || localDateString(new Date()));
                setDateMode('other');
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={!valid || saving}
          className={`mt-4 flex min-h-touch w-full items-center justify-center rounded-[16px] px-3 py-2 text-center text-[16px] font-bold leading-tight transition active:scale-[0.985] disabled:opacity-60 ${
            valid ? 'bg-primary-container text-on-background' : 'bg-surface-container-high text-on-surface-variant'
          }`}
        >
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}
