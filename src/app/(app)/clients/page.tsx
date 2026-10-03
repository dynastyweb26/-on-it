'use client';
// ═══ Clients — saved clients and products & services ═══
// The Clients tab (UI redesign, 5-tab nav). Two segments: Clients · Products &
// Services (UI-REDESIGN-AUDIT §L14). Placeholder until the saved-list
// migrations land (audit commits 6–7, 11–12): nothing is read or written here
// yet — chat still saves every client silently as history, and only clients
// you choose to save will be listed.
import { useState } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';

type Segment = 'clients' | 'products';
const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'clients', label: 'Clients' },
  { key: 'products', label: 'Products & Services' },
];

const EMPTY: Record<Segment, { icon: IconName; title: string; body: string }> = {
  clients: {
    icon: 'group',
    title: 'Your saved clients live here',
    body: 'When you bill someone a second time, On It will ask if you want to save them. Saved clients show up here, A–Z.',
  },
  products: {
    icon: 'handyman',
    title: 'Your products & services live here',
    body: 'Things you charge for often can be saved, so they’re one tap away on your next invoice or quote.',
  },
};

export default function Clients() {
  const [segment, setSegment] = useState<Segment>('clients');
  const i = SEGMENTS.findIndex((s) => s.key === segment);
  const empty = EMPTY[segment];
  return (
    <div className="px-4 py-4">
      {/* Segmented control: the gold thumb slides by transform (MOTION-SPEC §13). */}
      <div role="tablist" aria-label="Clients or products"
        className="relative grid h-14 grid-cols-2 rounded-full bg-surface-container p-1">
        <span aria-hidden
          className="absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-full bg-primary-container shadow-card"
          style={{ transform: `translateX(${i * 100}%)`, transition: 'transform var(--motion-fast) var(--ease-standard)' }} />
        {SEGMENTS.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={s.key === segment}
            onClick={() => setSegment(s.key)}
            className={`relative z-[1] rounded-full px-2 text-sm leading-tight transition-colors active:scale-95
              ${s.key === segment ? 'font-bold text-on-background' : 'font-semibold text-on-surface-variant'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div key={segment} role="tabpanel" className="onit-rise mt-16 px-4 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-surface-container text-primary">
          <Icon name={empty.icon} size={32} />
        </span>
        <h1 className="mt-4 font-display text-xl font-bold text-on-background">{empty.title}</h1>
        <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">{empty.body}</p>
      </div>
    </div>
  );
}
