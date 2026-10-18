// GET /auth/callback — OAuth (Google, later Apple) return leg.
// signInWithOAuth() on the PKCE browser client stores the code_verifier in a
// cookie, so the SERVER can finish the exchange here and attach the session
// cookies to the same redirect (same pattern as /auth/confirm; see its header
// for why the cookies must ride the redirect response).
// Email links keep going through /auth/confirm — this route only handles ?code.
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { SIGNED_IN_COOKIE } from '@/components/tutorial/throb';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          pending.push(...cookiesToSet);
        },
      },
    }
  );

  // Provider denied / user cancelled / no code: back to the welcome screen.
  // Fixed destination only — no user-controlled redirect target here.
  if (!code || searchParams.get('error')) return NextResponse.redirect(new URL('/login?authError=invalid_link', origin));

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return NextResponse.redirect(new URL('/login?authError=invalid_link', origin));

  // Same routing as password sign-in: onboarding until a profile row exists.
  const { data: profile } = await supabase
    .from('profiles').select('id').eq('id', data.session.user.id).maybeSingle();
  const res = NextResponse.redirect(new URL(profile ? '/chat' : '/onboarding', origin));
  for (const { name, value, options } of pending) res.cookies.set(name, value, options);
  res.cookies.set(SIGNED_IN_COOKIE, '1', {
    path: '/', maxAge: 120, sameSite: 'lax', httpOnly: false, secure: origin.startsWith('https:'),
  });
  return res;
}
