'use client';
// ═══ Clients — saved clients and products & services ═══
// The Clients tab (UI redesign, 5-tab nav). Two segments: Clients · Products &
// Services (UI-REDESIGN-AUDIT §L14). Clients is the saved-clients list
// (merge 2 · 2·3, components/clients/ClientsList). Products & Services keeps
// its "coming soon" empty state until its table lands (merge 2 · 2·6–2·8).
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import ClientsList from '@/components/clients/ClientsList';

type Segment = 'clients' | 'products';
const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'clients', label: 'Clients' },
  { key: 'products', label: 'Products & Services' },
];

export default function Clients() {
  const [segment, setSegment] = useState<Segment>('clients');
  // /clients?segment=products opens the Products & Services segment
  // (Settings › Products & Services).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('segment') === 'products') setSegment('products');
  }, []);
  const i = SEGMENTS.findIndex((s) => s.key === segment);
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

      <div key={segment} role="tabpanel">
        {segment === 'clients' ? <ClientsList /> : (
          // "Coming soon" until merge 2 ships saved products: no promises, no
          // buttons. Merge 2 restores the design's empty-state copy (PUNCH-LIST).
          <div className="onit-rise mt-16 px-4 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-surface-container text-primary">
              <Icon name="handyman" size={32} />
            </span>
            <h1 className="mt-4 font-display text-xl font-bold text-on-background">Saved products &amp; services are coming soon.</h1>
            <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">Save what you charge for often and add it to an invoice in one tap.</p>
          </div>
        )}
      </div>
    </div>
  );
}
