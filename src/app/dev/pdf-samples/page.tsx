// TEMPORARY — remove before merge (PUNCH-LIST "Itemized summary PDFs").
// Builds the four books PDFs from mock data through the real pipeline
// (buildSummaryPdf → templates → elementToPdf) so they can be checked on a
// phone. 404 in production.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PdfSamples from './PdfSamples';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'PDF samples (dev)', robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <PdfSamples />;
}
