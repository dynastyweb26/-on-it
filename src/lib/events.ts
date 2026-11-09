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
 * Phase 5 gate (items 19 and 25), PER KIND — deliberately a set, not a flag.
 *
 * Only `estimate_stale` is open: a sent estimate nobody answered is the card
 * item 19 asks for. `invoice_stale` stays shut because the followups cron
 * already pushes an unpaid invoice every 2 days (last_nudge_at), and
 * `draft_unsent` stays shut because the draft push already fires at 24 hours —
 * opening either here would nudge the same owner twice for one document.
 * The planner still KNOWS all three kinds and their copy, so opening one later
 * is a change to this set, not new code.
 */
export const PHASE5_TIME_EVENTS: ReadonlySet<EventKind> = new Set<EventKind>(['estimate_stale']);

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

/**
 * Item 24: the estimate_signed card.
 *
 * The RPC result already carries what the card needs, so no read is added to
 * the signature path. One card per estimate, EVER: the estimate can only be
 * signed once (`already_approved` comes back as ok:false), and the bare key
 * without a bucket makes a retry of the same signature a duplicate.
 */
export interface EstimateSignedResult {
  estimate_id: string;
  user_id: string;
  invoice_number: number;
  client_name: string | null;
  total: number | string | null;
}

export function estimateSignedEvent(r: EstimateSignedResult): SweepEvent {
  const total = Number(r.total ?? 0);
  return {
    kind: 'estimate_signed',
    invoiceId: r.estimate_id,
    documentKind: 'quote',
    documentNumber: typeof r.invoice_number === 'number' ? r.invoice_number : null,
    clientName: r.client_name ?? '',
    amount: Number.isFinite(total) && total > 0 ? total : null,
    dedupeKey: `estimate_signed:${r.estimate_id}`,
    meta: {},
  };
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

/** A short wait label for item 23: "20 min" under an hour, then "3 hr". */
const minutesLabel = (ms: number): string => {
  const minutes = Math.max(1, Math.floor(ms / 60e3));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} hr`;
};

/** The two cards that offer a decision. Everything else is read-only. */
export type EventAction = 'convert' | 'remind' | 'share';

/** Two cards open a document's own decision, and a stale estimate offers the
 *  share that already exists on its screen. Nothing else asks for anything. */
export function eventAction(kind: string): EventAction | null {
  if (kind === 'estimate_signed') return 'convert';
  if (kind === 'invoice_overdue') return 'remind';
  if (kind === 'estimate_stale') return 'share';
  return null;
}

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
    case 'pay_page_opened_unpaid': {
      // Item 23's copy: who, which invoice, what is owed, how long the page has
      // been open. The wait is frozen at the card's own moment, so an old card
      // does not keep rewriting itself as it ages in the thread.
      const at = Date.parse(e.occurred_at);
      const viewed = typeof e.meta?.viewed_at === 'string' ? Date.parse(e.meta.viewed_at) : Number.NaN;
      const waited = Number.isFinite(at) && Number.isFinite(viewed) ? minutesLabel(at - viewed) : null;
      return {
        title: `${name} opened ${doc ?? 'the pay page'} and hasn't paid yet`,
        detail: [doc, amount, waited].filter(Boolean).join(' · '),
        icon: 'visibility',
        tone: 'neutral',
      };
    }
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
    case 'estimate_stale': {
      // Item 19's copy: the client and the silence, nothing else. `days_stale`
      // is what the planner measured (4 at the threshold, more if the sweep
      // first ran later); a restored card without meta still reads "4 days".
      const days = typeof e.meta?.days_stale === 'number' && e.meta.days_stale > 0
        ? Math.floor(e.meta.days_stale)
        : STALE_DAYS;
      return {
        title: `${name}'s estimate hasn't been signed in ${days} ${days === 1 ? 'day' : 'days'}`,
        detail,
        icon: 'history',
        tone: 'neutral',
      };
    }
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
/** Phase 5 values (gated above): four days silent, and a draft unsent for a day. */
export const STALE_DAYS = 4;
export const DRAFT_UNSENT_HOURS = 24;

/**
 * Item 19's flood cap. An estimate first sent longer ago than this is abandoned
 * rather than stalled — nobody wants a card about a four-month-old quote — and
 * one sweep run posts at most STALE_PER_RUN stale cards per owner, oldest
 * first. The ones held back have no dedupe key yet (a key is only written when
 * the row is inserted), so the next run posts them.
 */
export const STALE_MAX_DAYS = 30;
export const STALE_PER_RUN = 3;
/** Item 25 reuses item 19's cap: one run posts at most three of a capped kind
 *  per owner (stale oldest first, near-due soonest first). */
export const CAP_PER_RUN = 3;

/** Item 23: the pay page counts as stuck twenty minutes after the view, and a
 *  view older than this is no longer news (the 24h catch-up window). */
export const PAY_PAGE_WAIT_MINUTES = 20;
export const PAY_PAGE_MAX_HOURS = 24;

/** The subset of a document row the sweep reads. */
export interface SweepDoc {
  id: string;
  /** The row's owner. The per-run cap counts per owner, so one large book
   *  cannot use up another owner's three cards. */
  ownerId?: string;
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
  /** The FIRST send (write-once). estimate_stale counts from here, so a resend
   *  cannot restart the clock. Null on a never-sent row. */
  firstSentAt: string | null;
  /** Last write to the row. A revision bumps it, which restarts the clock. */
  updatedAt: string | null;
  /** Signed (approved_at) — a signed estimate is never chased. */
  approvedAt: string | null;
  /** Soft-deleted rows are filtered in SQL; the planner refuses them too, so
   *  the skip is testable without a database. */
  deletedAt: string | null;
  /** A converted estimate keeps status 'sent' (the conversion lives on the new
   *  invoice's converted_from), so the writer reads this explicitly. */
  converted: boolean;
  /** Item 23: the latest CLIENT view of this document from document_views.
   *  The log already refuses the owner's own session, so a timestamp here is
   *  always someone else's view. Null when nobody has opened the link. */
  latestViewAt?: string | null;
  /** The latest positive ledger payment on this invoice (invoice_payments).
   *  Item 23 compares it with the view: money after the view is not stuck. */
  lastPaymentAt?: string | null;
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
 * Item 19's predicate: a sent estimate nobody answered.
 *
 * Counted from first_sent_at (write-once), so a resend never restarts the
 * clock. Signed (approved), converted, deleted and revoked rows are skipped,
 * and so is an estimate the owner touched in the last four days — a revision
 * is the owner acting, so the silence starts again from that edit.
 */
const staleEstimate = (d: SweepDoc, t: number): boolean => {
  if (d.kind !== 'quote' || d.status !== 'sent') return false;
  if (d.converted || d.approvedAt || d.deletedAt) return false;
  if (!d.firstSentAt) return false;
  const sent = Date.parse(d.firstSentAt);
  if (!Number.isFinite(sent) || t - sent < STALE_DAYS * DAY_MS) return false;
  // Older than the window: abandoned, not stalled. No card, ever.
  if (t - sent > STALE_MAX_DAYS * DAY_MS) return false;
  if (!d.updatedAt) return true;
  const touched = Date.parse(d.updatedAt);
  return !Number.isFinite(touched) || t - touched >= STALE_DAYS * DAY_MS;
};

/**
 * Item 23's predicate: the pay page was opened and the money never moved.
 *
 * Only a client view counts, and document_views already refuses the owner's own
 * session when it writes the row. The view has to be at least twenty minutes
 * old (the case this card is for) and inside the last 24 hours (older is no
 * longer news). A payment recorded after that view means it is not stuck.
 */
const payPageStuck = (d: SweepDoc, t: number): boolean => {
  if (d.kind !== 'invoice') return false;
  if (d.status !== 'sent' && d.status !== 'overdue') return false;
  if (d.deletedAt || !unpaid(d)) return false;
  if (!d.latestViewAt) return false;
  const viewed = Date.parse(d.latestViewAt);
  if (!Number.isFinite(viewed)) return false;
  const age = t - viewed;
  if (age < PAY_PAGE_WAIT_MINUTES * 60e3) return false;
  if (age > PAY_PAGE_MAX_HOURS * HOUR_MS) return false;
  if (!d.lastPaymentAt) return true;
  const paid = Date.parse(d.lastPaymentAt);
  return !Number.isFinite(paid) || paid <= viewed;
};

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
  posted,
  postedKeys,
}: {
  now: Date;
  docs: SweepDoc[];
  /** Which gated kinds this sweep may write. Per kind on purpose (item 19). */
  phase5?: ReadonlySet<EventKind>;
  /** Estimate ids that already have an estimate_stale card. Without this the
   *  oldest three would win the cap on every run and the rest would never
   *  post; the callers read it from the events table (item 19's flood cap). */
  posted?: ReadonlySet<string>;
  /** Dedupe keys that already posted, for the capped kinds that key on a date
   *  (item 25's near-due cards). An already-posted card does not take one of
   *  this run's three slots, so the ones held back still get their turn. */
  postedKeys?: ReadonlySet<string>;
}): SweepEvent[] {
  const out: SweepEvent[] = [];
  const t = now.getTime();
  const ownerOf = new Map(docs.map((d) => [d.id, d.ownerId ?? '']));
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
      } else if (d.status === 'sent' && unpaid(d) && d.dueDate && !d.deletedAt) {
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
      // Item 23: the twenty-minute pay-page case, sourced from document_views.
      if (payPageStuck(d, t)) {
        out.push({
          ...base(d),
          kind: 'pay_page_opened_unpaid',
          // One card per invoice per day: the day IS the occurrence, so the
          // next day's still-unpaid visit can speak again.
          dedupeKey: eventDedupeKey('pay_page_opened_unpaid', d.id, now.toISOString().slice(0, 10)),
          meta: { viewed_at: d.latestViewAt },
        });
      }
      if (phase5.has('invoice_stale') && (d.status === 'sent' || d.status === 'overdue') && unpaid(d) && d.sentAt
        && (t - Date.parse(d.sentAt)) / DAY_MS >= STALE_DAYS) {
        out.push({
          ...base(d),
          kind: 'invoice_stale',
          dedupeKey: eventDedupeKey('invoice_stale', d.id, periodBucket(now)),
          meta: { sent_at: d.sentAt },
        });
      }
    } else {
      // Item 25: a signed, converted or deleted estimate is not expiring — the
      // same three skips the stale predicate makes. Without these a converted
      // estimate kept status 'sent' and could still be announced as expiring.
      if (d.status === 'sent' && d.validUntil && !d.converted && !d.approvedAt && !d.deletedAt) {
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
      if (phase5.has('estimate_stale') && !posted?.has(d.id) && staleEstimate(d, t)) {
        const sent = d.firstSentAt as string;
        out.push({
          ...base(d),
          kind: 'estimate_stale',
          // One card per estimate, EVER: the 4-day threshold IS the bucket, so
          // a second sweep (or the next day's cron) writes nothing.
          dedupeKey: eventDedupeKey('estimate_stale', d.id, `${STALE_DAYS}d`),
          meta: {
            first_sent_at: sent,
            days_stale: Math.floor((t - Date.parse(sent)) / DAY_MS),
          },
        });
      }
    }

    if (phase5.has('draft_unsent') && d.status === 'draft' && (t - Date.parse(d.createdAt)) / HOUR_MS >= DRAFT_UNSENT_HOURS) {
      out.push({
        ...base(d),
        kind: 'draft_unsent',
        dedupeKey: eventDedupeKey('draft_unsent', d.id, 'once'),
        meta: {},
      });
    }
  }

  // The flood cap (item 19, reused by item 25): at most CAP_PER_RUN cards of a
  // capped kind per owner per run — stale oldest first, near-due soonest first.
  // Cards already posted do not take a slot. The client-action and
  // document-state cards keep their own dedupe and are all returned.
  const cappedAt = (e: SweepEvent): number => {
    if (e.kind === 'estimate_stale') return Date.parse(String(e.meta.first_sent_at ?? ''));
    if (e.kind === 'invoice_due_soon') return Date.parse(`${String(e.meta.due_date)}T12:00:00Z`);
    if (e.kind === 'estimate_expiring_soon') return Date.parse(`${String(e.meta.valid_until)}T12:00:00Z`);
    if (e.kind === 'pay_page_opened_unpaid') return Date.parse(String(e.meta.viewed_at ?? ''));
    return Number.NaN;
  };
  const capped: ReadonlySet<string> = new Set([
    'estimate_stale', 'invoice_due_soon', 'estimate_expiring_soon', 'pay_page_opened_unpaid',
  ]);
  const kept = new Set<string>();
  const perOwnerKind = new Map<string, number>();
  for (const kind of capped) {
    const rows = out
      .filter((e) => e.kind === kind && !postedKeys?.has(e.dedupeKey))
      .sort((a, b) => cappedAt(a) - cappedAt(b));
    for (const e of rows) {
      const slot = `${ownerOf.get(e.invoiceId) ?? ''}|${kind}`;
      const n = perOwnerKind.get(slot) ?? 0;
      if (n >= CAP_PER_RUN) continue;
      perOwnerKind.set(slot, n + 1);
      kept.add(e.dedupeKey);
    }
  }

  return out.filter((e) => !capped.has(e.kind) || kept.has(e.dedupeKey));
}

/** A message the thread is holding, as far as ordering is concerned. Messages
 *  saved before `at` existed carry no timestamp, and cannot place anything. */
/**
 * Item 19's rule: a time event is a card in the thread, never a toast. The
 * toast is for something a link holder did while the owner was away; "four
 * days passed" is not news to interrupt anyone with, and item 19's card is the
 * whole surface. Client events keep their toast exactly as before.
 */
export function eventToasts(e: Pick<EventRow, 'actor' | 'kind'>): boolean {
  return e.actor !== 'time';
}

/**
 * Where the time sweep may run. Preview and production share one database, so a
 * preview sweep would post real cards into real threads; this is the same rule
 * the draft-nudge and recap cron steps use (`deployEnv() === 'production'`).
 */
export function sweepAllowedIn(env: 'production' | 'preview' | 'development'): boolean {
  return env === 'production';
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
