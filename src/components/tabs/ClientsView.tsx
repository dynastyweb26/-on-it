'use client';
// ═══ Clients — saved clients and products & services ═══
// The Clients tab (UI redesign, 5-tab nav). Two segments: Clients · Products &
// Services (UI-REDESIGN-AUDIT §L14). Clients is the saved-clients list
// (merge 2 · 2·3, components/clients/ClientsList); Products & Services is the
// saved-items list (merge 2 · 2·8, components/clients/ProductsList).
import { useEffect, useState } from 'react';
import ClientsList from '@/components/clients/ClientsList';
import ProductsList from '@/components/clients/ProductsList';
import PillTabs from '@/components/PillTabs';

type Segment = 'clients' | 'products';
const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'clients', label: 'Clients' },
  { value: 'products', label: 'Products & Services' },
];

export default function Clients({ active = true }: { active?: boolean }) {
  const [segment, setSegment] = useState<Segment>('clients');
  // /clients?segment=products opens the Products & Services segment
  // (Settings › Products & Services).
  useEffect(() => {
    if (!active) return;
    if (new URLSearchParams(window.location.search).get('segment') === 'products') setSegment('products');
  }, [active]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-4 md:px-6">
      {/* Segmented control: the gold thumb slides by transform (MOTION-SPEC §13). */}
      <PillTabs label="Clients or products" options={SEGMENTS} value={segment} onChange={setSegment} />

      <div key={segment} role="tabpanel" data-coach={segment === 'clients' ? 'clients-list' : undefined}>
        {segment === 'clients' ? <ClientsList active={active} /> : <ProductsList active={active} />}
      </div>
    </div>
  );
}
