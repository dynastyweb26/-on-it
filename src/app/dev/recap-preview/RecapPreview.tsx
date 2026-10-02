'use client';
// TEMPORARY — remove before merge. Two things to check on a phone:
//  1. The recap STORY (player shell, commit 3): the prototype's 8 scenario
//     fixtures run through the real payload builder and the real player,
//     lazy-loaded exactly like the app will load it. Slides are placeholders
//     until their own commits land.
//  2. The old recap SHEET (four mocks; replaced by the story later). Each tap
//     opens the real RecapView under a fresh id (so the count-up plays), and
//     "Reopen last" reuses the previous id (so it must NOT count again). The
//     PDF buttons build from your real data for the mock's date range.
// Nothing is read or written here (except those PDF builds).
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { RecapView, type Recap } from '@/components/RecapSheet';
import { fixturePayload, INVOICE_COUNTS, SCENARIO_LABELS, type ScenarioId } from '@/lib/recap/fixtures';
import { recapSequence } from '@/lib/recap/payload';
import { RECAP_SLIDE_NAMES } from '@/components/recap/names';
import type { Cue } from '@/lib/recap/timing';

// Same as the app will do: the story's code (and its CSS) loads only on open.
const RecapStory = dynamic(() => import('@/components/recap/RecapStory'), { ssr: false });

const WEEKLY: ScenarioId[] = ['normalWeek', 'quietWeek', 'investmentWeek', 'caughtUp', 'nothing'];
const MONTHLY: ScenarioId[] = ['busyMonth', 'quietMonth', 'spikyMonth'];

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

function StoryPreview() {
  const [scenario, setScenario] = useState<ScenarioId>('normalWeek');
  const [inv, setInv] = useState<number | undefined>(undefined);
  const [motion, setMotion] = useState<'os' | 'reduce' | 'full'>('os');
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const payload = useMemo(() => fixturePayload(scenario, inv), [scenario, inv]);
  const seq = recapSequence(payload);
  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 8));

  const chip = (on: boolean) =>
    `min-h-touch rounded-full border px-3 text-sm font-semibold ${on ? 'border-on-background bg-on-background text-background' : 'border-outline-variant bg-surface-container-lowest text-on-background'}`;
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-extrabold">Recap story (player shell)</h2>
      <p className="text-sm text-on-surface-variant">
        Tap the right two-thirds for next, the left third for back, hold to pause. The progress bar starts only after each slide&rsquo;s hero.
      </p>
      {([['Weekly', WEEKLY], ['Monthly', MONTHLY]] as const).map(([title, ids]) => (
        <div key={title} className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{title}</div>
          <div className="flex flex-wrap gap-2">
            {ids.map((id) => (
              <button key={id} className={chip(scenario === id)} aria-pressed={scenario === id} onClick={() => setScenario(id)}>{SCENARIO_LABELS[id]}</button>
            ))}
          </div>
        </div>
      ))}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Invoices (Still on the table / Caught up)</div>
        <div className="flex flex-wrap gap-2">
          {[undefined, ...INVOICE_COUNTS].map((n) => (
            <button key={String(n)} className={chip(inv === n)} aria-pressed={inv === n} onClick={() => setInv(n)}>{n ?? 'Scenario default'}</button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Motion</div>
        <div className="flex flex-wrap gap-2">
          {([['os', 'Follow iPhone setting'], ['reduce', 'Reduce Motion on'], ['full', 'Reduce Motion off']] as const).map(([v, l]) => (
            <button key={v} className={chip(motion === v)} aria-pressed={motion === v} onClick={() => setMotion(v)}>{l}</button>
          ))}
        </div>
      </div>
      <p className="text-sm text-on-surface-variant">
        {seq.length} slides: {seq.map((k) => RECAP_SLIDE_NAMES[k]).join(' → ')}
      </p>
      <button className="btn-primary w-full" onClick={() => { setLog([]); setOpen(true); }}>Open recap</button>
      {log.length > 0 && (
        <div className="rounded-card bg-surface-container p-3 text-xs leading-5 text-on-surface-variant">
          <div className="mb-1 font-semibold">Last cues / actions (sound lands in a later commit)</div>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
      {open && (
        <RecapStory
          payload={payload}
          reducedMotion={motion === 'os' ? undefined : motion === 'reduce'}
          onClose={() => setOpen(false)}
          onAction={(a) => note(`action: ${a}`)}
          onCue={(c: Cue) => { if (!c.silent) note(`${(c.t / 1000).toFixed(2)}s · ${c.sound} ${c.db} dB${c.label ? ` · ${c.label}` : ''}`); }}
        />
      )}
    </section>
  );
}

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
      <StoryPreview />
      <h2 className="pt-4 font-display text-xl font-extrabold">Old recap sheet</h2>
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
