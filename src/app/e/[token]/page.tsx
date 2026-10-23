import 'server-only';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  loadOwnerEstimatePreviewByToken,
  loadPublicEstimate,
} from '@/lib/estimates/public';
import { rateLimit } from '@/lib/ratelimit';
import EstimateView from '@/components/estimate/EstimateView';
import { Notice, UnavailableNotice } from '@/components/estimate/Notice';
import type { PublicEstimateResult } from '@/lib/estimates/types';
import { estimateFontClassName } from './fonts';

// ─────────────────────────────────────────────────────────────────────────
// Public estimate page: /e/[token]. No login.
//
// Lives outside the (app) group like /pay so the per-page client auth guards
// never bounce a client to /login. The token is the authorization. The only
// data path is the service-role loader (src/lib/estimates/public.ts), which
// projects the whitelist and mints the short-lived attachment URLs.
//
// ?preview=1 is the OWNER's view of the same page: it needs a signed-in session,
// returns only the caller's own row (a draft included) and turns signing off.
// ─────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'; // per-request: headers, session, live data

export const metadata: Metadata = {
  title: 'Your estimate — On It',
  // Bearer-token links must never be indexed (same rule as /pay).
  robots: { index: false, follow: false },
};

export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { preview?: string };
}) {
  // Rate limit by IP, exactly as /pay does (rateIdentifier wants a NextRequest
  // that a server component does not have, so read the forwarded headers).
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  const ip = xff ? xff.split(',')[0]!.trim() : (h.get('x-real-ip') ?? 'unknown');
  if (!(await rateLimit('estimate_view', `ip:${ip}`))) {
    return (
      <div className={estimateFontClassName}>
        <Notice
          icon="hourglass_empty"
          title="One moment"
          body="Too many requests just now. Wait a few seconds and refresh this page."
        />
      </div>
    );
  }

  let payload: PublicEstimateResult | null = null;
  let preview = false;
  let previewId: string | null = null;

  try {
    if (searchParams?.preview === '1') {
      // Owner preview: only when the session owns the row. A signed-out visitor
      // (or another account) just gets the public page below.
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const owned = await loadOwnerEstimatePreviewByToken(params.token, user.id);
        if (owned) {
          payload = owned.result;
          preview = true;
          previewId = owned.id;
        }
      }
    }

    if (!payload) payload = await loadPublicEstimate(params.token);
  } catch (e) {
    console.error('public estimate page: load failed', (e as Error)?.message);
    return (
      <div className={estimateFontClassName}>
        <Notice
          icon="error_outline"
          title="Something went wrong"
          body="We couldn’t load this estimate right now. Please try again in a moment."
        />
      </div>
    );
  }

  return (
    <div className={estimateFontClassName}>
      {payload.state === 'unavailable' ? (
        <UnavailableNotice />
      ) : (
        <EstimateView
          initial={payload}
          token={params.token}
          preview={preview}
          previewId={previewId}
        />
      )}
    </div>
  );
}
