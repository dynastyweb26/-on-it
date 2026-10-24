// GET /api/public/estimates/[token] — the public estimate page's data.
//
// The bearer token is the authorization, as on the pay page. Everything is
// projected by the service-role loader (no user_id, no storage paths, no client
// phone/email). A missing, draft, deleted, revoked or converted-unsigned link
// is the same `{ state: 'unavailable' }`, so a token cannot be probed.
import { NextRequest, NextResponse } from 'next/server';
import { loadPublicEstimate } from '@/lib/estimates/public';
import { rateLimit, clientIp } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  if (!(await rateLimit('estimate_view', `ip:${clientIp(req)}`))) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Wait a moment and try again.' },
      { status: 429 },
    );
  }

  try {
    const estimate = await loadPublicEstimate(params.token);
    return NextResponse.json(estimate, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (e) {
    console.error('public estimate: load failed', (e as Error)?.message);
    return NextResponse.json(
      { error: 'lookup_failed', message: 'We couldn’t load this estimate. Please try again.' },
      { status: 500 },
    );
  }
}
