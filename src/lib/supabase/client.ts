'use client';
import { createBrowserClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Normal client — PKCE (default). Handles sign-in and all session/data access.
//
// Memoized per browser tab: createBrowserClient does NOT dedupe internally, so
// calling this in a render body (as every call site does) minted a fresh
// GoTrueClient on every render — eight-plus on a single /chat load, all racing
// on the same storage key ("Multiple GoTrueClient instances detected"). One
// lazy instance per tab fixes that with no change to any call site.
//
// The typeof window guard keeps SSR of client components from caching an
// instance into the shared server module scope (which would bleed across
// requests): on the server we hand back a throwaway; only the browser memoizes.
let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export const createClient = () => {
  if (typeof window === 'undefined') {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return (browserClient ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));
};

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
// Memoized per browser tab, same as createClient(): called in a render body on
// /login, it minted a fresh GoTrueClient per render against the shared storage
// key. The typeof window guard keeps SSR from caching into the server module
// scope. flowType/persistSession/etc. are unchanged.
let emailAuthClient: ReturnType<typeof createSupabaseClient> | undefined;

export const createEmailAuthClient = () => {
  if (typeof window === 'undefined') {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
  }
  return (emailAuthClient ??= createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  ));
};
