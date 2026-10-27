'use client';
// ═══ Clients — saved clients and products & services ═══
// The Clients tab (UI redesign, 5-tab nav). Two segments: Clients · Products &
// Services (UI-REDESIGN-AUDIT §L14). Clients is the saved-clients list
// (merge 2 · 2·3, components/clients/ClientsList); Products & Services is the
// saved-items list (merge 2 · 2·8, components/clients/ProductsList).
//
// The pill tabs are handed to the list component instead of being rendered
// here: on laptop the design puts title, tabs, search and + on ONE row, and the
// search box lives with the list state (it counts the rows). One DOM order
// serves both — tabs, then the search on the next line below xl.
import { useEffect, useState } from 'react';
import ClientsList from '@/components/clients/ClientsList';
import ProductsList from '@/components/clients/ProductsList';
import PillTabs from '@/components/PillTabs';
import PageContainer from '@/components/PageContainer';

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
  const tabs = (
    <PillTabs label="Clients or products" options={SEGMENTS} value={segment} onChange={setSegment}
      className="xl:h-10 xl:rounded-[20px]" />
  );
  return (
    <PageContainer className="py-4 xl:pt-6">
      <div key={segment} role="tabpanel">
        {segment === 'clients' ? <ClientsList active={active} tabs={tabs} /> : <ProductsList active={active} tabs={tabs} />}
      </div>
    </PageContainer>
  );
}
