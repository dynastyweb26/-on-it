'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthError, User } from '@supabase/supabase-js';
import { createClient, createEmailAuthClient } from '@/lib/supabase/client';

// Client-side throttle on the resend button. Supabase SMTP is 30/hr project-wide;
// this just stops one user spamming the button.
const RESEND_COOLDOWN = 60; // seconds

/* ═══ What signUp can tell us apart — measured, not assumed ═══
   Probed against this project (GoTrue v2.193.1, auth-js 2.110.0, email
   confirmations ON / mailer_autoconfirm=false). All three cases return
   error=null and session=null. The ONLY field that separates them:

     new email          -> identities.length === 1
     exists, UNCONFIRMED-> identities.length === 1   <- identical to new
     exists, CONFIRMED  -> identities.length === 0   <- obfuscated fake user

   So "already has an account (confirmed)" is detectable and gets its own
   branch. "New" vs "started signing up but never confirmed" are NOT
   distinguishable client-side: GoTrue resends the confirmation and returns the
   same shape for both, by design. They therefore share one message, worded to
   be true either way — rather than guessing and telling a brand-new user they
   "already started signing up".

   The obfuscated object also carries role:"" and a FABRICATED id (it does not
   match the real user's id, so nothing leaks). We key on identities only:
   it's the documented signal and the one least likely to shift. */
function isExistingConfirmedAccount(user: User | null): boolean {
  return Array.isArray(user?.identities) && user.identities.length === 0;
}

/* Fallback for a config change we don't control: if email confirmations are
   ever switched OFF, GoTrue stops obfuscating and returns a real error for an
   existing user instead. Same conclusion, different channel. */
function isAlreadyRegisteredError(error: AuthError | null): boolean {
  if (!error) return false;
  return error.code === 'user_already_exists'
    || /already registered|already exists/i.test(error.message);
}

export default function Login() {
  const supabase = createClient();               // PKCE — sign-in + session/data
  const emailAuth = createEmailAuthClient();      // implicit — mints auth emails only
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signup');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');            // non-error status (check email / reset sent)
  const [busy, setBusy] = useState(false);
  const [showResend, setShowResend] = useState(false); // email unconfirmed → offer resend
  const [cooldown, setCooldown] = useState(0);         // resend button cooldown (s)
  const passwordRef = useRef<HTMLInputElement>(null);  // focused when we flip to sign-in

  // Resend cooldown countdown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Surface an /auth/confirm callback outcome. Read from the URL directly
  // (no useSearchParams → no Suspense/dynamic churn).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Email confirmed, but the confirm handler couldn't establish a session on
    // this device (e.g. opened on a different device). The account is real and
    // confirmed — drop them into sign-in with the email prefilled and the
    // password focused, NEVER a blank create-account form.
    if (params.get('confirmed') === '1') {
      const em = params.get('email') ?? '';
      setMode('signin');
      if (em) setEmail(em);
      setShowResend(false); // nothing to resend — already confirmed
      setNotice('Email confirmed — sign in to continue.');
      window.history.replaceState({}, '', '/login');
      requestAnimationFrame(() => passwordRef.current?.focus());
      return;
    }

    const reason = params.get('authError');
    if (!reason) return;
    setMode('signin');
    setError(
      reason === 'expired' ? 'That link has expired. Request a new one below.'
      : reason === 'used' ? 'That link was already used. Sign in, or request a new link below.'
      : 'That link is invalid. Request a new one below.'
    );
    // Clean the query so a refresh doesn't re-show it.
    window.history.replaceState({}, '', '/login');
  }, []);

  function switchMode(m: 'signin' | 'signup' | 'forgot') {
    setMode(m); setError(''); setNotice(''); setShowResend(false);
  }

  /** They already have a usable account — put them one field away from being in.
   *  Email stays (they just typed it), password clears (a signup password they
   *  invented is probably not their real one) and takes focus. */
  function switchToSignIn() {
    setMode('signin');
    setError('');
    setShowResend(false); // nothing to resend — this account is already confirmed
    setNotice('You already have an account. Enter your password to sign in.');
    setPassword('');
    // The password input renders in both modes, so it exists right now; the
    // rAF just lets React commit the mode change before we take focus.
    requestAnimationFrame(() => passwordRef.current?.focus());
  }

  async function submit() {
    setError(''); setNotice(''); setShowResend(false);
    if (password.length < 8) { setError('Password needs at least 8 characters.'); return; }
    setBusy(true);
    // signUp via the implicit client so the confirmation email is a plain hash
    // (not pkce_) and works cross-device. Sign-in stays on the PKCE client.
    const { data, error } = mode === 'signup'
      ? await emailAuth.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      // Confirmations OFF → an existing account surfaces as an error instead of
      // an obfuscated user. Same destination: sign in, don't re-register.
      if (mode === 'signup' && isAlreadyRegisteredError(error)) {
        switchToSignIn();
        return;
      }
      setError(error.message);
      // Unconfirmed email → offer to resend the confirmation.
      if (error.code === 'email_not_confirmed' || /not confirmed|confirm/i.test(error.message)) {
        setShowResend(true);
      }
      return;
    }

    // Existing CONFIRMED account. No email was sent, so the old "check your
    // email" copy left these users waiting for a message that never arrives —
    // the dead end this branch removes.
    if (mode === 'signup' && isExistingConfirmedAccount(data.user)) {
      switchToSignIn();
      return;
    }

    if (mode === 'signup' && !data.session) {
      // Either a brand-new signup or a re-signup on an unconfirmed address —
      // indistinguishable here (see the note at the top of this file). A
      // confirmation email has genuinely just been sent in BOTH cases, so this
      // wording is accurate either way and the resend action fits both.
      setNotice('Check your email to finish signing up, then come back and sign in.');
      setShowResend(true);
      setMode('signin');
      return;
    }
    // Confirmations OFF: signUp returned a session on the (no-persist) email
    // client — hand it to the PKCE client so the session persists exactly as
    // before. (Sign-in already has its session on the PKCE client.)
    if (mode === 'signup' && data.session) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }
    // New accounts go to onboarding; profile check handles returning users.
    const { data: profile } = await supabase
      .from('profiles').select('id').eq('id', data.session!.user.id).maybeSingle();
    router.push(profile ? '/chat' : '/onboarding');
  }

  async function sendReset() {
    setError(''); setNotice('');
    if (!email) { setError('Enter your email first.'); return; }
    setBusy(true);
    // Never reveal whether the address exists — same outcome either way.
    // Route the emailed link through the server /auth/confirm handler (token_hash
    // + verifyOtp) so it works cross-device; the template appends
    // type=recovery&next=/reset-password.
    await emailAuth.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    }).catch(() => {});
    setBusy(false);
    setNotice('If an account exists for that email, we just sent a password reset link. Check your inbox.');
  }

  async function resendConfirmation() {
    if (cooldown > 0 || !email) return;
    setError('');
    setCooldown(RESEND_COOLDOWN);
    await emailAuth.auth.resend({
      type: 'signup', email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    }).catch(() => {});
    setNotice('Confirmation email sent. Check your inbox.');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-6">
      <div>
        <h1 className="font-display text-4xl font-extrabold">
          On It<span className="text-primary">.</span>
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">Invoices done by talking.</p>
      </div>

      {mode === 'forgot' ? (
        <>
          <p className="text-sm text-on-surface-variant">
            Enter your email and we&apos;ll send a link to reset your password.
          </p>
          <input
            className="input" type="email" placeholder="Email" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className="text-sm text-error">{error}</p>}
          {notice && <p className="text-sm text-on-surface-variant">{notice}</p>}
          <button className="btn-primary" disabled={busy || !email} onClick={sendReset}>
            {busy ? 'One sec…' : 'Send reset link'}
          </button>
          <button className="text-sm text-on-surface-variant underline" onClick={() => switchMode('signin')}>
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <input
            className="input" type="email" placeholder="Email" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <input
            ref={passwordRef}
            className="input" type="password" placeholder="Password (8+ characters)"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-error">{error}</p>}
          {notice && <p className="text-sm text-on-surface-variant">{notice}</p>}
          {showResend && (
            <button
              className="text-left text-sm text-primary underline disabled:text-on-surface-variant disabled:no-underline"
              disabled={cooldown > 0 || !email} onClick={resendConfirmation}
            >
              {cooldown > 0 ? `Resend confirmation email (${cooldown}s)` : 'Resend confirmation email'}
            </button>
          )}
          {mode === 'signup' && (
            <p className="text-sm text-on-surface-variant">
              By creating an account you agree to our{' '}
              <a href="/terms" className="underline">Terms</a> and{' '}
              <a href="/privacy" className="underline">Privacy Policy</a>.
            </p>
          )}
          <button className="btn-primary" disabled={busy || !email} onClick={submit}>
            {busy ? 'One sec…' : mode === 'signup' ? 'Create free account' : 'Sign in'}
          </button>
          <button
            className="text-sm text-on-surface-variant underline"
            onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
          >
            {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
          {mode === 'signin' && (
            <button className="text-sm text-on-surface-variant underline" onClick={() => switchMode('forgot')}>
              Forgot password?
            </button>
          )}
        </>
      )}
    </main>
  );
}
