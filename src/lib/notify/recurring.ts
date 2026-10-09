// Recurring expenses: log each charge on its date (merge 3 · 3·5).
//
// Runs as the fourth step of the daily /api/followups cron (Hobby plan: no
// extra cron entry). Per live, auto-logging item (recurring_expenses, not
// deleted, auto_log on) whose next_on has come in the OWNER's local date
// (profiles.timezone, UTC when unknown):
//   • the due dates are lib/recurring dueDates(): oldest first, at most 12 per
//     run, never before the item's owner-local created day;
//   • each date is upserted into expenses (recurring_id, spent_on) with
//     ignoreDuplicates — the unique index (migration D) makes a re-run, or a
//     crash between the insert and the advance, log nothing twice;
//   • the free expense cap (enforce_free_expense_limit) still fires on these
//     service-role inserts. A cap refusal is a free-limit skip: next_on moves
//     past it (never back-filled), the item's notice says so, and the owner
//     gets ONE digest push that day for all their free-limit skips;
//   • any other failure is an error skip: logged server-side only (no push),
//     next_on stays on that date so tomorrow retries, and once it has been
//     stuck for 3 calendar days auto-log turns off (the Books banner then
//     says it paused; turning auto-log back on resumes from today);
//   • the first skip of either kind ends that item's run (lib/recurring-run).
// The item is then advanced with a compare-and-set on the next_on / auto_log
// / deleted_at that were scanned, so an edit, pause or delete made meanwhile
// wins. user_id always comes from the item row (the service role bypasses
// RLS); nothing here takes a user from a request.
//
// Environment guard: production only for everyone (the shared DB; a preview
// run would log real owners' charges and claim their digest keys). Preview
// tests it for the signed-in user alone via /api/recurring/test (onlyUserId).
import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notify';
import { addDays, todayIn } from '@/lib/recurring';
import { isCapRefusal, runItem, type ChargeResult, type CronItem } from '@/lib/recurring-run';

const BATCH = 200; // items per run, oldest next_on first; the rest drain tomorrow

export type RecurringRun = { due: number; logged: number; skipped: number; errors: number; paused: number; pushed: number };

type Admin = ReturnType<typeof adminClient>;

/** One charge into expenses. Never throws: any failure is 'error' (stamped, retried). */
async function logCharge(admin: Admin, it: CronItem, on: string): Promise<ChargeResult> {
  try {
    const { error } = await admin.from('expenses').upsert({
      user_id: it.user_id,
      recurring_id: it.id,
      vendor: it.vendor,
      description: it.description,
      amount: it.amount,
      category: it.category,
      spent_on: on,
    }, { onConflict: 'recurring_id,spent_on', ignoreDuplicates: true });
    if (!error) return 'logged'; // inserted, or the slot was already logged (conflict ignored)
    if (isCapRefusal(error)) {
      // The cap trigger runs BEFORE the conflict check, so a date that's already
      // logged can still be refused at the cap: that's not a skip.
      const { data, error: readErr } = await admin.from('expenses').select('id')
        .eq('recurring_id', it.id).eq('spent_on', on).limit(1);
      if (readErr) { console.error('recurring: slot check failed', it.id, on, readErr.code ?? readErr.message); return 'error'; }
      return data?.length ? 'logged' : 'free_limit';
    }
    console.error('recurring: log failed', it.id, on, error.code ?? error.message);
    return 'error';
  } catch (e) {
    console.error('recurring: log threw', it.id, on, (e as Error)?.message);
    return 'error';
  }
}

export async function runRecurring(opts: { onlyUserId?: string; now?: Date } = {}): Promise<RecurringRun> {
  const out: RecurringRun = { due: 0, logged: 0, skipped: 0, errors: 0, paused: 0, pushed: 0 };
  const admin = adminClient();
  const now = opts.now ?? new Date();

  // Pre-filter with one day of slack (a local date is at most one day ahead of
  // UTC); runItem then checks each item against its owner's own today.
  let q = admin.from('recurring_expenses')
    .select('id, user_id, vendor, description, amount, category, cadence, anchor_day, next_on, created_at')
    .is('deleted_at', null)
    .eq('auto_log', true)
    .lte('next_on', addDays(now.toISOString().slice(0, 10), 1))
    .order('next_on', { ascending: true })
    .limit(BATCH);
  if (opts.onlyUserId) q = q.eq('user_id', opts.onlyUserId);
  const { data: rows, error } = await q;
  if (error) { console.error('recurring: scan failed', error.code ?? error.message); return out; }
  const items = ((rows ?? []) as CronItem[]).map((r) => ({ ...r, amount: Number(r.amount) }));
  if (!items.length) return out;

  const owners = [...new Set(items.map((i) => i.user_id))];
  const { data: zones } = await admin.from('profiles').select('id, timezone').in('id', owners);
  const zone = new Map((zones ?? []).map((z) => [z.id as string, z.timezone as string | null]));

  const digest = new Map<string, { vendors: string[]; localDate: string }>(); // owner → today's free-limit skips

  for (const it of items) {
    try {
      const tz = zone.get(it.user_id);
      const today = todayIn(tz, now);
      const run = await runItem(it, today, todayIn(tz, new Date(it.created_at)), (on) => logCharge(admin, it, on));
      if (run.due) out.due++;
      out.logged += run.logged;
      if (run.skip === 'free_limit') out.skipped++;
      if (run.skip === 'error') out.errors++;
      if (!run.patch) continue;

      const { data: moved, error: moveErr } = await admin.from('recurring_expenses').update(run.patch)
        .eq('id', it.id).eq('next_on', it.next_on).eq('auto_log', true).is('deleted_at', null)
        .select('id');
      if (moveErr) { console.error('recurring: advance failed', it.id, moveErr.code ?? moveErr.message); continue; }
      if (!moved?.length) continue; // edited, paused or deleted since the scan: theirs wins
      if (run.pause) { out.paused++; console.error('recurring: paused after errors', it.id, run.patch.last_skipped_on); }

      if (run.skip === 'free_limit') {
        const d = digest.get(it.user_id) ?? { vendors: [], localDate: today };
        d.vendors.push(it.vendor);
        digest.set(it.user_id, d);
      }
    } catch (e) {
      out.errors++;
      console.error('recurring: item failed', it.id, (e as Error)?.message);
    }
  }

  // One digest per owner per local day (dedupe recurring_skipped:<user>:<date>).
  for (const [userId, d] of digest) {
    out.pushed += await notify(userId, { type: 'recurring_skipped', vendors: d.vendors, localDate: d.localDate });
  }
  return out;
}
