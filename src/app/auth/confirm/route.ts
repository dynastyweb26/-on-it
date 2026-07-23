// GET /auth/confirm — cross-device-safe email link callback.
// Supabase email links point here with ?token_hash&type&next. verifyOtp()
// validates the hash SERVER-side and the server client writes the session
// cookies — no PKCE code_verifier in the requesting browser's localStorage, so
// opening the link on a different device/browser (the mail-app case) works.
import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

  const to = (path: string) => NextResponse.redirect(new URL(path, origin));

  if (!token_hash || !type) return to('/login?authError=invalid_link');

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (!error) return to(next); // session cookies are set; land on the target

  // Distinguish expired vs already-used where the message allows.
  const m = error.message.toLowerCase();
  const reason = m.includes('expired') ? 'expired'
    : (m.includes('already') || m.includes('used')) ? 'used'
    : 'invalid_link';
  return to(`/login?authError=${reason}`);
}
