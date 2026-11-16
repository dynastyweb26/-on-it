// Design fixtures for design/tiers §02 (AI meter) and §03 (AI limit card), from
// the board's own states, inside a 390px chat column. Numbers and plans come
// from lib/plan-catalog, as in the app. It does not exist in production:
// Vercel sets VERCEL_ENV=production there, and the page 404s.
import { notFound } from 'next/navigation';
import Fixtures from './Fixtures';

export const dynamic = 'force-dynamic';

export default function TiersFixtures() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <Fixtures />;
}
