// Web-push rendering of a NotifyEvent: the only place notification copy lives.
// iOS web push shows title + body only (no images, no action buttons), so every
// message must stand on its own in two short lines. No emojis.
import { money } from '@/lib/financials';
import { formatDocNumber } from '@/lib/documents';
import type { NotifyEvent, PaymentMethod } from './types';

export type WebPushMessage = {
  title: string;
  body: string;
  url: string;   // same-origin path the notification opens
  tag: string;   // a newer notification with the same tag replaces the older
};

const VIA: Record<PaymentMethod, string> = {
  card: 'via card',
  cashapp: 'via Cash App Pay',
  other: 'online',
};

export function renderWebPush(event: NotifyEvent): WebPushMessage {
  switch (event.type) {
    case 'payment_received': {
      const no = formatDocNumber('invoice', event.invoiceNumber);
      return {
        title: `${event.clientName} just paid ${money(event.amount)}`,
        body: event.paidInFull
          ? `${no} — paid in full ${VIA[event.method]}.`
          : `${no} — ${money(event.balanceRemaining)} still due.`,
        url: `/invoices/${event.invoiceId}`,
        tag: `payment-${event.invoiceId}`,
      };
    }
    case 'connect_problem': {
      const copy = {
        charges_paused: ['Card payments are paused', 'Stripe paused card payments on your account. Tap to see why.'],
        details_needed: ['Stripe needs one more detail', 'Tap to fix it in Settings.'],
        payouts_paused: ['Payouts are paused', 'Stripe needs something before it can pay you out. Tap to fix.'],
        disconnected:   ['Stripe is disconnected', 'Card payments are off. Tap to reconnect in Settings.'],
      }[event.problem];
      return { title: copy[0], body: copy[1], url: '/settings', tag: 'connect' };
    }
  }
}
