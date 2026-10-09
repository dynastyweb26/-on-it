'use client';
// ═══ Clients — saved clients and products & services ═══
// The Clients tab (UI redesign, 5-tab nav). Two segments: Clients · Products &
// Services (UI-REDESIGN-AUDIT §L14). Clients is the saved-clients list
// (merge 2 · 2·3, components/clients/ClientsList); Products & Services is the
// saved-items list (merge 2 · 2·8, components/clients/ProductsList).
import { useEffect, useState } from 'react';
import ClientsList from '@/components/clients/ClientsList';
import ProductsList from '@/components/clients/ProductsList';

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
        {segment === 'clients' ? <ClientsList /> : <ProductsList />}
      </div>
    </div>
  );
}
