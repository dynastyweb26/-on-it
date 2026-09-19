import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────
// Refresh-only middleware (@supabase/ssr updateSession pattern).
//
// Its ONLY job is to refresh the Supabase session cookie server-side before a
// page renders, so an expired access token is rotated and written back to the
// browser. It performs NO auth redirects — that is deliberate.
//
// WHY NO REDIRECT BRANCH: the previous middleware redirected unauthenticated
// users on protected paths with `return NextResponse.redirect(...)`. That
// returns a BRAND-NEW response that never received the cookies written by
// setAll below, so when getUser() rotated the refresh token the rotated cookie
// was dropped. The browser kept the old (now-consumed) refresh token, the next
// request's getUser() failed, and a freshly signed-in user was bounced to
// /login again — the "signed-in login loop" that got the file reverted twice
// and then deleted. It is the SAME dropped-cookie failure documented and fixed
// in src/app/auth/confirm/route.ts ("the session cookies … must ride the SAME
// response we redirect with").
//
// This file cannot reproduce that: it never constructs a second response and
// never redirects, so the refreshed cookies always ride the returned response.
// Auth enforcement stays where it actually lives — RLS (the sole server-side
// boundary) plus per-page client guards that redirect signed-out users to
// /login. Guests are allowed on /chat by design and must never be gated here.
// ─────────────────────────────────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  // ONE response object. Every refreshed cookie is written to both the request
  // (so a downstream server read sees it this pass) and to THIS response (so the
  // browser gets Set-Cookie). We always return THIS object — never a freshly
  // constructed one — so rotated cookies can never be dropped.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touch the session so an expired access token is refreshed and the rotated
  // cookies are persisted onto `response` via setAll. No branching, no redirect,
  // so nothing can bounce a signed-in user to /login.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Runs on app pages; skips auth/entry routes, machine routes, and assets.
  // Excludes: login, the auth callback (auth/), the referral token route (i/),
  // the public pay page (pay/) — unauthenticated by design, so refreshing a
  // session it never has is pointless work — the cron routes and the Stripe
  // webhook (machine-to-machine, no session and must be left untouched), _next,
  // the manifest / service worker / icons / brand assets, and static files by
  // extension.
  matcher: [
    '/((?!login|auth/|i/|pay/|api/followups|api/trial-reminders|api/webhooks/stripe' +
      '|_next/static|_next/image|manifest\\.json|sw\\.js|icons/|brands/|favicon\\.ico' +
      '|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|woff2?)$).*)',
  ],
};
