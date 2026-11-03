'use client';
// The "An existing payment" list: one row per payment the owner already logged,
// leading with the client and the money, then the invoice and the day. The
// candidates arrive from the deposits route already filtered to manual rows no
// deposit link names.
import Icon from '@/components/Icon';
import { paymentRowSub, paymentRowTitle, type DepositPayment } from '@/lib/bank-deposits';

export default function PaymentPicker({
  candidates, selected, onPick,
}: {
  candidates: DepositPayment[];
  selected: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="text-[13px] font-semibold">Which payment is this deposit for?</div>
        <p className="mt-0.5 text-[13px] leading-[1.45] text-on-surface-variant">
          Pick a payment you already logged. It links them so the money isn’t counted twice.
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label="Which payment is this deposit for?"
        className="overflow-hidden rounded-[14px] border border-outline-variant bg-surface-container-lowest"
      >
        {candidates.map((payment) => {
          const on = selected === payment.id;
          return (
            <button
              key={payment.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(payment.id)}
              className={`flex min-h-[56px] w-full items-center gap-3 border-b border-outline-variant/60 px-3.5 py-2.5 text-left last:border-b-0 ${
                on ? 'bg-primary-soft' : ''
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{paymentRowTitle(payment)}</span>
                <span className="mt-px block truncate text-[13px] text-on-surface-variant">
                  {paymentRowSub(payment)}
                </span>
              </span>
              <span
                aria-hidden
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                  on ? 'border-primary' : 'border-outline-variant'
                }`}
              >
                {on && <Icon name="check" size={14} className="text-primary" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
