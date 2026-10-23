'use client';
// The "How did Maria pay?" sheet (design section C, states 3b-3f).
// Presentation only: the enabled methods come from Settings › Get Paid in that
// order, plus Other last. Confirm hands { method, paid_at } to the caller, which
// writes one invoice_payments row (lib/payment-check owns the selection rules).
//
// Structural note: the header + list + footer are separate flex children so a
// long method list scrolls inside the sheet while "Paid on" and "Confirm paid"
// stay pinned within thumb reach (state 3b2). The swipe-down hook is reused
// unchanged at its existing 100px threshold.
import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import BrandMark from '@/components/BrandMark';
import { useSheetDrag } from '@/lib/use-sheet-drag';
import { localDateString, localDateToIso } from '@/lib/record-payment';
import { formatDocNumber } from '@/lib/documents';
import { money } from '@/lib/financials';
import {
  firstName,
  paidOnLabel,
  PAYMENT_CHECK_METHOD_LABEL,
  type PaymentCheckMethod,
} from '@/lib/payment-check';

const BRAND: Partial<Record<PaymentCheckMethod, { src: string; color: string }>> = {
  zelle: { src: '/brands/zelle.svg', color: '#6D1ED4' },
  cashapp: { src: '/brands/cashapp.svg', color: '#FFFFFF' },
  paypal: { src: '/brands/paypal.svg', color: '#003087' },
  venmo: { src: '/brands/venmo.svg', color: '#008CFF' },
};

const TILE: Record<PaymentCheckMethod, string> = {
  bank: '#EDE4D3',
  zelle: '#EDE4D3',
  cashapp: '#00C244',
  paypal: '#EDE4D3',
  venmo: '#EDE4D3',
  other: '#EDE4D3',
};

const METHOD_SUB: Partial<Record<PaymentCheckMethod, string>> = {
  other: 'Cash, check, anything else',
};

function MethodMark({ method }: { method: PaymentCheckMethod }) {
  const brand = BRAND[method];
  if (brand) return <BrandMark src={brand.src} color={brand.color} className="h-6 w-6" />;
  return (
    <Icon
      name={method === 'bank' ? 'account_balance' : 'more_horiz'}
      size={method === 'other' ? 26 : 24}
      className="text-[#1E1912]"
    />
  );
}

function MiniMark({ method }: { method: PaymentCheckMethod }) {
  return (
    <span
      aria-hidden
      className="grid h-8 w-8 place-items-center rounded-[9px]"
      style={{ backgroundColor: TILE[method] }}
    >
      <MethodMark method={method} />
    </span>
  );
}

export default function PaymentCheckSheet({
  clientName,
  invoiceNumber,
  balance,
  methods,
  onClose,
  onConfirm,
}: {
  clientName: string | null;
  invoiceNumber: number;
  /** The remaining balance, not the invoice total. */
  balance: number;
  /** Enabled methods from Get Paid, in display order. Other is added here. */
  methods: PaymentCheckMethod[];
  onClose: () => void;
  /** Resolves null on success, or a message to show above Confirm. */
  onConfirm: (method: PaymentCheckMethod, paidAt: string) => Promise<string | null>;
}) {
  const name = firstName(clientName);
  const today = localDateString(new Date());
  const [selected, setSelected] = useState<PaymentCheckMethod | null>(null);
  const [paidOn, setPaidOn] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { handleProps, sheetStyle, scrimStyle } = useSheetDrag(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const enabled = methods.filter((m) => m !== 'other');
  const noMethods = enabled.length === 0;
  const rows: PaymentCheckMethod[] = [...enabled, 'other'];

  async function confirm() {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    const message = await onConfirm(selected, localDateToIso(paidOn))
      .catch(() => 'Couldn’t mark paid. Try again.');
    if (message) {
      setError(message);
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[78] flex items-end justify-center" data-no-tab-swipe="true">
      <div className="onit-composer-scrim absolute inset-0 bg-on-background/40" style={scrimStyle} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`How did ${name} pay?`}
        style={sheetStyle as CSSProperties}
        className="onit-sheet-in relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-card bg-background shadow-card-raised"
      >
        <div data-sheet-handle="" className="shrink-0 cursor-grab select-none px-4 pt-2" {...handleProps}>
          <span aria-hidden className="mx-auto block h-[5px] w-10 rounded-full bg-[#D9CDB4]" />
          <div className="flex items-start gap-2 pb-1 pt-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[22px] font-extrabold leading-tight tracking-[-.01em] text-[#1E1912]">
                How did {name} pay?
              </h2>
              <p className="mt-1 text-[15px] text-[#6B6152]">
                {formatDocNumber('invoice', invoiceNumber)} · <span className="font-bold text-[#1E1912]">{money(balance)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cancel"
              className="-mr-2 -mt-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#6B6152] transition active:scale-95"
            >
              <Icon name="close" size={22} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-1 pt-2">
          {noMethods && (
            <div className="mb-3 rounded-[20px] border-[1.5px] border-dashed border-[#D9CDB4] bg-white px-4 py-[18px] text-center">
              <div className="flex justify-center gap-1.5">
                <MiniMark method="zelle" />
                <MiniMark method="cashapp" />
                <MiniMark method="paypal" />
                <MiniMark method="venmo" />
              </div>
              <p className="mt-2 text-[16px] font-bold text-[#1E1912]">No payment methods set up</p>
              <p className="mx-auto mt-1 max-w-[270px] text-[14px] leading-[1.45] text-[#6B6152]">
                Add Bank transfer, Zelle, Cash App, PayPal or Venmo to track how clients pay.
              </p>
              <a
                href="/settings/payouts"
                className="mt-2 inline-flex min-h-12 items-center gap-1 rounded-full border-[1.5px] border-primary px-4 text-[15px] font-bold text-[#6E5409] no-underline"
              >
                Add in Settings
                <Icon name="chevron_right" size={18} />
              </a>
            </div>
          )}

          <div className="px-1 font-display text-[12px] font-extrabold uppercase tracking-[.08em] text-[#4A4234]">
            Paid with
          </div>
          <div className="mt-2 overflow-hidden rounded-[20px] border-[1.5px] border-[#E6DCC9] bg-white">
            {rows.map((method, i) => {
              const on = selected === method;
              const sub = METHOD_SUB[method];
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => { setSelected(method); setError(null); }}
                  aria-pressed={on}
                  className={`flex min-h-[64px] w-full items-center gap-3.5 px-3.5 py-2 text-left transition ${
                    i > 0 ? 'border-t border-[#EFE6D6]' : ''
                  } ${on ? 'bg-[#FAEFCF]' : 'bg-transparent'}`}
                  style={on ? { boxShadow: 'inset 0 0 0 2px #D6AE36' } : undefined}
                >
                  <span
                    aria-hidden
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px]"
                    style={{ backgroundColor: TILE[method] }}
                  >
                    <MethodMark method={method} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-medium leading-tight text-[#1E1912]">
                      {PAYMENT_CHECK_METHOD_LABEL[method]}
                    </span>
                    {sub && <span className="mt-0.5 block text-[13px] leading-snug text-[#6B6152]">{sub}</span>}
                  </span>
                  {on ? (
                    <Icon name="check_circle" size={26} className="shrink-0 text-[#B8901F]" />
                  ) : (
                    <span aria-hidden className="h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px] border-[#C9BDA6]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="relative rounded-[16px] focus-within:ring-2 focus-within:ring-primary/40">
            <input
              type="date"
              aria-label="Paid on"
              value={paidOn}
              max={today}
              onChange={(e) => {
                const v = e.target.value;
                if (v && v <= today) setPaidOn(v);
              }}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            />
            <div aria-hidden className="flex min-h-[52px] items-center gap-2.5 rounded-[16px] border-[1.5px] border-[#E6DCC9] bg-white px-3.5 text-[#1E1912]">
              <Icon name="schedule" size={22} className="text-[#6B6152]" />
              <span className="flex-1 text-left text-[16px] text-[#6B6152]">Paid on</span>
              <span className="text-[16px] font-semibold">{paidOnLabel(paidOn, new Date())}</span>
              <Icon name="expand_more" size={22} className="text-[#6B6152]" />
            </div>
          </div>

          {error && <p role="alert" className="mt-2 px-1 text-[13px] font-semibold text-error">{error}</p>}

          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!selected || saving}
            className={`mt-3 flex min-h-[56px] w-full items-center justify-center rounded-full px-4 text-[18px] font-bold transition active:scale-[0.985] ${
              selected && !saving
                ? 'bg-primary text-on-primary'
                : 'cursor-default bg-[#ECE4D4] text-[#A3978A]'
            }`}
          >
            {saving ? 'Saving…' : 'Confirm paid'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
