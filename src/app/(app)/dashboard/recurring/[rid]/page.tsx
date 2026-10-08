'use client';
// Edit recurring expense (frame 3i).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import RecurringForm from '@/components/recurring/RecurringForm';
import { createClient } from '@/lib/supabase/client';
import { RECURRING_COLS, RECURRING_PATH, normalizeRecurring, type Recurring } from '@/lib/recurring';

export default function EditRecurring() {
  const { rid } = useParams<{ rid: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Recurring | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data } = await supabase.from('recurring_expenses').select(RECURRING_COLS)
        .eq('id', rid).is('deleted_at', null).maybeSingle();
      setItem(data ? normalizeRecurring(data as Record<string, unknown>) : null);
    })().catch(() => setItem(null));
  }, [rid, router]);

  if (item === undefined) {
    return <div className="space-y-3 px-4 py-4" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-surface-container" />)}</div>;
  }
  if (item === null) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-on-surface-variant">This recurring expense couldn’t be found.</p>
        <Link href={RECURRING_PATH} className="btn-outline mx-auto mt-4 inline-flex px-5">Back to Recurring</Link>
      </div>
    );
  }
  return <RecurringForm mode="edit" item={item} />;
}
