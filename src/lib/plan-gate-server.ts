// The profile read behind every Plus-only server action (a new bank link, a new
// attachment upload). Imported by route handlers only (never a client module),
// and fail-open: a failed read answers "yes" and logs one line. These gates are
// plan rules, not the security boundary — RLS, the storage policies and the SQL
// gates are — so a database hiccup must never stop a paying user mid-task.
import type { SupabaseClient } from '@supabase/supabase-js';
import { isPlusPlan } from './entitlements';

export async function currentPlanIsPlus(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('access_tier, plan')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[plan] profile read failed', error.code ?? error.message);
    return true;
  }
  return isPlusPlan(data?.access_tier, data?.plan);
}
