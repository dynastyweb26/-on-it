// TEMPORARY — remove before merge (PUNCH-LIST "Recap"). The recap story
// player on the prototype's 8 scenario fixtures, plus the old recap sheet's
// mocks. Nothing is mocked server-side; the cron is tested for real on preview.
// 404 in production (VERCEL_ENV === 'production').
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import RecapPreview from './RecapPreview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Recap preview (dev)', robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <RecapPreview />;
}
