'use client';
import { createBrowserClient } from '@supabase/ssr';

// Normal client — PKCE (default). Handles sign-in and all session/data access.
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

// Implicit-flow client used ONLY to mint auth emails (password reset, signup
// confirmation, resend). PKCE would mint a pkce_ token whose code_verifier
// lives in THIS browser's localStorage — unusable when the link is opened on
// another device. Implicit flow makes {{ .TokenHash }} a plain OTP hash that
// the server /auth/confirm route can verifyOtp() cross-device. Holds no
// session and never auto-refreshes, so it can't disturb the PKCE session path.
export const createEmailAuthClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
