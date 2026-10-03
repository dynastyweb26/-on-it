'use client';
// TEMPORARY — remove before merge.
//  1. The recap STORY on the prototype's scenario fixtures, through the real
//     payload builder and player, lazy-loaded like the app loads it.
//  2. Real data (your account, Preview only): build your recaps with the
//     cron's builder, send the recap push to this device, reset watched /
//     put-off, delete your recaps — via /api/recaps/test (404 unless Preview + PUSH_TEST_ENABLED +
//     RECAPS_LIVE). Build writes real recaps rows for you (shared DB).
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { fixturePayload, INVOICE_COUNTS, onePaymentWeek, SCENARIO_LABELS, scenarioPayload, stressWeek, type ScenarioId } from '@/lib/recap/fixtures';
import { recapSequence } from '@/lib/recap/payload';
import { RECAP_SLIDE_NAMES } from '@/components/recap/names';
import type { Cue } from '@/lib/recap/timing';
import { primeRecapAudio } from '@/lib/recap/audio';
import { AudioDebugControls, AudioDebugPanel } from './AudioDebug';

// Same as the app will do: the story's code (and its CSS) loads only on open.
const RecapStory = dynamic(() => import('@/components/recap/RecapStory'), { ssr: false });

// Not among the prototype's eight: 'onePaymentWeek' (opener checkpoint) and
// 'stressWeek' (all six payment methods, $123,456, a long client name).
type PreviewId = ScenarioId | 'onePaymentWeek' | 'stressWeek';
const LABELS: Record<PreviewId, string> = { ...SCENARIO_LABELS, onePaymentWeek: 'One-payment week', stressWeek: 'Stress: 6 methods, long name' };
const EXTRA = { onePaymentWeek, stressWeek };
const WEEKLY: PreviewId[] = ['normalWeek', 'onePaymentWeek', 'quietWeek', 'investmentWeek', 'caughtUp', 'nothing', 'stressWeek'];
const MONTHLY: PreviewId[] = ['busyMonth', 'quietMonth', 'spikyMonth'];

function StoryPreview() {
  const [scenario, setScenario] = useState<PreviewId>('normalWeek');
  const [inv, setInv] = useState<number | undefined>(undefined);
  const [motion, setMotion] = useState<'os' | 'reduce' | 'full'>('os');
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const payload = useMemo(() => (scenario === 'onePaymentWeek' || scenario === 'stressWeek' ? scenarioPayload(EXTRA[scenario]) : fixturePayload(scenario, inv)), [scenario, inv]);
  const [startAt, setStartAt] = useState(0);
  const seq = recapSequence(payload);
  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 8));

  const chip = (on: boolean) =>
    `min-h-touch rounded-full border px-3 text-sm font-semibold ${on ? 'border-on-background bg-on-background text-background' : 'border-outline-variant bg-surface-container-lowest text-on-background'}`;
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-extrabold">Recap story</h2>
      <p className="text-sm text-on-surface-variant">
        Tap the right two-thirds for next, the left third for back, hold to pause. The progress bar starts only after each slide&rsquo;s hero.
      </p>
      {([['Weekly', WEEKLY], ['Monthly', MONTHLY]] as const).map(([title, ids]) => (
        <div key={title} className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{title}</div>
          <div className="flex flex-wrap gap-2">
            {ids.map((id) => (
              <button key={id} className={chip(scenario === id)} aria-pressed={scenario === id} onClick={() => setScenario(id)}>{LABELS[id]}</button>
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
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Start at ({seq.length} {seq.length === 1 ? 'slide' : 'slides'})</div>
        <div className="flex flex-wrap gap-2">
          {seq.map((k, i) => (
            <button key={`${k}-${i}`} className={chip(Math.min(startAt, seq.length - 1) === i)} aria-pressed={Math.min(startAt, seq.length - 1) === i} onClick={() => setStartAt(i)}>
              {i + 1} · {RECAP_SLIDE_NAMES[k]}
            </button>
          ))}
        </div>
      </div>
      <AudioDebugControls />
      {/* primeRecapAudio inside the tap: iOS only starts Web Audio in a gesture. */}
      <button className="btn-primary w-full" onClick={() => { primeRecapAudio(); setLog([]); setOpen(true); }}>Open recap</button>
      {log.length > 0 && (
        <div className="rounded-card bg-surface-container p-3 text-xs leading-5 text-on-surface-variant">
          <div className="mb-1 font-semibold">Last cues / actions (placeholder sounds)</div>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
      {open && (
        <RecapStory
          payload={payload}
          startAt={startAt}
          reducedMotion={motion === 'os' ? undefined : motion === 'reduce'}
          onClose={() => setOpen(false)}
          onAction={(a) => note(`action: ${a}`)}
          onCue={(c: Cue) => { if (!c.silent) note(`${(c.t / 1000).toFixed(2)}s · ${c.sound} ${c.db} dB${c.label ? ` · ${c.label}` : ''}`); }}
        />
      )}
    </section>
  );
}

/** Your own recaps on this preview (see the header). Hidden where the route 404s. */
function RealData() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState('');
  useEffect(() => {
    fetch('/api/recaps/test').then((r) => setEnabled(r.ok)).catch(() => setEnabled(false));
  }, []);
  if (!enabled) return null;
  async function run(action: 'build' | 'push' | 'reset' | 'delete') {
    if (action === 'delete' && !window.confirm('Delete ALL your recaps (every week and month)? This removes your own rows from the shared database and cannot be undone.')) return;
    setBusy(true);
    setOut('…');
    try {
      const r = await fetch('/api/recaps/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      setOut(`${action}: ${r.status} ${await r.text()}`);
    } catch (e) {
      setOut(`${action}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl font-extrabold">Real data (your account)</h2>
      <p className="text-sm text-on-surface-variant">
        Build = your last 4 weeks + 2 months with the cron&rsquo;s builder (insert-once; real rows in the shared DB). Push = the recap
        push for your newest recap, to this environment&rsquo;s devices. Reset = clear watched / &ldquo;Later&rdquo; on your recaps.
        Delete = remove all your recaps rows (asks first).
        Reload the app after Build or Reset.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-outline text-primary" disabled={busy} onClick={() => run('build')}>Build my recaps</button>
        <button className="btn-outline text-primary" disabled={busy} onClick={() => run('push')}>Send recap push</button>
        <button className="btn-outline text-primary" disabled={busy} onClick={() => run('reset')}>Reset watched / Later</button>
        <button className="btn-outline text-primary" disabled={busy} onClick={() => run('delete')}>Delete my recaps</button>
      </div>
      {out && <pre className="whitespace-pre-wrap break-all rounded-card bg-surface-container p-3 text-xs">{out}</pre>}
    </section>
  );
}

export default function RecapPreview({ build }: { build: string }) {
  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <AudioDebugPanel build={build} />
      <h1 className="font-display text-headline-mobile font-extrabold text-on-background">Recap preview</h1>
      <RealData />
      <StoryPreview />
    </main>
  );
}
