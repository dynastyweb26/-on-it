// Notification events — STRUCTURED data, never finished text. Each channel
// (web push today; APNs/FCM later) renders its own copy from these, so adding a
// channel never touches the call sites in the webhooks.

export type PaymentMethod = 'card' | 'cashapp' | 'other';

export type ConnectProblem =
  | 'charges_paused'   // stripe_charges_enabled true → false
  | 'details_needed'   // stripe_details_submitted true → false
  | 'payouts_paused'   // stripe_payouts_enabled true → false
  | 'disconnected';    // account.application.deauthorized / v2 account closed

export type NotifyEvent =
  | {
      type: 'payment_received';
      paymentId: string;          // invoice_payments.id — the dedupe identity
      invoiceId: string;
      invoiceNumber: number;
      clientName: string;
      amount: number;             // what Stripe charged, dollars
      method: PaymentMethod;
      balanceRemaining: number;   // after this payment
      paidInFull: boolean;
    }
  | {
      type: 'connect_problem';
      problem: ConnectProblem;
      sourceEventId: string;      // Stripe event / notification id (audit)
    }
  | {
      type: 'invoice_viewed';     // first qualifying client view (mark_invoice_viewed)
      invoiceId: string;          // the dedupe identity: one push per invoice, ever
      invoiceNumber: number;
      clientName: string;
    }
  | {
      type: 'draft_unsent';       // an invoice draft that was never sent
      invoiceId: string;          // the dedupe identity: one nudge per draft, ever
      invoiceNumber: number;
      clientName: string;
      total: number;
    }
  | {
      type: 'recap';              // weekly / monthly "Your week is ready" (lib/notify/recaps)
      recapId: string;            // recaps.id — the tap opens /dashboard?recap=<id>
      kind: 'week' | 'month';
      periodStart: string;        // yyyy-mm-dd; with kind + user, the dedupe identity
    };

export type NotifyEventType = NotifyEvent['type'];
