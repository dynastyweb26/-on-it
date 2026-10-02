// Weekly / monthly recaps: "Your week in review — $1,240 in · $310 out".
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
// An empty period (no income and no expenses) gets no snapshot and no push.
// Idempotent: snapshots upsert on (user_id, kind, period_start) without
// touching seen_at, and the push goes through notify(), whose notification_log
// dedupe key recap:<kind>:<user>:<period_start> makes a re-run a no-op.
//
// Recaps are a paid feature: with the paywall on, only owners on a paid tier
// (PAID_TIERS — founder, trialing, active, past_due) get a snapshot or a push;
// free and canceled owners are skipped before any numbers are read. With the
// paywall off everyone with activity gets one. The push additionally
// needs recap_push on and a device in THIS environment (checked first, so the
// dedupe key is never claimed for an owner nobody can reach). With push off
// the snapshot still feeds the in-app RecapSheet.
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
import type { RecapExpenseRow, RecapInput, RecapPaymentRow } from '@/lib/recap/payload';

const PAGE_ROWS = 1000;   // PostgREST cap; long reads are paged
const CONCURRENCY = 6;    // owners processed at once

// Periods and local dates live in lib/recap/dates (pure, unit-tested); re-exported here.
export {
  DEFAULT_RECAP_TZ, resolveTimeZone, localYmd, addDays, periodsEndingBefore, zonedMidnight,
  type RecapKind, type RecapPeriod,
} from '@/lib/recap/dates';
export type RecapRunSummary = { candidates: number; built: number; pushed: number; skipped_empty: number };

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

export async function runRecaps(now = new Date()): Promise<RecapRunSummary> {
  const summary: RecapRunSummary = { candidates: 0, built: 0, pushed: 0, skipped_empty: 0 };
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
        const built: { period: RecapPeriod; id: string; numbers: RecapNumbers }[] = [];
        for (const period of o.periods) {
          const n = await loadNumbers(admin, o.id, period, o.tz);
          if (n.income === 0 && n.expenses === 0) { summary.skipped_empty++; continue; }
          const { data, error } = await admin
            .from('recaps')
            .upsert(
              { user_id: o.id, kind: period.kind, period_start: period.start, period_end: period.end, ...n },
              { onConflict: 'user_id,kind,period_start' },
            )
            .select('id')
            .single();
          if (error || !data) { console.error('recaps: upsert failed', error?.code ?? error?.message); continue; }
          summary.built++;
          built.push({ period, id: data.id as string, numbers: n });
        }
        // One push per run: the monthly recap when there is one, else the weekly.
        const pick = built.find((b) => b.period.kind === 'month') ?? built[0];
        if (pick && o.push && reachable.has(o.id)) {
          const delivered = await notify(o.id, {
            type: 'recap',
            recapId: pick.id,
            kind: pick.period.kind,
            periodStart: pick.period.start,
            income: pick.numbers.income,
            expenses: pick.numbers.expenses,
          });
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
