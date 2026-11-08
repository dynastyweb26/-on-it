'use client';
// The chat's payment cards (alive layer §04): "Payment recorded" with what is
// left, "Paid in full", and the deposit card with no button. Copy and buttons
// are decided by lib/payment-card; this only draws them, in the same anatomy and
// tokens as every other card in the conversation.
import Icon from '@/components/Icon';
import { money } from '@/lib/financials';
import { methodLabel, type PaymentMethod } from '@/lib/record-payment';
import { payCardActions, payCardLine, payCardProgress, payCardTitle, type PayCard } from '@/lib/payment-card';

export default function PaymentCard({ card, onOpen, onUndo }: {
  card: PayCard;
  onOpen: (invoiceId: string) => void;
  onUndo: (paymentId: string) => void;
}) {
  const actions = payCardActions(card);
  const pct = payCardProgress(card, card.total);
  return (
    <div className="mt-2 w-full rounded-[18px] border border-outline-variant/50 bg-surface-container p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-container text-on-background">
          <Icon name={card.kind === 'paid' ? 'check' : 'payments'} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-on-surface">{payCardTitle(card.kind)}</p>
          <p className="truncate text-[12px] text-on-surface-variant">
            {card.kind === 'deposit' ? '' : `${money(card.amount)} · `}
            {methodLabel(card.method as PaymentMethod)}
          </p>
        </div>
      </div>

      {card.kind !== 'deposit' && (
        <>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-outline-variant/40">
            <div className="h-full rounded-full bg-primary-container transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[13px] font-semibold text-on-surface">{payCardLine(card, money)}</p>
        </>
      )}
      {card.kind === 'deposit' && (
        <p className="mt-2 text-[13px] font-semibold text-paid">Deposit&apos;s in.</p>
      )}

      {actions.length > 0 && (
        <div className="mt-2 flex items-center gap-3">
          {actions.includes('open') && (
            <button
              type="button"
              className="min-h-touch text-[13px] font-semibold text-primary transition active:opacity-60"
              onClick={() => onOpen(card.invoiceId)}
            >
              Open invoice
            </button>
          )}
          {actions.includes('undo') && card.paymentId && (
            <button
              type="button"
              className="min-h-touch text-[13px] font-semibold text-on-surface-variant underline transition active:opacity-60"
              onClick={() => onUndo(card.paymentId as string)}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
