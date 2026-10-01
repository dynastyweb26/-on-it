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
// Everyone with activity gets a snapshot, free or paid — the recap is a
// retention hook, deliberately not gated by access. The push additionally
// needs recap_push on and a device in THIS environment (checked first, so the
// dedupe key is never claimed for an owner nobody can reach). With push off
// the snapshot still feeds the in-app RecapSheet.
import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { deployEnv } from '@/lib/deploy-env';
import { notify } from '@/lib/notify';
import { roundCurrency } from '@/lib/financials';
import { summarize, summarizeIncome, type ExpenseLite, type PaymentLite } from '@/lib/tax-summary';
import { isExpenseCategory } from '@/lib/expenses';

export const DEFAULT_RECAP_TZ = 'America/Chicago';
const PAGE_ROWS = 1000;   // PostgREST cap; long reads are paged
const CONCURRENCY = 6;    // owners processed at once

export type RecapKind = 'week' | 'month';
export type RecapPeriod = { kind: RecapKind; start: string; end: string }; // local yyyy-mm-dd, inclusive
export type RecapRunSummary = { candidates: number; built: number; pushed: number; skipped_empty: number };

// ── Dates (pure; exported for tests) ──────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');

/** A zone this runtime knows, else the default. */
export function resolveTimeZone(tz: string | null | undefined): string {
  if (tz) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { /* unknown zone */ }
  }
  return DEFAULT_RECAP_TZ;
}

/** The local calendar date (yyyy-mm-dd) in `tz` at instant `at`. */
export function localYmd(tz: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The periods that close on local date `today`: the previous Mon–Sun on a
 *  Monday, the previous calendar month on the 1st (both on a Monday the 1st). */
export function periodsEndingBefore(today: string): RecapPeriod[] {
  const [y, m, d] = today.split('-').map(Number);
  const out: RecapPeriod[] = [];
  if (d === 1) {
    const first = new Date(Date.UTC(y, m - 2, 1)); // previous month, day 1 (Date.UTC wraps the year)
    out.push({ kind: 'month', start: `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-01`, end: addDays(today, -1) });
  }
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1) {
    out.push({ kind: 'week', start: addDays(today, -7), end: addDays(today, -1) });
  }
  return out;
}

/** UTC offset of `tz` at instant `at`, in ms (local − UTC). */
function tzOffsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant of local midnight starting `ymd` in `tz` (DST-safe). */
export function zonedMidnight(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(tz, new Date(guess));
  t = guess - tzOffsetMs(tz, new Date(t)); // second pass lands DST transitions
  return new Date(t);
}

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

async function loadNumbers(admin: Admin, userId: string, period: RecapPeriod, tz: string): Promise<RecapNumbers> {
  const [expenseRows, paymentRows] = await Promise.all([
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
      .select('id, amount, paid_at, invoices!inner(kind, deleted_at)')
      .eq('user_id', userId)
      .eq('invoices.kind', 'invoice')
      .is('invoices.deleted_at', null)
      .gte('paid_at', zonedMidnight(period.start, tz).toISOString())
      .lt('paid_at', zonedMidnight(addDays(period.end, 1), tz).toISOString())
      .order('id', { ascending: true })
      .range(from, to)),
  ]);
  return rollUp(expenseRows, paymentRows, period);
}

// ── Run ───────────────────────────────────────────────────────────────
type Owner = { id: string; tz: string; push: boolean; periods: RecapPeriod[] };

export async function runRecaps(now = new Date()): Promise<RecapRunSummary> {
  const summary: RecapRunSummary = { candidates: 0, built: 0, pushed: 0, skipped_empty: 0 };
  const admin = adminClient();

  let profiles: Row[];
  try {
    profiles = await fetchAll((from, to) => admin
      .from('profiles')
      .select('id, timezone, recap_push')
      .order('id', { ascending: true })
      .range(from, to));
  } catch (e) {
    console.error('recaps: profile scan failed', (e as { code?: string; message?: string })?.code ?? (e as Error)?.message);
    return summary;
  }

  const owners: Owner[] = [];
  for (const p of profiles) {
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
