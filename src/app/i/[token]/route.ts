import { NextRequest, NextResponse } from 'next/server';

// Referral / access-grant links: /i/<token> stashes the token in a cookie for
// redemption at onboarding. Validate the shape before trusting it into a
// cookie — access_grants tokens are 3–40 chars, referral codes 6–8 lowercase.
const TOKEN_RE = /^[a-zA-Z0-9_-]{3,40}$/;

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const res = NextResponse.redirect(new URL('/chat', req.url));
  if (TOKEN_RE.test(params.token)) {
    res.cookies.set('onit_grant', params.token, {
      maxAge: 60 * 60 * 24 * 30, sameSite: 'lax', path: '/',
    });
  }
  return res;
}
