'use client';
// The owner's live recurring items, read once per screen (Books: the list-card
// row + the skip banner). The cached copy paints first (#3); null means loading,
// or that there is nothing cached and the table can't be read (e.g. before
// migration D is live) — callers then show no figures.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RECURRING_COLS, normalizeRecurring, type Recurring } from '@/lib/recurring';
import { CACHE_TTL, readCache, writeCache } from '@/lib/cache';

export function useRecurringItems(active = true): Recurring[] | null {
  const [items, setItems] = useState<Recurring[] | null>(null);
  useEffect(() => {
    // A hidden deck panel is only prewarmed for its JS/render. Reading the
    // table belongs to the visit, so opening Books still fetches, but an idle
    // prewarm from another tab does not.
    if (!active) return;
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      // getSession() is a local read: the cache key without a network round-trip.
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (cancelled) return;
      const cached = uid ? readCache<Recurring[]>(uid, 'recurring') : null;
      if (cached) setItems(cached);
      const { data, error } = await supabase.from('recurring_expenses').select(RECURRING_COLS)
        .is('deleted_at', null).limit(500);
      // A failed refresh leaves the cached rows alone.
      if (cancelled || error) return;
      const list = ((data ?? []) as Record<string, unknown>[]).map(normalizeRecurring);
      setItems(list);
      if (uid) writeCache(uid, 'recurring', list, CACHE_TTL.lists);
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [active]);
  return items;
}
