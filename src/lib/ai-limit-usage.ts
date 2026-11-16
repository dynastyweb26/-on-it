// The database half of the AI daily limit: read the owner's plan facts, count
// this window's turns, hand both to the pure decision in ai-limit.ts.
//
// Server-only and fail-open: a failed count or profile read logs one line and
// returns null, and the caller answers the question. A meter must never be the
// reason a paying (or any) user is locked out of the assistant.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { aiDailyLimitFor, aiLimitWindow, type AiLimitState } from './ai-limit';

export interface AiLimitUsage extends AiLimitState {
  /** The lower bound the count used (local midnight, ISO). */
  since: string;
}

/** Count the caller's own chat_messages rows since their local midnight. */
export async function aiLimitForUser(
  supabase: SupabaseClient,
  userId: string,
  facts: { tier: string | null | undefined; plan: string | null | undefined; timezone: string | null | undefined },
  now: Date = new Date(),
): Promise<AiLimitUsage | null> {
  const window = aiLimitWindow(facts.timezone, now);
  const { count, error } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', window.since);
  if (error) {
    console.error('[ai-limit] count failed', error.code ?? error.message);
    return null;
  }
  return { ...aiDailyLimitFor(facts.tier, facts.plan, facts.timezone, now, count ?? 0), since: window.since };
}

/** The same, reading the plan facts off the profile first. Used where the
 *  route doesn't already hold them (the ask gate). */
export async function aiLimitForUserId(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<AiLimitUsage | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('access_tier, plan, timezone')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[ai-limit] profile read failed', error.code ?? error.message);
    return null;
  }
  return aiLimitForUser(
    supabase,
    userId,
    { tier: data?.access_tier, plan: data?.plan, timezone: data?.timezone },
    now,
  );
}
