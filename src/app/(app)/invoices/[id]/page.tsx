'use client';
// Route entry for one document. Two renderings of the SAME detail body:
//   • below 1280 (phone, iPad, and every touch width): the full-page detail,
//     exactly as before — Back button in the header, nothing else on screen.
//   • at 1280+ (laptop): the Invoices split with this id selected, so a deep
//     link — the row click's URL, a notification, a follow-up, a client's
//     document link — lands on the list + detail the laptop design shows,
//     instead of the detail alone.
//
// The width is resolved on the client with matchMedia, never on the server: the
// server and the first client render are both the full-page detail, so there is
// no hydration mismatch, and at 1280+ the split takes over on the first effect
// (one frame of the detail's own skeleton, before any data has arrived).
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import InvoiceDetailScreen from '@/components/invoice-detail/InvoiceDetailScreen';
import InvoicesView from '@/components/tabs/InvoicesView';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  // Same breakpoint as the split (SplitView's xl:), the row click's matchMedia
  // and the design's laptop width.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const sync = () => setWide(mq.matches);
    sync(); // resize both ways: up re-selects this id, down returns to the page
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  if (wide) return <InvoicesView selectedId={id} />;
  return <InvoiceDetailScreen id={id} />;
}
