// The profile read behind the new-link plan gate. Server-only, fail-open: a
// failed read answers "allowed" and logs one line, so a database hiccup cannot
// stop a subscriber from connecting a bank (the gate is a plan rule, not a
// security boundary — RLS and the token encryption are that).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { newLinkAllowed } from './plan';

export async function newPlaidLinkAllowed(
  supabase: SupabaseClient,
  userId: string,
  enforced: boolean,
): Promise<boolean> {
  if (!enforced) return true;
  const { data, error } = await supabase
    .from('profiles')
    .select('access_tier, plan')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[plaid] plan read failed', error.code ?? error.message);
    return true;
  }
  return newLinkAllowed(enforced, data?.access_tier, data?.plan);
}
