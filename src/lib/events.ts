// ═══ Events: the feed the thread renders (alive layer items 6–10) ═══
// Pure: what an event card says, how a writer dedupes it, which time-based
// events a sweep may emit, and where a card sits among the messages. No
// Supabase, no React, so every rule has a test and the writers (routes) only
// carry data.
//
// The rules this file encodes:
//   * events are only about things the owner did NOT do (client actions,
//     server-path payments, time passing). Owner outcomes stay local cards.
//   * one real-world occurrence = one row: the writer buckets the subject.
//   * time events carry a period bucket, so a sweep that runs twice a day
//     cannot post the same card twice.

import { asKind, formatDocNumber, type DocumentKind } from '@/lib/documents';

/**
 * Phase 5 gate (items 19 and 25). The planner KNOWS these three kinds and the
 * card copy for them exists, but nothing may be written until Phase 5 is
 * asked for: a stale invoice, a stale estimate and an unsent draft are the
 * "chase them again" feed, which is not this phase's job. Flip this one
 * constant when 19/25 open; the thresholds below are already Phase 5's
 * (stale = 4 days, draft = 24 hours), not the 14 days / 2 days a pre-review
 * draft of this file carried.
 */
export const PHASE5_TIME_EVENTS = false;

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

/** The two cards that offer a decision. Everything else is read-only. */
export type EventAction = 'convert' | 'remind';

/** Only a signed estimate and an overdue invoice ask something of the owner. */
export function eventAction(kind: string): EventAction | null {
  if (kind === 'estimate_signed') return 'convert';
  if (kind === 'invoice_overdue') return 'remind';
  return null;
}

/** Tile tints from the design (01 toast, 07 cards): bg + glyph colour. */
export type EventTint = 'signed' | 'paid' | 'partial' | 'overdue' | 'view' | 'deposit';

export interface EventCardModel {
  title: string;
  detail: string;
  icon: string;
  tone: EventTone;
  tint: EventTint;
  /** Partial payments draw the bar: paid / total, 0..100. */
  bar: { pct: number } | null;
  /** The small chip some chat cards carry ("Deposit"). */
  chip: string | null;
  /** The mono meta line above a chat card's title ("Deposit received"). */
  metaLabel: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 2 -> "2nd", 3 -> "3rd", 11 -> "11th". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + 'th';
  return n + (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
}

const dueLabel = (iso: unknown): string | null => {
  if (typeof iso !== 'string') return null;
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (Number.isNaN(d.getTime())) return null;
  return 'due ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * What the card says: the design's copy (On_It_Alive_Layer 01 + 07), one title
 * and one detail line. `money` is injected so the formatting stays the app's.
 * `when` is the time text a signed card carries ("just now" on a toast, a clock
 * time in the thread); other kinds never print a time.
 */
export function eventCard(
  e: Pick<EventRow, 'kind' | 'client_name' | 'amount' | 'document_kind' | 'document_number' | 'meta' | 'occurred_at'>,
  money: (n: number) => string,
  opts: { when?: string } = {},
): EventCardModel {
  const name = who(e);
  const doc = docLabel(e);
  const amount = typeof e.amount === 'number' ? money(e.amount) : null;
  const method = typeof e.meta?.method === 'string' ? e.meta.method : null;
  const total = num(e.meta?.total);
  const balance = num(e.meta?.balance);
  const base = { bar: null, chip: null, metaLabel: null };
  const detail = [doc, amount, method].filter(Boolean).join(' · ');

  switch (e.kind) {
    case 'estimate_signed':
      return { ...base, title: `${name} signed your estimate`, detail: [doc, amount, opts.when].filter(Boolean).join(' · '), icon: 'verified', tone: 'success', tint: 'signed' };
    case 'estimate_viewed': {
      const nth = num(e.meta?.nth_today);
      return {
        ...base,
        title: `${name} opened your estimate`,
        detail: [doc, amount, nth && nth >= 2 ? `${ordinal(nth)} time today` : null].filter(Boolean).join(' · '),
        icon: 'visibility', tone: 'neutral', tint: 'view',
      };
    }
    case 'invoice_viewed':
      return {
        ...base,
        title: `${name} viewed their invoice`,
        detail: [doc, amount, dueLabel(e.meta?.due)].filter(Boolean).join(' · '),
        icon: 'find_in_page', tone: 'neutral', tint: 'view',
      };
    case 'pay_page_opened_unpaid':
      return { ...base, title: `${name} opened the pay page`, detail, icon: 'visibility', tone: 'neutral', tint: 'view' };
    case 'payment_recorded': {
      if (amount && total != null && balance != null && balance > 0 && total > 0) {
        const paid = Math.max(0, total - balance);
        return {
          ...base,
          title: `${name} paid ${amount} of ${money(total)}`,
          detail: [doc, `${money(balance)} left`].join(' · '),
          icon: 'toll', tone: 'gold', tint: 'partial',
          bar: { pct: Math.max(0, Math.min(100, (paid / total) * 100)) },
        };
      }
      return { ...base, title: `${name} paid ${amount ?? ''}`.trim(), detail: [doc, method].filter(Boolean).join(' · '), icon: 'payments', tone: 'gold', tint: 'paid' };
    }
    case 'paid_in_full':
      return { ...base, title: `${name} paid ${amount ?? ''}`.trim(), detail: [doc, method, 'paid in full'].filter(Boolean).join(' · '), icon: 'payments', tone: 'gold', tint: 'paid' };
    case 'deposit_received':
      return {
        ...base,
        title: amount ? `${amount} deposit from ${name}` : `${name}'s deposit is in`,
        detail: [doc, balance != null && balance > 0 ? `${money(balance)} due on completion` : null].filter(Boolean).join(' · '),
        icon: 'verified_user', tone: 'gold', tint: 'deposit', chip: 'Deposit', metaLabel: 'Deposit received',
      };
    case 'invoice_overdue': {
      const days = num(e.meta?.days_late);
      return {
        ...base,
        title: `${name}'s invoice is overdue`,
        detail: [detail, days != null ? `${days} ${days === 1 ? 'day' : 'days'} late` : null].filter(Boolean).join(' · '),
        icon: 'schedule', tone: 'overdue', tint: 'overdue',
      };
    }
    case 'invoice_due_soon':
      return { ...base, title: `${name}'s invoice is due soon`, detail, icon: 'schedule', tone: 'neutral', tint: 'view' };
    case 'estimate_expiring_soon':
      return { ...base, title: `${name}'s estimate expires soon`, detail, icon: 'schedule', tone: 'overdue', tint: 'overdue' };
    case 'estimate_stale':
      return { ...base, title: `Still no answer from ${name}`, detail, icon: 'history', tone: 'neutral', tint: 'view' };
    case 'invoice_stale':
      return { ...base, title: `${name}'s invoice is still unpaid`, detail, icon: 'history', tone: 'neutral', tint: 'view' };
    case 'draft_unsent':
      return { ...base, title: `Draft for ${name} hasn't gone out`, detail, icon: 'edit', tone: 'neutral', tint: 'view' };
    default:
      return { ...base, title: 'Something happened', detail, icon: 'description', tone: 'neutral', tint: 'view' };
  }
}

/** How long a document may sit before the sweep speaks up. */
export const DUE_SOON_DAYS = 3;
export const EXPIRING_SOON_DAYS = 3;
/** Phase 5 values (gated above): four days silent, and a draft unsent for a day. */
export const STALE_DAYS = 4;
export const DRAFT_UNSENT_HOURS = 24;

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
 *
 * `phase5` defaults to the constant above, so the gated kinds are known,
 * tested, and still never written.
 */
export function decideSweep({
  now,
  docs,
  phase5 = PHASE5_TIME_EVENTS,
}: {
  now: Date;
  docs: SweepDoc[];
  phase5?: boolean;
}): SweepEvent[] {
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
      if (phase5 && (d.status === 'sent' || d.status === 'overdue') && unpaid(d) && d.sentAt
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
      if (phase5 && d.status === 'sent' && d.sentAt && (t - Date.parse(d.sentAt)) / DAY_MS >= STALE_DAYS) {
        out.push({
          ...base(d),
          kind: 'estimate_stale',
          dedupeKey: eventDedupeKey('estimate_stale', d.id, periodBucket(now)),
          meta: { sent_at: d.sentAt },
        });
      }
    }

    if (phase5 && d.status === 'draft' && (t - Date.parse(d.createdAt)) / HOUR_MS >= DRAFT_UNSENT_HOURS) {
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

/** A message the thread is holding, as far as ordering is concerned. Messages
 *  saved before `at` existed carry no timestamp, and cannot place anything. */
export interface ChatAnchor {
  id: string;
  at?: number;
}

/**
 * Where each event card belongs among the messages (item 8/10).
 *
 * New messages carry `at` (epoch ms); a card is rendered immediately before the
 * first timestamped message that happened at or after it. Cards older than the
 * oldest timestamped message, and cards newer than the last message, render at
 * the end as one group — exactly the pre-interleave behaviour, so an old
 * thread reads the same as it did yesterday.
 */
export function splitEventsByMessage(
  events: EventRow[],
  messages: ChatAnchor[],
): { between: Record<string, EventRow[]>; trailing: EventRow[] } {
  const between: Record<string, EventRow[]> = {};
  const trailing: EventRow[] = [];
  const ascending = [...events].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));

  const anchors = messages.filter((m): m is ChatAnchor & { at: number } => typeof m.at === 'number');
  if (anchors.length === 0) return { between, trailing: ascending };

  const firstAt = anchors[0].at;
  for (const e of ascending) {
    const t = Date.parse(e.occurred_at);
    if (!Number.isFinite(t) || t < firstAt) { trailing.push(e); continue; }
    const anchor = anchors.find((m) => m.at >= t);
    if (!anchor) { trailing.push(e); continue; }
    (between[anchor.id] ??= []).push(e);
  }
  return { between, trailing };
}

/** A view this soon after the send is the owner's own test tap or a link
 *  preview, not the client reading it. */
export const VIEW_GRACE_MS = 2 * 60 * 1000;

/**
 * Should a client view of an estimate post an `estimate_viewed` card? Not once
 * it is signed (the signed card says more), and not within two minutes of the
 * send. A missing send time cannot be judged, so it does not block.
 */
export function shouldPostEstimateViewed(
  e: { approvedAt: string | null; sentAt: string | null },
  now: Date,
): boolean {
  if (e.approvedAt) return false;
  if (e.sentAt) {
    const sent = Date.parse(e.sentAt);
    if (Number.isFinite(sent) && now.getTime() - sent < VIEW_GRACE_MS) return false;
  }
  return true;
}

/** The dedupe key for the one card a signature earns. */
export const estimateSignedDedupeKey = (estimateId: string): string => `estimate_signed:${estimateId}`;

/** Every kind the app knows, for the preview emitter's `?kind=`. */
const ESTIMATE_STORED_KIND = 'quote' as const; // the stored value, never printed

export const EVENT_KINDS: readonly EventKind[] = [
  'estimate_signed', 'estimate_viewed', 'invoice_viewed', 'payment_recorded', 'paid_in_full',
  'deposit_received', 'invoice_overdue', 'invoice_due_soon', 'estimate_expiring_soon',
  'estimate_stale', 'invoice_stale', 'pay_page_opened_unpaid', 'draft_unsent',
];

export const isEventKind = (v: string): v is EventKind => (EVENT_KINDS as readonly string[]).includes(v);

/** Fake, clearly-labelled fields for one event of `kind`. No real document is
 *  referenced, so nothing in the shared database is touched. */
export function testEventFields(kind: EventKind): {
  actor: 'client' | 'time';
  documentKind: 'invoice' | 'quote';
  documentNumber: number;
  clientName: string;
  amount: number | null;
  meta: Record<string, unknown>;
} {
  const isEstimate = kind.startsWith('estimate_') || kind === 'draft_unsent';
  const documentKind: 'invoice' | 'quote' = 'invoice';
  const time = ['invoice_overdue', 'invoice_due_soon', 'estimate_expiring_soon', 'estimate_stale', 'invoice_stale', 'draft_unsent'].includes(kind);
  const meta: Record<string, unknown> = { test: true };
  if (kind === 'payment_recorded' || kind === 'paid_in_full' || kind === 'deposit_received') meta.method = 'Zelle';
  if (kind === 'invoice_overdue') meta.days_late = 3;
  return {
    actor: time ? 'time' : 'client',
    documentKind: isEstimate ? ESTIMATE_STORED_KIND : documentKind,
    documentNumber: 9999,
    clientName: 'Test Client',
    amount: kind === 'estimate_viewed' || kind === 'invoice_viewed' || kind === 'pay_page_opened_unpaid' ? null : 25,
    meta,
  };
}

/**
 * When did THIS thread start? The oldest timestamped message it holds, so a
 * refresh that restores the saved chat keeps the cards that landed during it.
 * Using the moment the page mounted instead drops every seen card on reload.
 * A thread with no timestamped message (an old save) falls back to `fallbackMs`.
 */
export function chatStartedAtFrom(messages: ReadonlyArray<{ at?: number }>, fallbackMs: number): string {
  let oldest = Infinity;
  for (const m of messages) if (typeof m.at === 'number' && m.at < oldest) oldest = m.at;
  return new Date(Number.isFinite(oldest) ? oldest : fallbackMs).toISOString();
}
