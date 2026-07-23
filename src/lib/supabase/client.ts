'use client';
import { createBrowserClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Normal client — PKCE (default). Handles sign-in and all session/data access.
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

// Implicit-flow client used ONLY to mint auth emails (password reset, signup
// confirmation, resend). PKCE mints a pkce_ token whose code_verifier lives in
// THIS browser's localStorage — unusable when the link is opened on another
// device, and unverifiable by verifyOtp(). Implicit flow makes {{ .TokenHash }}
// a plain OTP hash the server /auth/confirm route can verify cross-device.
//
// NOTE: this must NOT use @supabase/ssr's createBrowserClient — that wrapper
// HARDCODES flowType:'pkce' (overriding any auth option), so it always mints
// pkce_ tokens. Use the plain @supabase/supabase-js client, which respects
// flowType. Stateless (no persist/refresh/URL detection) so it never touches
// the PKCE cookie session — sign-in and session handling are unaffected.
export const createEmailAuthClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
