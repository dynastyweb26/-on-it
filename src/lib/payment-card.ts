// ═══ Payment cards in chat (alive layer §04) ═══
// A recorded payment is reported in three places: a toast, the invoice screen,
// and the conversation. The chat card is the durable one, so its copy and its
// buttons live here, pure: the component renders what this decides and nothing
// else, and a test can pin the words without a browser.
//
// Rules the copy obeys:
//   - No recaps. The card states the payment and what is left, nothing more.
//   - Paid in full carries NO second action: no receipt, no thank-you line.
//   - A deposit card states that the deposit is in and offers NO button — the
//     balance is collected on completion, not from here.
//   - Undo is offered exactly when there is a ledger row to delete, through the
//     same delete the invoice screen uses.

export type PayCardKind = 'recorded' | 'paid' | 'deposit';

export interface PayCard {
  kind: PayCardKind;
  invoiceId: string;
  invoiceNo: number | null;
  clientName: string;
  amount: number;
  method: string;
  paidAt: string;
  /** What the invoice still owes AFTER this payment. */
  left: number;
  /** The invoice total, kept for the bar so a restored card still draws one. */
  total: number;
  /** The ledger row this card reports; null when the row could not be read. */
  paymentId: string | null;
}

export type PayCardAction = 'open' | 'undo';

/** The card a payment produces: the balance decides which one it is. */
export function buildPayCard(input: {
  invoiceId: string;
  invoiceNo: number | null;
  clientName: string;
  amount: number;
  method: string;
  paidAt: string;
  paymentId: string | null;
  /** Invoice total, for the bar. 0 or less = no bar. */
  total: number;
  /** Balance after the payment. */
  left: number;
  /** True when this payment only cleared the deposit and money is still due. */
  depositOnly?: boolean;
}): PayCard {
  const left = Number.isFinite(input.left) ? Math.max(0, input.left) : 0;
  const kind: PayCardKind = left <= 0 ? 'paid' : input.depositOnly ? 'deposit' : 'recorded';
  return {
    kind,
    invoiceId: input.invoiceId,
    invoiceNo: input.invoiceNo,
    clientName: input.clientName,
    amount: input.amount,
    method: input.method,
    paidAt: input.paidAt,
    left,
    total: input.total,
    paymentId: input.paymentId,
  };
}

export function payCardTitle(kind: PayCardKind): string {
  if (kind === 'paid') return 'Paid in full';
  if (kind === 'deposit') return "Deposit's in";
  return 'Payment recorded';
}

/** The one line under the bar. A deposit card has no bar and no line. */
export function payCardLine(card: PayCard, money: (n: number) => string): string {
  if (card.kind === 'paid') return 'Nothing left to collect.';
  if (card.kind === 'deposit') return '';
  return `${money(card.left)} left`;
}

/** How much of the invoice this payment has settled, 0–100. */
export function payCardProgress(card: PayCard, total: number): number {
  if (!(total > 0)) return 0;
  const paid = Math.max(0, total - Math.max(0, card.left));
  return Math.min(100, Math.max(0, (paid / total) * 100));
}

/**
 * The card's buttons. A deposit card has none; a card with no ledger row cannot
 * offer Undo (there is nothing to delete); a paid-in-full card keeps Undo and
 * gets no second action.
 */
export function payCardActions(card: PayCard): PayCardAction[] {
  if (card.kind === 'deposit') return [];
  const out: PayCardAction[] = ['open'];
  if (card.paymentId) out.push('undo');
  return out;
}
