'use client';
// A bank-verified row's detail (SPEC.txt · E5). One action: Unlink, which drops
// the tag and sends the charge back to Unaccounted for. No write: the item's
// fixture status goes back to open, so it reappears in the pinned row and the
// Books dot with it.
import Icon from '@/components/Icon';
import BankSheet from './BankSheet';
import { formatDay, formatMoney } from '@/lib/bank-tracking';

export default function BankRowDetail({ merchant, amount, date, account, onUnlink, onClose }: {
  merchant: string;
  amount: number;
  date: string;
  account: string;
  onUnlink: () => void;
  onClose: () => void;
}) {
  return (
    <BankSheet label={`${merchant} details`} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.06em] text-primary">
            <Icon name="check_circle" size={14} />
            Bank-verified
          </span>
          <h2 className="mt-2 truncate font-display text-xl font-extrabold">{merchant}</h2>
          <p className="text-sm text-on-surface-variant">{formatDay(date)} · {account}</p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-container-high"
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="my-3 flex items-center justify-between rounded-[16px] bg-surface-container-low px-4 py-3">
        <span className="text-sm text-on-surface-variant">Amount</span>
        <span className="font-display text-lg font-extrabold tabular-nums">{formatMoney(amount)}</span>
      </div>

      <p className="pb-3 text-sm leading-[1.45] text-on-surface-variant">
        Unlinking sends this charge back to Unaccounted for. Your bank records are not changed.
      </p>

      <button
        type="button"
        onClick={onUnlink}
        className="min-h-[52px] w-full rounded-full border-[1.5px] border-outline-variant font-semibold transition-transform active:scale-[0.97]"
      >
        Unlink
      </button>
    </BankSheet>
  );
}
