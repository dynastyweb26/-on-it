'use client';
// Client half of /dev/recaps: each button opens the real RecapStory at a slide.
import { useEffect, useState } from 'react';
import RecapStory from '@/components/recap/RecapStory';
import { redesignPayload } from '@/lib/recap/fixtures';
import { redesignSequence, type RecapBank, type RedesignSlide } from '@/lib/recap/payload';

const ITEMS = [
  { name: 'Shell', date: '2026-11-14' },
  { name: 'Home Depot', date: '2026-11-13' },
  { name: 'Deposit', date: '2026-11-12' },
];

/** The board's own sample banks (RecapPlayer.dc.html), plus the edge cases. */
const BANKS: { id: string; label: string; bank: RecapBank | null }[] = [
  { id: 'full', label: 'Chase · 12 of 19 from the bank · 4 waiting (+1 more)', bank: { name: 'Chase', total: 19, auto: 12, autoIn: 3, autoOut: 9, pending: 4, items: ITEMS, more: 1 } },
  { id: 'one', label: 'One of each: singular lines, no out card, no +more', bank: { name: 'Chase', total: 1, auto: 1, autoIn: 1, autoOut: 0, pending: 1, items: ITEMS.slice(2), more: 0 } },
  { id: 'busy', label: 'Busy month: 36 dots cap, 23 waiting', bank: { name: 'Chase', total: 96, auto: 58, autoIn: 22, autoOut: 36, pending: 23, items: ITEMS, more: 20 } },
  { id: 'none-waiting', label: 'Nothing pending: no 08', bank: { name: 'Chase', total: 19, auto: 12, autoIn: 3, autoOut: 9, pending: 0, items: [], more: 0 } },
  { id: 'none-auto', label: 'Bank picked up nothing: no 07, no cards, 08 shows', bank: { name: 'Chase', total: 6, auto: 0, autoIn: 0, autoOut: 0, pending: 2, items: ITEMS.slice(0, 2), more: 0 } },
  { id: 'no-bank', label: 'No bank field (flag off / no Plus): no 07, 08 or cards', bank: null },
];

export default function Fixtures() {
  // Client only: the story reads clocks and the viewport.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [open, setOpen] = useState<{ id: string; slide: RedesignSlide } | null>(null);
  if (!mounted) return null;

  const payloadFor = (id: string) => {
    const base = redesignPayload('normalWeek');
    const b = BANKS.find((x) => x.id === id)?.bank;
    return b ? { ...base, bank: b } : base;
  };
  const btn = { padding: '10px 12px', borderRadius: 999, border: '1px solid #d9ccb4', background: '#fff', font: '600 13px var(--font-inter)', margin: '0 6px 6px 0' } as const;

  return (
    <main style={{ background: '#fff8f0', minHeight: '100vh', padding: '24px 14px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ font: '800 20px var(--font-montserrat)', margin: '0 0 16px' }}>Recap · bank slides</h1>
        {BANKS.map((b) => {
          const keys = redesignSequence(payloadFor(b.id), { plan: 'pro' });
          return (
            <div key={b.id} data-fixture={`recap-${b.id}`} style={{ marginBottom: 18 }}>
              <div style={{ font: '600 14px var(--font-inter)', marginBottom: 6 }}>{b.label}</div>
              <div style={{ font: '500 11px ui-monospace, Menlo, monospace', color: '#6b6257', marginBottom: 8 }} data-keys={keys.join(',')}>{keys.join(' · ')}</div>
              {(['in', 'out', 'bank', 'waiting'] as const).filter((k) => keys.includes(k)).map((k) => (
                <button key={k} type="button" style={btn} data-open={`${b.id}:${k}`} onClick={() => setOpen({ id: b.id, slide: k })}>{k}</button>
              ))}
            </div>
          );
        })}
      </div>
      {open && (() => {
        const payload = payloadFor(open.id);
        const keys = redesignSequence(payload, { plan: 'pro' });
        return (
          <RecapStory
            payload={payload}
            plan="pro"
            startAt={Math.max(0, keys.indexOf(open.slide))}
            onClose={() => setOpen(null)}
            onAction={() => setOpen(null)}
          />
        );
      })()}
    </main>
  );
}
