// TEMPORARY — remove before merge (PUNCH-LIST "Recap"). Renders the real
// RecapView with mock snapshots so the sheet can be checked on a phone. The
// cron is not mocked: test it for real on preview once the migration is
// applied. 404 in production.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import RecapPreview from './RecapPreview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Recap preview (dev)', robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <RecapPreview />;
}
