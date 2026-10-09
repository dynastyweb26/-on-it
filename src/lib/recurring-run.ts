// One recurring item's cron run (merge 3 · 3·5), with the database injected so
// the free-limit and error paths are unit-tested (recurring-run.test.ts). The
// wiring — scan, compare-and-set advance, digest push — is lib/notify/recurring.
import { dueDates, givesUpOnError, nextDue, type Cadence } from '@/lib/recurring';

export type CronItem = {
  id: string; user_id: string; vendor: string; description: string | null; amount: number;
  category: string; cadence: Cadence; anchor_day: number | null; next_on: string; created_at: string;
};

/** What one insert attempt came to. 'logged' also covers a date already logged (the unique slot). */
export type ChargeResult = 'logged' | 'free_limit' | 'error';

/** The cap trigger's refusal (enforce_free_expense_limit: P0001 / PAYWALL_LIMIT_EXPENSE). */
export const isCapRefusal = (e: { code?: string; hint?: string } | null | undefined) =>
  e?.code === 'P0001' && e?.hint === 'PAYWALL_LIMIT_EXPENSE';

export type ItemRun = {
  /** The update for the item, or null when nothing changed (not due in the owner's date). */
  patch: { next_on: string; last_logged_on?: string; last_skipped_on?: string; last_skip_reason?: 'free_limit' | 'error'; auto_log?: false } | null;
  due: boolean;
  logged: number;
  skip: 'free_limit' | 'error' | null;
  pause: boolean;
};

/**
 * Try the item's due dates oldest first. A free-limit refusal skips that date
 * for good (next_on moves past it); an error keeps next_on on it so tomorrow
 * retries, and pauses the item once it has been stuck for 3 calendar days.
 * The first skip of either kind ends the run: later dates wait.
 */
export async function runItem(
  it: CronItem, today: string, createdOn: string, logCharge: (on: string) => Promise<ChargeResult>,
): Promise<ItemRun> {
  const { start, dates } = dueDates(it.next_on, it.cadence, it.anchor_day, today, createdOn);
  const run: ItemRun = { patch: null, due: dates.length > 0, logged: 0, skip: null, pause: false };
  if (!dates.length && start === it.next_on) return run;

  let next = start;
  let loggedOn: string | undefined;
  let skippedOn: string | undefined;
  for (const on of dates) {
    const r = await logCharge(on);
    if (r === 'logged') { run.logged++; loggedOn = on; next = nextDue(on, it.cadence, it.anchor_day); continue; }
    skippedOn = on;
    run.skip = r;
    if (r === 'free_limit') {
      next = nextDue(on, it.cadence, it.anchor_day); // skipped for good, never back-filled
    } else {
      next = on;                                     // retry tomorrow…
      run.pause = givesUpOnError(on, today);         // …unless stuck for 3 days
    }
    break;
  }

  run.patch = { next_on: next };
  if (loggedOn) run.patch.last_logged_on = loggedOn;
  if (skippedOn && run.skip) { run.patch.last_skipped_on = skippedOn; run.patch.last_skip_reason = run.skip; }
  if (run.pause) run.patch.auto_log = false;
  return run;
}
