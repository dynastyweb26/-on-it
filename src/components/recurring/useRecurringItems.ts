'use client';
// The owner's live recurring items, read once per screen (Books: the list-card
// row + the skip banner). null while loading, or when the table can't be read
// (e.g. before migration D is live) — callers then show no figures.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RECURRING_COLS, normalizeRecurring, type Recurring } from '@/lib/recurring';

export function useRecurringItems(active = true): Recurring[] | null {
  const [items, setItems] = useState<Recurring[] | null>(null);
  useEffect(() => {
    // A hidden deck panel is only prewarmed for its JS/render. Reading the
    // table belongs to the visit, so opening Books still fetches, but an idle
    // prewarm from another tab does not.
    if (!active) return;
    let cancelled = false;
    createClient().from('recurring_expenses').select(RECURRING_COLS).is('deleted_at', null).limit(500)
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setItems(((data ?? []) as Record<string, unknown>[]).map(normalizeRecurring));
      }, () => undefined);
    return () => { cancelled = true; };
  }, [active]);
  return items;
}
