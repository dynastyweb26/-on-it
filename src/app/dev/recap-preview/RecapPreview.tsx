'use client';
// TEMPORARY — remove before merge. Four mock recaps; each tap opens the real
// RecapView under a fresh id (so the count-up plays), and "Reopen last" reuses
// the previous id (so it must NOT count again). Nothing is read or written
// here — except the PDF buttons, which build from your real data for the
// mock's date range, exactly as the live sheet would.
import { useState } from 'react';
import { RecapView, type Recap } from '@/components/RecapSheet';

const MOCKS: { label: string; recap: Omit<Recap, 'id'> }[] = [
  {
    label: 'Normal week',
    recap: {
      kind: 'week', period_start: '2026-09-21', period_end: '2026-09-27',
      income: 3240, expenses: 612.48, net: 2627.52, payments_count: 4, expenses_count: 9,
      top_category: 'supplies', top_category_amount: 388.2, top_vendor: 'Home Depot',
    },
  },
  {
    label: 'Negative-net week',
    recap: {
      kind: 'week', period_start: '2026-09-28', period_end: '2026-10-04',
      income: 450, expenses: 1875.9, net: -1425.9, payments_count: 1, expenses_count: 6,
      top_category: 'tools', top_category_amount: 1299, top_vendor: 'Harbor Freight',
    },
  },
  {
    label: 'Expenses-only week',
    recap: {
      kind: 'week', period_start: '2026-09-14', period_end: '2026-09-20',
      income: 0, expenses: 214.37, net: -214.37, payments_count: 0, expenses_count: 3,
      top_category: 'fuel', top_category_amount: 160.12, top_vendor: null,
    },
  },
  {
    label: 'Month',
    recap: {
      kind: 'month', period_start: '2026-09-01', period_end: '2026-09-30',
      income: 12480.5, expenses: 3310.75, net: 9169.75, payments_count: 17, expenses_count: 41,
      top_category: 'supplies', top_category_amount: 1488.6, top_vendor: "Lowe's",
    },
  },
];

export default function RecapPreview() {
  const [open, setOpen] = useState<Recap | null>(null);
  const [last, setLast] = useState<Recap | null>(null);

  function show(r: Omit<Recap, 'id'>) {
    const recap = { ...r, id: crypto.randomUUID() };
    setLast(recap);
    setOpen(recap);
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <h1 className="font-display text-headline-mobile font-extrabold text-on-background">Recap preview</h1>
      <p className="text-body-md text-on-surface-variant">
        Dev only, removed before merge. Each button opens the real recap sheet with mock numbers.
      </p>
      <div className="grid gap-3">
        {MOCKS.map((m) => (
          <button key={m.label} className="btn-primary" onClick={() => show(m.recap)}>{m.label}</button>
        ))}
        <button className="btn-outline text-primary" disabled={!last} onClick={() => last && setOpen(last)}>
          Reopen last (should not count again)
        </button>
      </div>
      {open && <RecapView recap={open} businessName="Preview" onClose={() => setOpen(null)} />}
    </main>
  );
}
