'use client';
// Route entry only: the detail body lives in
// components/invoice-detail/InvoiceDetailScreen so the laptop split view can
// render the same screen in its right-hand pane. The route keeps rendering the
// full-page detail at every width, exactly as before.
import { useParams } from 'next/navigation';
import InvoiceDetailScreen from '@/components/invoice-detail/InvoiceDetailScreen';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <InvoiceDetailScreen id={id} />;
}
