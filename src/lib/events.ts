// ═══ Events: the feed the thread renders (alive layer items 6–8) ═══
// Pure: what an event card says, how a writer dedupes it, and which time-based
// events a sweep should emit. No Supabase, no React, so every rule has a test
// and the writers (routes) only carry data.
//
// The rules this file encodes:
//   * events are only about things the owner did NOT do (client actions,
//     server-path payments, time passing). Owner outcomes stay local cards.
//   * one real-world occurrence = one row: the writer buckets the subject.
//   * time events carry a period bucket, so a sweep that runs twice a day
//     cannot post the same card twice.

import { asKind, formatDocNumber, type DocumentKind } from '@/lib/documents';

export type EventKind =
  | 'estimate_signed'
  | 'estimate_viewed'
  | 'invoice_viewed'
  | 'payment_recorded'
  | 'paid_in_full'
  | 'deposit_received'
  | 'invoice_overdue'
  | 'invoice_due_soon'
  | 'estimate_expiring_soon'
  | 'estimate_stale'
  | 'invoice_stale'
  | 'pay_page_opened_unpaid'
  | 'draft_unsent';

export type EventTone = 'gold' | 'success' | 'overdue' | 'neutral';

export interface EventRow {
  id: string;
  user_id: string;
  kind: EventKind | string;
  actor: 'client' | 'time' | string;
  invoice_id: string | null;
  document_kind: 'invoice' | 'quote' | null;
  document_number: number | null;
  client_name: string | null;
  amount: number | null;
  meta: Record<string, unknown> | null;
  dedupe_key: string | null;
  seen_at: string | null;
  acted_at: string | null;
  acted_result: string | null;
  occurred_at: string;
}

const HOUR_MS = 3600e3;
const DAY_MS = 24 * HOUR_MS;

/** The dedupe bucket for a client action: one card per hour per subject. */
export function hourBucket(now: Date): string {
  return `${now.toISOString().slice(0, 13)}`; // YYYY-MM-DDTHH
}

/** The dedupe bucket for a time-based event: one card per period per subject. */
export function periodBucket(now: Date): string {
  return `w${Math.floor(now.getTime() / (7 * DAY_MS))}`;
}

/** `kind:subject:bucket`, bounded to the column's 200 chars. */
export function eventDedupeKey(kind: string, subject: string, bucket: string): string {
  return `${kind}:${subject}:${bucket}`.slice(0, 200);
}

/** Which events belong in the live thread: everything since this chat started,
 *  plus anything still unseen (so a chat TTL never swallows a card). */
export function eventVisibleInChat(event: Pick<EventRow, 'occurred_at' | 'seen_at'>, chatStartedAt: string): boolean {
  if (!event.seen_at) return true;
  return Date.parse(event.occurred_at) >= Date.parse(chatStartedAt);
}

const docLabel = (e: Pick<EventRow, 'document_kind' | 'document_number'>): string | null =>
  e.document_number == null ? null : formatDocNumber(e.document_kind, e.document_number);

const who = (e: Pick<EventRow, 'client_name'>) => (e.client_name || '').trim() || 'Your client';

/**
 * What the card says. One title, one detail line — no recaps, no advice, no
 * invented numbers. `money` is injected so the formatting stays the app's.
 */
export function eventCard(
  e: Pick<EventRow, 'kind' | 'client_name' | 'amount' | 'document_kind' | 'document_number' | 'meta' | 'occurred_at'>,
  money: (n: number) => string,
): { title: string; detail: string; icon: string; tone: EventTone } {
  const name = who(e);
  const doc = docLabel(e);
  const amount = typeof e.amount === 'number' ? money(e.amount) : null;
  const method = typeof e.meta?.method === 'string' ? e.meta.method : null;
  const detail = [doc, amount, method].filter(Boolean).join(' · ');

  switch (e.kind) {
    case 'estimate_signed':
      return { title: `${name} signed your estimate`, detail, icon: 'verified', tone: 'success' };
    case 'estimate_viewed':
      return { title: `${name} opened your estimate`, detail, icon: 'visibility', tone: 'neutral' };
    case 'invoice_viewed':
      return { title: `${name} opened your invoice`, detail, icon: 'visibility', tone: 'neutral' };
    case 'pay_page_opened_unpaid':
      return { title: `${name} opened the pay page`, detail, icon: 'visibility', tone: 'neutral' };
    case 'payment_recorded':
      return { title: `${name} paid ${amount ?? ''}`.trim(), detail: [doc, method].filter(Boolean).join(' · '), icon: 'payments', tone: 'gold' };
    case 'paid_in_full':
      return { title: `${name} paid in full`, detail, icon: 'payments', tone: 'gold' };
    case 'deposit_received':
      return { title: `${name}'s deposit is in`, detail, icon: 'savings', tone: 'gold' };
    case 'invoice_overdue': {
      const days = typeof e.meta?.days_late === 'number' ? e.meta.days_late : null;
      return {
        title: `${name}'s invoice is overdue`,
        detail: [detail, days != null ? `${days} ${days === 1 ? 'day' : 'days'} late` : null].filter(Boolean).join(' · '),
        icon: 'schedule',
        tone: 'overdue',
      };
    }
    case 'invoice_due_soon':
      return { title: `${name}'s invoice is due soon`, detail, icon: 'schedule', tone: 'neutral' };
    case 'estimate_expiring_soon':
      return { title: `${name}'s estimate expires soon`, detail, icon: 'schedule', tone: 'overdue' };
    case 'estimate_stale':
      return { title: `Still no answer from ${name}`, detail, icon: 'history', tone: 'neutral' };
    case 'invoice_stale':
      return { title: `${name}'s invoice is still unpaid`, detail, icon: 'history', tone: 'neutral' };
    case 'draft_unsent':
      return { title: `Draft for ${name} hasn't gone out`, detail, icon: 'edit', tone: 'neutral' };
    default:
      return { title: 'Something happened', detail, icon: 'description', tone: 'neutral' };
  }
}

/** How long a document may sit before the sweep speaks up. */
export const DUE_SOON_DAYS = 3;
export const EXPIRING_SOON_DAYS = 3;
export const STALE_DAYS = 14;
export const DRAFT_UNSENT_DAYS = 2;

/** The subset of a document row the sweep reads. */
export interface SweepDoc {
  id: string;
  kind: DocumentKind;
  status: string;
  documentNumber: number | null;
  clientName: string;
  total: number;
  amountPaid: number;
  /** YYYY-MM-DD or null. */
  dueDate: string | null;
  /** YYYY-MM-DD or null — an estimate's valid-until. */
  validUntil: string | null;
  /** ISO timestamps. */
  createdAt: string;
  sentAt: string | null;
}

export interface SweepEvent {
  kind: EventKind;
  invoiceId: string;
  documentKind: DocumentKind;
  documentNumber: number | null;
  clientName: string;
  amount: number | null;
  dedupeKey: string;
  meta: Record<string, unknown>;
}

const atNoon = (ymd: string): number => Date.parse(`${ymd}T12:00:00Z`);
const unpaid = (d: SweepDoc) => d.total > 0 && d.amountPaid < d.total;

/**
 * Which time-based events are owed right now. Pure so the thresholds are
 * testable and the route only writes what this returns. Lateness is never
 * recomputed here: `status = 'overdue'` is the database's call.
 */
export function decideSweep({ now, docs }: { now: Date; docs: SweepDoc[] }): SweepEvent[] {
  const out: SweepEvent[] = [];
  const t = now.getTime();
  const base = (d: SweepDoc) => ({
    invoiceId: d.id,
    documentKind: asKind(d.kind),
    documentNumber: d.documentNumber,
    clientName: d.clientName,
    amount: d.total > 0 ? d.total - d.amountPaid : null,
  });

  for (const d of docs) {
    if (d.kind === 'invoice') {
      if (d.status === 'overdue' && unpaid(d)) {
        out.push({
          ...base(d),
          kind: 'invoice_overdue',
          // One card per invoice per due date: the due date IS the occurrence.
          dedupeKey: eventDedupeKey('invoice_overdue', d.id, d.dueDate ?? 'none'),
          meta: {
            due_date: d.dueDate,
            days_late: d.dueDate ? Math.max(0, Math.floor((t - atNoon(d.dueDate)) / DAY_MS)) : null,
          },
        });
      } else if (d.status === 'sent' && unpaid(d) && d.dueDate) {
        const days = (atNoon(d.dueDate) - t) / DAY_MS;
        if (days >= 0 && days <= DUE_SOON_DAYS) {
          out.push({
            ...base(d),
            kind: 'invoice_due_soon',
            dedupeKey: eventDedupeKey('invoice_due_soon', d.id, d.dueDate),
            meta: { due_date: d.dueDate },
          });
        }
      }
      if ((d.status === 'sent' || d.status === 'overdue') && unpaid(d) && d.sentAt
        && (t - Date.parse(d.sentAt)) / DAY_MS >= STALE_DAYS) {
        out.push({
          ...base(d),
          kind: 'invoice_stale',
          dedupeKey: eventDedupeKey('invoice_stale', d.id, periodBucket(now)),
          meta: { sent_at: d.sentAt },
        });
      }
    } else {
      if (d.status === 'sent' && d.validUntil) {
        const days = (atNoon(d.validUntil) - t) / DAY_MS;
        if (days >= 0 && days <= EXPIRING_SOON_DAYS) {
          out.push({
            ...base(d),
            kind: 'estimate_expiring_soon',
            dedupeKey: eventDedupeKey('estimate_expiring_soon', d.id, d.validUntil),
            meta: { valid_until: d.validUntil },
          });
        }
      }
      if (d.status === 'sent' && d.sentAt && (t - Date.parse(d.sentAt)) / DAY_MS >= STALE_DAYS) {
        out.push({
          ...base(d),
          kind: 'estimate_stale',
          dedupeKey: eventDedupeKey('estimate_stale', d.id, periodBucket(now)),
          meta: { sent_at: d.sentAt },
        });
      }
    }

    if (d.status === 'draft' && (t - Date.parse(d.createdAt)) / DAY_MS >= DRAFT_UNSENT_DAYS) {
      out.push({
        ...base(d),
        kind: 'draft_unsent',
        dedupeKey: eventDedupeKey('draft_unsent', d.id, 'once'),
        meta: {},
      });
    }
  }

  return out;
}
