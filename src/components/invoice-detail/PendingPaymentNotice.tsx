'use client';
// Queued payments for one invoice. Two states, never mixed:
//   pending   — waiting for a connection. The invoice stays unpaid.
//   attention — the server refused it (or it aged out). Shows the mapped
//               reason and the amount, with Retry / Edit / Discard. Nothing is
//               dropped without the user's say.
import Icon from '@/components/Icon';
import { money } from '@/lib/financials';
import type { QueuedPayment } from '@/lib/payment-queue';

export default function PendingPaymentNotice({ entries, onRetry, onEdit, onDiscard }: {
  entries: QueuedPayment[];
  onRetry: () => void;
  onEdit: (entry: QueuedPayment) => void;
  onDiscard: (entry: QueuedPayment) => void;
}) {
  const waiting = entries.filter((e) => e.status === 'pending');
  const attention = entries.filter((e) => e.status === 'attention');
  const total = waiting.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      {waiting.length > 0 && (
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
      )}
      {attention.map((e) => (
        <div key={e.key} role="alert" className="mt-3 rounded-input bg-error-container px-4 py-3">
          <p className="font-semibold text-error-on-container">{money(e.amount)} needs attention</p>
          <p className="mt-0.5 text-[13px] leading-[18px] text-error-on-container/90">
            {e.reason ?? 'This payment could not be recorded.'}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-outline flex-1 px-3 py-2 text-sm" onClick={onRetry}>Retry</button>
            <button type="button" className="btn-outline flex-1 px-3 py-2 text-sm" onClick={() => onEdit(e)}>Edit</button>
            <button type="button"
              className="flex-1 rounded-full border border-error/30 px-3 py-2 text-sm font-semibold text-error"
              onClick={() => onDiscard(e)}>
              Discard
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
