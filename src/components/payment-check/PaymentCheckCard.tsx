'use client';
// The persistent "Has Maria paid yet?" card above the Chat composer (design
// section A, cards 1a/1b/1c). It is presentation + two actions:
//   Yes  → open the method sheet (the write happens on Confirm there)
//   No/X → snooze this invoice for a day and advance the queue
// After a successful write the same footprint becomes the confirmation row
// with Undo; the queue owns the 4-second hold.
import Icon from '@/components/Icon';
import { money } from '@/lib/financials';
import { formatDocNumber } from '@/lib/documents';
import { localDateString } from '@/lib/record-payment';
import {
  firstName,
  paidOnLabel,
  paymentCheckCount,
  paymentCheckStatus,
  remainingBalance,
  PAYMENT_CHECK_METHOD_LABEL,
  type PaymentCheckInvoice,
  type PaymentCheckMethod,
} from '@/lib/payment-check';

export default function PaymentCheckCard({
  invoice,
  index,
  total,
  done,
  onYes,
  onNo,
  onSnooze,
  onUndo,
}: {
  invoice: PaymentCheckInvoice;
  /** Zero-based position in the fetched queue; the total stays the original N. */
  index: number;
  total: number;
  /** Present during the 4s confirmation hold. */
  done?: { method: PaymentCheckMethod; paidAt: string } | null;
  onYes: () => void;
  onNo: () => void;
  onSnooze: () => void;
  /** Omitted until the Undo path lands; the confirmation row then has no pill. */
  onUndo?: () => void;
}) {
  const balance = remainingBalance(invoice);
  const docNo = formatDocNumber('invoice', invoice.invoice_number);

  if (done) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="onit-prompt-in flex items-center gap-3 rounded-[22px] border border-[#E6DCC9] bg-[#FFFAF1] py-3 pl-3.5 pr-3 shadow-[0_8px_24px_rgba(60,40,10,.13),0_1px_2px_rgba(60,40,10,.08)]"
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#D3F1DB] text-[#17703A]"
        >
          <Icon name="check_circle" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold leading-tight text-[#1E1912]">
            Marked paid via {PAYMENT_CHECK_METHOD_LABEL[done.method]}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-[#6B6152]">
            {docNo} · {money(balance)} · {paidOnLabel(localDateString(new Date(done.paidAt)), new Date())}
          </div>
        </div>
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="h-11 shrink-0 rounded-full bg-[#F1E3B5] px-4 text-[15px] font-bold text-[#6E5409] transition active:scale-95"
          >
            Undo
          </button>
        )}
      </div>
    );
  }

  const status = paymentCheckStatus(invoice, new Date(), localDateString(new Date()));

  return (
    <div
      role="region"
      aria-label="Payment check"
      className="onit-prompt-in flex flex-col gap-2.5 rounded-[22px] border border-[#E6DCC9] bg-[#FFFAF1] px-4 pb-3.5 pt-3 shadow-[0_8px_24px_rgba(60,40,10,.13),0_1px_2px_rgba(60,40,10,.08)]"
    >
      <div className="flex items-center gap-2">
        <span className="font-display text-[11px] font-bold uppercase tracking-[.08em] text-[#8A6A12]">
          Payment check
        </span>
        <span className="flex-1" />
        <span className="text-[13px] font-semibold text-[#6B6152]">
          {paymentCheckCount(index, total)}
        </span>
        <button
          type="button"
          onClick={onSnooze}
          aria-label="Snooze until tomorrow"
          className="-my-1.5 -mr-2 grid h-9 w-9 place-items-center rounded-full text-[#6B6152] transition active:scale-95"
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="flex items-baseline gap-3">
        <div className="min-w-0 flex-1 text-[19px] font-bold leading-tight tracking-[-.01em] text-[#1E1912]">
          Has {firstName(invoice.client_name)} paid yet?
        </div>
        <div className="shrink-0 text-[19px] font-bold tabular-nums text-[#1E1912]">
          {money(balance)}
        </div>
      </div>

      <div className="-mt-1.5 flex flex-wrap gap-1.5 text-[14px] text-[#6B6152]">
        <span className="truncate">
          {docNo} · {invoice.client_name || 'Client'} ·
        </span>
        <span className={status.overdue ? 'font-semibold text-[#A3361F]' : ''}>
          {status.text}
        </span>
      </div>

      <div className="mt-0.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onYes}
          className="flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-[16px] bg-primary px-2 py-2 text-on-primary transition active:scale-[0.985]"
        >
          <span className="text-[17px] font-bold leading-none">Yes</span>
          <span className="text-[12px] font-medium text-[#4A3A0A]">Marks as paid</span>
        </button>
        <button
          type="button"
          onClick={onNo}
          className="flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-[16px] border-[1.5px] border-[#D9CDB4] bg-transparent px-2 py-2 text-[#1E1912] transition active:scale-[0.985]"
        >
          <span className="text-[17px] font-bold leading-none">No</span>
          {/* No client-reminder flow exists yet: v1 snoozes this invoice for a day. */}
          <span className="text-[12px] font-medium text-[#6B6152]">Snooze for a day</span>
        </button>
      </div>
    </div>
  );
}
