'use client';
// A payment queued while offline. The invoice keeps its balance and reads
// "Payment pending: $X" until the server confirms the row — it never shows as
// paid on the strength of a local write.
import Icon from '@/components/Icon';
import { money } from '@/lib/financials';
import type { QueuedPayment } from '@/lib/payment-queue';

export default function PendingPaymentNotice({ entries }: { entries: QueuedPayment[] }) {
  const waiting = entries.filter((e) => e.status === 'pending');
  const total = waiting.reduce((s, e) => s + e.amount, 0);
  if (!waiting.length) return null;
  return (
    <div role="status" className="mt-3 flex items-start gap-2.5 rounded-input bg-surface-container-high px-4 py-3">
      <Icon name="pending" size={20} className="mt-0.5 shrink-0 text-on-surface-variant" />
      <div className="min-w-0">
        <p className="font-semibold text-on-background">Payment pending: {money(total)}</p>
        <p className="mt-0.5 text-[13px] leading-[18px] text-on-surface-variant">
          {waiting.length === 1 ? '1 payment waiting to sync' : `${waiting.length} payments waiting to sync`}.
          {' '}The invoice stays unpaid until the server confirms it.
        </p>
      </div>
    </div>
  );
}
