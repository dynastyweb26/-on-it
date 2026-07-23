'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Client-side throttle on the resend button. Supabase SMTP is 30/hr project-wide;
// this just stops one user spamming the button.
const RESEND_COOLDOWN = 60; // seconds

export default function Login() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signup');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');            // non-error status (check email / reset sent)
  const [busy, setBusy] = useState(false);
  const [showResend, setShowResend] = useState(false); // email unconfirmed → offer resend
  const [cooldown, setCooldown] = useState(0);         // resend button cooldown (s)

  // Resend cooldown countdown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Surface a failed /auth/confirm callback (expired vs already-used link).
  // Read from the URL directly (no useSearchParams → no Suspense/dynamic churn).
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('authError');
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

  async function submit() {
    setError(''); setNotice(''); setShowResend(false);
    if (password.length < 8) { setError('Password needs at least 8 characters.'); return; }
    setBusy(true);
    const { data, error } = mode === 'signup'
      ? await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      // Unconfirmed email → offer to resend the confirmation.
      if (error.code === 'email_not_confirmed' || /not confirmed|confirm/i.test(error.message)) {
        setShowResend(true);
      }
      return;
    }
    if (mode === 'signup' && !data.session) {
      setNotice('Check your email to confirm your account, then sign in.');
      setShowResend(true);
      setMode('signin');
      return;
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
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    }).catch(() => {});
    setBusy(false);
    setNotice('If an account exists for that email, we just sent a password reset link. Check your inbox.');
  }

  async function resendConfirmation() {
    if (cooldown > 0 || !email) return;
    setError('');
    setCooldown(RESEND_COOLDOWN);
    await supabase.auth.resend({
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
