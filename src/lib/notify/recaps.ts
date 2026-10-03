// Weekly / monthly recaps: the push "Your week is ready" / "Your September is
// ready" — "Tap to see how you did." (RECAP-SPEC §8; copy in notify/render).
//
// Runs as a step of the daily /api/followups cron (Hobby plan: no extra cron
// entry), production only. For every owner, in their own timezone
// (profiles.timezone; America/Chicago when null or unknown):
//   • local Monday → recap the previous Mon–Sun;
//   • local 1st    → recap the previous calendar month;
//   • both on one day → build both snapshots, push only the monthly one (the
//     weekly one if the month turned out empty).
//
// Numbers follow the Books summary / buildSummaryPdf rules, so a recap equals
// what the Summary screen and its PDFs show for the same range:
//   • income   = invoice_payments with paid_at inside the range (owner's local
//     midnights), on invoices only (kind = 'invoice', never quotes) that are
//     not soft-deleted — summed by summarizeIncome;
//   • expenses = non-deleted expenses with spent_on inside the range — rolled
//     up by summarize(); top_category is its first row (highest spend, stored
//     as the category key), top_vendor the store with the highest spend inside
//     that category.
//
// Each snapshot also stores the full story payload (recaps.payload, built by
// lib/recap/payload: daily series, top client/store, payment methods, still
// owed, quotes pending, change vs the previous period …), so the story shows
// the same numbers every time it is opened.
//
// Insert-once: a snapshot is written the first time its period closes and a
// cron re-run never changes it (on conflict do nothing — seen_at and
// prompted_at are untouched too). The push goes through notify(), whose
// notification_log dedupe key recap:<kind>:<user>:<period_start> makes a
// re-run a no-op.
//
// A "nothing at all" period (nothing in, out, owed or paid) still gets a
// snapshot, so Books can show "Quiet week", but never a push (and the app
// shows no prompt for it). Owners who have never created an invoice or an
// expense get no snapshots at all.
//
// Recaps are a paid feature: with the paywall on, only owners on a paid tier
// (PAID_TIERS — founder, trialing, active, past_due) get a snapshot or a push;
// free and canceled owners are skipped before any numbers are read. With the
// paywall off everyone with activity gets one. The push additionally
// needs recap_push on and a device in THIS environment (checked first, so the
// dedupe key is never claimed for an owner nobody can reach). With push off
// the snapshot still shows in the app (Books card, history, Watch/Later sheet).
//
// Nothing runs until launch: RECAPS_LIVE (lib/recaps-live) off → no snapshot,
// no push.
import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { deployEnv } from '@/lib/deploy-env';
import { notify } from '@/lib/notify';
import { roundCurrency } from '@/lib/financials';
import { summarize, summarizeIncome, type ExpenseLite, type PaymentLite } from '@/lib/tax-summary';
import { isExpenseCategory } from '@/lib/expenses';
import { PAYWALL_ENABLED, isPaidTier } from '@/lib/paywall';
import { RECAPS_LIVE } from '@/lib/recaps-live';
import {
  addDays, localYmd, periodsEndingBefore, previousPeriod, resolveTimeZone, zonedMidnight, type RecapPeriod,
} from '@/lib/recap/dates';
import {
  buildRecapPayload, recapAnnounces, RECAP_PAYLOAD_VERSION,
  type RecapExpenseRow, type RecapInput, type RecapPaymentRow,
} from '@/lib/recap/payload';

const PAGE_ROWS = 1000;   // PostgREST cap; long reads are paged
const CONCURRENCY = 6;    // owners processed at once

// Periods and local dates live in lib/recap/dates (pure, unit-tested); re-exported here.
export {
  DEFAULT_RECAP_TZ, resolveTimeZone, localYmd, addDays, periodsEndingBefore, zonedMidnight,
  type RecapKind, type RecapPeriod,
} from '@/lib/recap/dates';
export type RecapRunSummary = {
  candidates: number;     // owner-periods closing today
  built: number;          // new snapshots written this run
  existing: number;       // already written by an earlier run (left untouched)
  quiet: number;          // "nothing at all" snapshots (no push)
  skipped_inactive: number; // owner has never created an invoice or expense
  pushed: number;
};

// ── Numbers ───────────────────────────────────────────────────────────
type Admin = ReturnType<typeof adminClient>;
type Row = Record<string, unknown>;

async function fetchAll(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE_ROWS) return out;
  }
}

export type RecapNumbers = {
  income: number; expenses: number; net: number;
  payments_count: number; expenses_count: number;
  top_category: string | null; top_category_amount: number | null; top_vendor: string | null;
};

/** Pure rollup of already-filtered rows (exported for tests). */
export function rollUp(expenseRows: Row[], paymentRows: Row[], period: RecapPeriod): RecapNumbers {
  const spend = summarize(expenseRows as unknown as ExpenseLite[]);
  const income = summarizeIncome(
    paymentRows.map((p): PaymentLite => ({ amount: p.amount as number | string, paid_at: p.paid_at as string, client_name: 'Client' })),
    [],
    // Rows are already range-filtered by instant; 'all' keeps summarizeIncome
    // from re-bucketing by the server's (UTC) local day.
    { id: 'recap', granularity: 'all', label: '', friendlyLabel: '', start: period.start, end: period.end },
  );
  const top = spend.rows[0];
  let topVendor: string | null = null;
  if (top) {
    // Highest-spend store inside the top category (same key rule as summarize).
    const byVendor = new Map<string, { name: string; total: number }>();
    for (const e of expenseRows) {
      // The category key summarize() files a row under (unknown → 'other').
      if ((isExpenseCategory(e.category) ? e.category : 'other') !== top.category) continue;
      const name = String(e.vendor ?? '').trim();
      if (!name) continue;
      const k = name.toLowerCase();
      const cur = byVendor.get(k) ?? { name, total: 0 };
      cur.total += Number(e.amount) || 0;
      byVendor.set(k, cur);
    }
    let best: { name: string; total: number } | null = null;
    for (const v of byVendor.values()) if (!best || v.total > best.total) best = v;
    topVendor = best ? best.name.slice(0, 120) : null;
  }
  const inc = roundCurrency(income.broughtIn);
  const exp = roundCurrency(spend.total);
  return {
    income: inc,
    expenses: exp,
    net: roundCurrency(inc - exp),
    payments_count: income.byClient.reduce((s, c) => s + c.count, 0),
    expenses_count: spend.count,
    top_category: top ? top.category : null,
    top_category_amount: top ? roundCurrency(top.total) : null,
    top_vendor: topVendor,
  };
}

/** The period's expense and payment rows (the Summary/PDF filters), with the
 *  columns both the number columns and the story payload need. */
export async function loadPeriodRows(admin: Admin, userId: string, period: RecapPeriod, tz: string) {
  const [expenses, payments] = await Promise.all([
    fetchAll((from, to) => admin
      .from('expenses')
      .select('id, amount, category, vendor, spent_on')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('spent_on', period.start)
      .lte('spent_on', period.end)
      .order('id', { ascending: true })
      .range(from, to)),
    fetchAll((from, to) => admin
      .from('invoice_payments')
      .select('id, amount, paid_at, method, invoices!inner(kind, deleted_at, client_name)')
      .eq('user_id', userId)
      .eq('invoices.kind', 'invoice')
      .is('invoices.deleted_at', null)
      .gte('paid_at', zonedMidnight(period.start, tz).toISOString())
      .lt('paid_at', zonedMidnight(addDays(period.end, 1), tz).toISOString())
      .order('id', { ascending: true })
      .range(from, to)),
  ]);
  return { expenses, payments };
}

async function loadNumbers(admin: Admin, userId: string, period: RecapPeriod, tz: string): Promise<RecapNumbers> {
  const rows = await loadPeriodRows(admin, userId, period, tz);
  return rollUp(rows.expenses, rows.payments, period);
}

const embedded = (v: unknown): Row => (Array.isArray(v) ? (v[0] ?? {}) : (v ?? {})) as Row;

/** Everything buildRecapPayload needs beyond the period's own rows: what is
 *  still owed and pending as of now, the invoices paid in the period, and the
 *  previous period's totals for the change chip. */
export async function loadRecapInput(
  admin: Admin, userId: string, period: RecapPeriod, tz: string,
  rows: { expenses: Row[]; payments: Row[] },
): Promise<RecapInput> {
  const from = zonedMidnight(period.start, tz).toISOString();
  const until = zonedMidnight(addDays(period.end, 1), tz).toISOString();
  const [owed, paid, quotes, converted, previous] = await Promise.all([
    // Still owed: the Books "Still owed" rows (sent/overdue invoices, not deleted).
    fetchAll((f, t) => admin.from('invoices')
      .select('id, client_name, total, amount_paid, viewed_at, sent_at, first_sent_at')
      .eq('user_id', userId).eq('kind', 'invoice').in('status', ['sent', 'overdue']).is('deleted_at', null)
      .order('id', { ascending: true }).range(f, t)),
    // Paid in the period (the caught-up bundle).
    fetchAll((f, t) => admin.from('invoices')
      .select('id, client_name, total, paid_at')
      .eq('user_id', userId).eq('kind', 'invoice').eq('status', 'paid').is('deleted_at', null)
      .gte('paid_at', from).lt('paid_at', until)
      .order('id', { ascending: true }).range(f, t)),
    // Quotes waiting on an answer: sent, not deleted, never converted.
    fetchAll((f, t) => admin.from('invoices')
      .select('id')
      .eq('user_id', userId).eq('kind', 'quote').eq('status', 'sent').is('deleted_at', null)
      .order('id', { ascending: true }).range(f, t)),
    fetchAll((f, t) => admin.from('invoices')
      .select('id, converted_from')
      .eq('user_id', userId).not('converted_from', 'is', null)
      .order('id', { ascending: true }).range(f, t)),
    loadNumbers(admin, userId, previousPeriod(period), tz),
  ]);
  const answered = new Set(converted.map((r) => r.converted_from as string));

  return {
    period,
    tz,
    payments: rows.payments.map((p): RecapPaymentRow => ({
      amount: p.amount as number | string,
      paid_at: p.paid_at as string,
      method: (p.method as string | null) ?? null,
      client_name: (embedded(p.invoices).client_name as string | null) ?? null,
    })),
    expenses: rows.expenses.map((e): RecapExpenseRow => ({
      amount: e.amount as number | string,
      category: (e.category as string | null) ?? null,
      vendor: (e.vendor as string | null) ?? null,
      spent_on: e.spent_on as string,
    })),
    owed: owed.map((o) => ({
      client_name: (o.client_name as string | null) ?? null,
      total: o.total as number | string,
      amount_paid: (o.amount_paid as number | string | null) ?? null,
      viewed_at: (o.viewed_at as string | null) ?? null,
      sent_at: ((o.sent_at ?? o.first_sent_at) as string | null) ?? null,
    })),
    paid: paid.map((p) => ({
      client_name: (p.client_name as string | null) ?? null,
      total: p.total as number | string,
      paid_at: p.paid_at as string,
    })),
    quotesPending: quotes.filter((q) => !answered.has(q.id as string)).length,
    previous: { income: previous.income, expenses: previous.expenses },
  };
}

// ── Run ───────────────────────────────────────────────────────────────
type Owner = { id: string; tz: string; push: boolean; periods: RecapPeriod[] };
export type Built = { period: RecapPeriod; id: string; numbers: RecapNumbers; announce: boolean };

/** Has this owner ever created an invoice/quote or an expense (deleted or not)? */
async function everActive(admin: Admin, userId: string): Promise<boolean> {
  const [inv, exp] = await Promise.all([
    admin.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', userId).limit(1),
    admin.from('expenses').select('id', { count: 'exact', head: true }).eq('user_id', userId).limit(1),
  ]);
  if (inv.error || exp.error) throw inv.error ?? exp.error;
  return (inv.count ?? 0) > 0 || (exp.count ?? 0) > 0;
}

export type OwnerRecaps = { inactive: boolean; built: number; existing: number; quiet: number; rows: Built[] };

/** Build (insert-once) one owner's snapshots for `periods`. Shared by the
 *  daily run's per-owner work. Never pushes. */
export async function buildOwnerRecaps(admin: Admin, userId: string, tz: string, periods: RecapPeriod[]): Promise<OwnerRecaps> {
  const out: OwnerRecaps = { inactive: false, built: 0, existing: 0, quiet: 0, rows: [] };
  if (!(await everActive(admin, userId))) { out.inactive = true; return out; }
  for (const period of periods) {
    const rows = await loadPeriodRows(admin, userId, period, tz);
    const numbers = rollUp(rows.expenses, rows.payments, period);
    const payload = buildRecapPayload(await loadRecapInput(admin, userId, period, tz, rows));
    const announce = recapAnnounces(payload);
    if (!announce) out.quiet++;

    // Insert-once: an existing snapshot (an earlier run) is never rewritten.
    const { data, error } = await admin
      .from('recaps')
      .upsert(
        {
          user_id: userId, kind: period.kind, period_start: period.start, period_end: period.end,
          ...numbers, payload, payload_version: RECAP_PAYLOAD_VERSION,
        },
        { onConflict: 'user_id,kind,period_start', ignoreDuplicates: true },
      )
      .select('id');
    if (error) { console.error('recaps: insert failed', error.code ?? error.message); continue; }
    let id = (data?.[0]?.id as string | undefined) ?? null;
    if (id) out.built++;
    else {
      out.existing++;
      const { data: row } = await admin.from('recaps').select('id')
        .eq('user_id', userId).eq('kind', period.kind).eq('period_start', period.start).maybeSingle();
      id = (row?.id as string | undefined) ?? null;
    }
    if (id) out.rows.push({ period, id, numbers, announce });
  }
  return out;
}

/** One push per run: the monthly recap when there is one, else the weekly —
 *  and never for a "nothing at all" period. */
export function pushPick(rows: Built[]): Built | undefined {
  const announced = rows.filter((b) => b.announce);
  return announced.find((b) => b.period.kind === 'month') ?? announced[0];
}

export const recapEvent = (b: Built) =>
  ({ type: 'recap', recapId: b.id, kind: b.period.kind, periodStart: b.period.start }) as const;

export async function runRecaps(now = new Date()): Promise<RecapRunSummary> {
  const summary: RecapRunSummary = { candidates: 0, built: 0, existing: 0, quiet: 0, skipped_inactive: 0, pushed: 0 };
  if (!RECAPS_LIVE) return summary; // launch switch (lib/recaps-live): nothing built or pushed
  const admin = adminClient();

  let profiles: Row[];
  try {
    profiles = await fetchAll((from, to) => admin
      .from('profiles')
      .select('id, timezone, recap_push, access_tier')
      .order('id', { ascending: true })
      .range(from, to));
  } catch (e) {
    console.error('recaps: profile scan failed', (e as { code?: string; message?: string })?.code ?? (e as Error)?.message);
    return summary;
  }

  const owners: Owner[] = [];
  for (const p of profiles) {
    if (PAYWALL_ENABLED && !isPaidTier(p.access_tier as string | null)) continue; // paid feature
    const tz = resolveTimeZone(p.timezone as string | null);
    const periods = periodsEndingBefore(localYmd(tz, now));
    if (periods.length) owners.push({ id: p.id as string, tz, push: p.recap_push !== false, periods });
  }
  summary.candidates = owners.reduce((s, o) => s + o.periods.length, 0);
  if (!owners.length) return summary;

  // A device in this environment, per owner (only asked for those who want pushes).
  const reachable = new Set<string>();
  const wantPush = owners.filter((o) => o.push).map((o) => o.id);
  for (let i = 0; i < wantPush.length; i += 200) {
    const { data } = await admin.from('push_subscriptions').select('user_id')
      .in('user_id', wantPush.slice(i, i + 200)).eq('env', deployEnv());
    for (const r of data ?? []) reachable.add(r.user_id as string);
  }

  let next = 0;
  const worker = async () => {
    while (next < owners.length) {
      const o = owners[next++];
      try {
        const r = await buildOwnerRecaps(admin, o.id, o.tz, o.periods);
        if (r.inactive) { summary.skipped_inactive += o.periods.length; continue; }
        summary.built += r.built; summary.existing += r.existing; summary.quiet += r.quiet;
        const pick = pushPick(r.rows);
        if (pick && o.push && reachable.has(o.id)) {
          const delivered = await notify(o.id, recapEvent(pick));
          if (delivered > 0) summary.pushed++;
        }
      } catch (e) {
        console.error('recaps: owner failed', (e as Error)?.message);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, owners.length) }, worker));
  return summary;
}
