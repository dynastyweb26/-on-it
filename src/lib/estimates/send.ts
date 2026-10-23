// Owner send/resend for an estimate. Reuses planInvoiceSend so a first send
// captures the same render snapshot as an invoice, then adds the estimate-only
// rules: approved/converted rows are refused, and a missing valid_until is set
// to the business-local date + 30 days on ANY send (legacy NULL rows that are
// never sent stay NULL and never expire).
import { planInvoiceSend, type SendableInvoice } from '@/lib/invoice-send';
import type { RenderSnapshotSource } from '@/lib/invoice-snapshot';
import {
  defaultValidUntil,
  isDateOnly,
  isOnOrAfterToday,
  resolveTimeZone,
} from './dates';

export type EstimateSendableInvoice = SendableInvoice & {
  kind?: string | null;
  approved_at?: string | null;
  valid_until?: string | null;
};

export type EstimateSendProfile = RenderSnapshotSource & {
  timezone?: string | null;
};

export type EstimateSendRefusal =
  | 'not_found'
  | 'not_owner'
  | 'deleted'
  | 'void'
  | 'not_estimate'
  | 'approved'
  | 'converted'
  | 'invalid_date'
  | 'past_date';

export type EstimateSendPlan =
  | { ok: false; code: EstimateSendRefusal }
  | { ok: true; firstSend: boolean; patch: Record<string, unknown> };

export function planEstimateSend(
  invoice: EstimateSendableInvoice | null,
  userId: string,
  profile: EstimateSendProfile,
  now: Date,
  opts: { converted: boolean; requestedValidUntil?: string | null },
): EstimateSendPlan {
  if (!invoice) return { ok: false, code: 'not_found' };
  if (invoice.kind !== 'quote') return { ok: false, code: 'not_estimate' };
  if (invoice.user_id !== userId) return { ok: false, code: 'not_owner' };
  if (invoice.deleted_at != null) return { ok: false, code: 'deleted' };
  if (invoice.approved_at != null) return { ok: false, code: 'approved' };
  if (opts.converted) return { ok: false, code: 'converted' };

  const plan = planInvoiceSend(invoice, userId, profile, now.toISOString());
  if (!plan.ok) {
    const code: EstimateSendRefusal =
      plan.reason === 'void'
        ? 'void'
        : plan.reason === 'not_owner'
          ? 'not_owner'
          : plan.reason === 'deleted'
            ? 'deleted'
            : 'not_found';
    return { ok: false, code };
  }

  const tz = resolveTimeZone(profile.timezone);
  const requested = opts.requestedValidUntil?.trim() || null;
  if (requested) {
    if (!isDateOnly(requested)) return { ok: false, code: 'invalid_date' };
    if (!isOnOrAfterToday(requested, now, tz)) return { ok: false, code: 'past_date' };
  }

  const patch: Record<string, unknown> = { ...plan.patch };
  if (requested) {
    patch.valid_until = requested;
  } else if (invoice.valid_until == null) {
    // Any send (first or resend) fills a missing expiry. A legacy row that is
    // never sent through this route keeps NULL and therefore never expires.
    patch.valid_until = defaultValidUntil(now, tz);
  }

  return { ok: true, firstSend: plan.firstSend, patch };
}
