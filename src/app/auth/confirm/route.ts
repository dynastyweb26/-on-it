// GET /auth/confirm — cross-device-safe email link callback.
// Supabase email links point here with ?token_hash&type&next. verifyOtp()
// validates the hash SERVER-side and the server client mints the session
// cookies — no PKCE code_verifier in the requesting browser's localStorage, so
// opening the link on a different device/browser (the mail-app case) works.
//
// THE BUG THIS FIXES: the session cookies verifyOtp() produces must ride the
// SAME response we redirect with. Cookies written via cookies() from
// next/headers do NOT propagate onto a NextResponse.redirect() we construct
// ourselves — so the redirect carried no Set-Cookie, middleware saw no session
// on the (protected) landing page, and bounced a freshly-confirmed user to
// /login in signup mode. Here the Supabase client writes into a collector and
// we attach those cookies to the exact redirect response we return.
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

// next must be a relative path on our own origin — no open redirect. Rejects
// protocol-relative ('//host'), schemes, and backslashes; new URL(next, origin)
// then pins it to our origin as a second guard.
const RELATIVE_PATH = /^\/[A-Za-z0-9\-._~/]*$/;
function safeNext(raw: string | null): string {
  if (raw && !raw.startsWith('//') && RELATIVE_PATH.test(raw)) return raw;
  return '/chat';
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(searchParams.get('next'));

  // Collect whatever session cookies the client wants to set, so we can attach
  // them to the SAME response we redirect with (the fix — see the file header).
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

  // Build a redirect and, when landing an authenticated user, stamp the
  // collected session cookies onto THAT response so the session survives.
  const redirectTo = (path: string, withSession = false) => {
    const res = NextResponse.redirect(new URL(path, origin));
    if (withSession) {
      for (const { name, value, options } of pending) res.cookies.set(name, value, options);
    }
    return res;
  };

  if (!token_hash || !type) return redirectTo('/login?authError=invalid_link');

  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });

  // Genuine verification failure (expired / already-used / invalid). The email
  // was NOT confirmed via this link and we have no address to prefill, so keep
  // the existing authError treatment rather than claiming "email confirmed".
  if (error) {
    const m = error.message.toLowerCase();
    const reason = m.includes('expired') ? 'expired'
      : (m.includes('already') || m.includes('used')) ? 'used'
      : 'invalid_link';
    return redirectTo(`/login?authError=${reason}`);
  }

  // Verified, but no usable session came back (edge case, e.g. a cross-device
  // quirk). The email IS confirmed and verifyOtp handed us the address — send
  // them to a graceful sign-in prompt with it prefilled, NEVER a blank
  // create-account form.
  if (!data.session) {
    const email = encodeURIComponent(data.user?.email ?? '');
    return redirectTo(`/login?confirmed=1&email=${email}`);
  }

  // Recovery shares this handler: honor the reset-password destination with the
  // session attached so that page can update the password.
  if (type === 'recovery') return redirectTo(next, true);

  // Signup / email confirm: land in the app with the session — onboarding if the
  // business profile isn't set up yet, chat if it is. The client is authenticated
  // in-memory from verifyOtp, so this RLS-scoped read is the user's own row.
  let hasProfile = false;
  const userId = data.user?.id;
  if (userId) {
    const { data: profile } = await supabase
      .from('profiles').select('id').eq('id', userId).maybeSingle();
    hasProfile = Boolean(profile);
  }
  return redirectTo(hasProfile ? '/chat' : '/onboarding', true);
}
