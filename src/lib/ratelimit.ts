// Layer 4: per-user rate limiting, Postgres-backed (survives serverless
// cold starts, consistent across instances — the lesson from T-Vault).
import { adminClient } from './supabase/admin';

const WINDOW_MS = 60_000;

/** Returns true if the request is allowed. */
export async function checkRateLimit(
  userId: string,
  route: string,
  maxPerMinute: number
): Promise<boolean> {
  const supabase = adminClient();
  const now = new Date();

  const { data } = await supabase
    .from('rate_limits')
    .select('window_start, count')
    .eq('user_id', userId)
    .eq('route', route)
    .maybeSingle();

  if (!data || now.getTime() - new Date(data.window_start).getTime() > WINDOW_MS) {
    await supabase.from('rate_limits').upsert({
      user_id: userId, route, window_start: now.toISOString(), count: 1,
    });
    return true;
  }
  if (data.count >= maxPerMinute) return false;

  await supabase
    .from('rate_limits')
    .update({ count: data.count + 1 })
    .eq('user_id', userId)
    .eq('route', route);
  return true;
}
