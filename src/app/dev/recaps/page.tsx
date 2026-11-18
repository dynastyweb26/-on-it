// Design fixtures for the recap's bank slides (design/recaps RecapPlayer.dc.html
// 07 bank activity, 08 waiting for you, and the "picked up from your bank" cards
// on 02 money in / 03 money out). Opens the real story with a fixture payload
// plus a `bank` field, at the slide asked for. It does not exist in production:
// Vercel sets VERCEL_ENV=production there, and the page 404s.
import { notFound } from 'next/navigation';
import Fixtures from './Fixtures';

export const dynamic = 'force-dynamic';

export default function RecapFixtures() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <Fixtures />;
}
