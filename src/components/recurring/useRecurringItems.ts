'use client';
// The owner's live recurring items, read once per screen (Books: the list-card
// row + the skip banner). null while loading, or when the table can't be read
// (e.g. before migration D is live) — callers then show no figures.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RECURRING_COLS, normalizeRecurring, type Recurring } from '@/lib/recurring';

export function useRecurringItems(): Recurring[] | null {
  const [items, setItems] = useState<Recurring[] | null>(null);
  useEffect(() => {
    createClient().from('recurring_expenses').select(RECURRING_COLS).is('deleted_at', null).limit(500)
      .then(({ data, error }) => { if (!error) setItems(((data ?? []) as Record<string, unknown>[]).map(normalizeRecurring)); }, () => undefined);
  }, []);
  return items;
}
