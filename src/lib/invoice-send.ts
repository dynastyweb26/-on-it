// Decide what a "send" write may change. Pure so the route and its tests share
// one rule: only a draft becomes sent; a resend never regresses a later state
// (paid, overdue) and never re-snapshots. Void and deleted rows are refused.
import {
  renderSnapshot,
  type RenderSnapshotSource,
} from './invoice-snapshot';

export type SendableInvoice = {
  id: string;
  user_id: string;
  status: string | null;
  deleted_at: string | null;
};

export type InvoiceSendRefusal =
  | 'not_found'
  | 'not_owner'
  | 'deleted'
  | 'void';

export type InvoiceSendPlan =
  | { ok: false; reason: InvoiceSendRefusal }
  | {
      ok: true;
      /** True only for a draft (or legacy null status): capture the snapshot. */
      firstSend: boolean;
      patch: Record<string, unknown>;
    };

export function planInvoiceSend(
  invoice: SendableInvoice | null,
  userId: string,
  profile: RenderSnapshotSource,
  sentAt: string,
): InvoiceSendPlan {
  if (!invoice) return { ok: false, reason: 'not_found' };
  if (invoice.user_id !== userId) return { ok: false, reason: 'not_owner' };
  if (invoice.deleted_at != null) return { ok: false, reason: 'deleted' };
  if (invoice.status === 'void') return { ok: false, reason: 'void' };

  const firstSend = invoice.status === 'draft' || invoice.status == null;
  return {
    ok: true,
    firstSend,
    patch: firstSend
      ? { status: 'sent', sent_at: sentAt, ...renderSnapshot(profile) }
      : { sent_at: sentAt },
  };
}
