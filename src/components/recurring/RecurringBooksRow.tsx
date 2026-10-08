'use client';
// Books › Recurring row (release frame 5a; UI-REDESIGN-AUDIT §1.16, merge 3 ·
// 3·3): gold ↻ disc, "Recurring" + PRO, "7 charges · next Oct 6", "$632.49/mo",
// → the Recurring screen. Loads its own list; if the table can't be read
// (e.g. before migration D is live) the row still opens Recurring, without
// figures.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import ProTag from '@/components/recurring/ProTag';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/financials';
import { RECURRING_COLS, RECURRING_PATH, booksLine, localToday, normalizeRecurring, type Recurring } from '@/lib/recurring';

// Whole dollars from $1,000 so the caption keeps its room on a 375 px phone.
const perMonth = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : money(n));

export default function RecurringBooksRow() {
  const [items, setItems] = useState<Recurring[] | null>(null);
  useEffect(() => {
    createClient().from('recurring_expenses').select(RECURRING_COLS).is('deleted_at', null).limit(500)
      .then(({ data, error }) => { if (!error) setItems(((data ?? []) as Record<string, unknown>[]).map(normalizeRecurring)); }, () => undefined);
  }, []);
  const line = items ? booksLine(items, localToday()) : null;
  return (
    <Link href={RECURRING_PATH} className="flex h-16 items-center gap-2.5 border-t border-outline-variant/60 px-3.5 transition-colors active:bg-surface-container">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primary-soft">
        <Icon name="autorenew" size={21} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-base font-semibold text-on-background">Recurring <ProTag /></span>
        <span className="truncate text-[13px] text-on-surface-variant">{line?.caption ?? 'Charges that repeat'}</span>
      </span>
      {line?.monthly != null && (
        <span className="shrink-0 text-[14px] font-bold tabular-nums text-on-background">
          {perMonth(line.monthly)}<span className="text-[11px] font-medium text-on-surface-variant">/mo</span>
        </span>
      )}
      <Icon name="chevron_right" size={20} className="shrink-0 text-outline" />
    </Link>
  );
}
