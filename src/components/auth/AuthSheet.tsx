'use client';
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import PasswordInput from '@/components/PasswordInput';
import { createClient } from '@/lib/supabase/client';
import { AUTH_PROVIDERS, ANY_PROVIDER } from '@/lib/intro-media';
import type { useEmailAuth } from './useEmailAuth';

type Auth = ReturnType<typeof useEmailAuth>;
export type SheetEntry = 'start' | 'signin';

// Bottom sheet opened by Get Started / Sign in. Providers first when any is
// enabled, otherwise straight to the email step. All email logic lives in
// useEmailAuth (owned by the page so URL-link outcomes can open the sheet).
export default function AuthSheet({ entry, auth, onClose }: {
  entry: SheetEntry; auth: Auth; onClose: () => void;
}) {
  const [step, setStep] = useState<'providers' | 'email'>(
    ANY_PROVIDER && !auth.arrivedFromLink ? 'providers' : 'email',
  );
  const [providerBusy, setProviderBusy] = useState<'apple' | 'google' | null>(null);
  const [providerError, setProviderError] = useState('');
  const { mode, email, setEmail, password, setPassword, error, notice, busy,
    showResend, cooldown, passwordRef, switchMode, submit, sendReset, resendConfirmation } = auth;

  // Escape closes; background scroll is already locked app-wide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // NOTE: OAuth code exchange is NOT handled by /auth/confirm yet. Keep the
  // NEXT_PUBLIC_AUTH_* flags off until it is.
  async function oauth(provider: 'apple' | 'google') {
    setProviderError(''); setProviderBusy(provider);
    const { error } = await createClient().auth.signInWithOAuth({
      provider, options: { redirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (error) { setProviderError(error.message); setProviderBusy(null); }
  }

  const title = step === 'providers'
    ? (entry === 'signin' ? 'Sign in' : 'Get started')
    : mode === 'forgot' ? 'Reset password' : mode === 'signin' ? 'Sign in' : 'Create account';
  const isForgot = mode === 'forgot';
  const label = 'text-[13px] font-semibold leading-[18px] text-on-surface-variant';

  return (
    <div data-kb-fit className="fixed inset-0 z-[80] flex items-end justify-center bg-on-background/45" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-t-[20px] bg-background pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-card-raised"
        style={{ animation: 'onit-sheet-in var(--motion-slow) var(--ease-standard) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[22px] justify-center pt-2"><div className="h-[5px] w-9 rounded-[3px] bg-outline-variant" /></div>
        <div className="grid h-14 grid-cols-[44px_1fr_44px] items-center px-4">
          {step === 'email' && ANY_PROVIDER ? (
            <button aria-label="Back" onClick={() => { switchMode('signup'); setStep('providers'); }}
              className="grid h-11 w-11 place-items-center rounded-full"><Icon name="arrow_back" size={22} /></button>
          ) : <span />}
          <h2 className="text-center font-display text-xl font-bold">{title}</h2>
          <button aria-label="Close" onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full bg-surface-container"><Icon name="close" size={22} /></button>
        </div>

        {step === 'providers' ? (
          <div className="flex flex-col gap-3 px-6 pt-3">
            {AUTH_PROVIDERS.apple && (
              <button onClick={() => oauth('apple')} disabled={!!providerBusy}
                className="min-h-touch w-full rounded-button bg-black font-semibold text-white disabled:opacity-40">
                {providerBusy === 'apple' ? 'One sec…' : 'Continue with Apple'}
              </button>
            )}
            {AUTH_PROVIDERS.google && (
              <button onClick={() => oauth('google')} disabled={!!providerBusy}
                className="min-h-touch w-full rounded-button border border-outline bg-white font-semibold disabled:opacity-40">
                {providerBusy === 'google' ? 'One sec…' : 'Continue with Google'}
              </button>
            )}
            <button onClick={() => { switchMode(entry === 'signin' ? 'signin' : 'signup'); setStep('email'); }}
              className="relative min-h-touch w-full rounded-button border border-outline font-semibold">
              <Icon name="mail" size={22} className="absolute left-5 top-4" />Continue with email
            </button>
            {providerError && <p role="alert" className="text-sm text-error">{providerError}</p>}
            <p className="px-3 pt-2 text-center text-[13px] leading-[19px] text-on-surface-variant">
              By continuing you agree to our <a href="/terms" className="font-semibold text-on-background underline">Terms</a> and{' '}
              <a href="/privacy" className="font-semibold text-on-background underline">Privacy Policy</a>.
            </p>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4 px-6 pt-3"
            onSubmit={(e) => { e.preventDefault(); if (!busy && email) (isForgot ? sendReset() : submit()); }}
          >
            {notice && (
              <div role="status" className="flex items-start gap-3 rounded-card border border-outline-variant/60 bg-surface-container-low p-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon name="mail" size={20} /></span>
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-[15px] leading-[22px]">{notice}</p>
                  {showResend && (
                    <button type="button" onClick={resendConfirmation} disabled={cooldown > 0 || !email}
                      className="min-h-7 self-start text-sm font-semibold text-primary underline disabled:text-on-surface-variant disabled:no-underline">
                      {cooldown > 0 ? `Resend confirmation email (${cooldown}s)` : 'Resend confirmation email'}
                    </button>
                  )}
                </div>
              </div>
            )}
            {isForgot && <p className="text-[15px] leading-[22px] text-on-surface-variant">Enter your email and we&apos;ll send a link to reset your password.</p>}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-email" className={label}>Email</label>
              <input id="auth-email" className="input" type="email" inputMode="email" autoComplete="email"
                placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {!isForgot && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="auth-password" className={label}>Password</label>
                <PasswordInput id="auth-password" ref={passwordRef} placeholder="8+ characters"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            {error && (
              <p role="alert" className="flex items-start gap-1.5 text-sm text-error">
                <Icon name="error" size={18} className="shrink-0" />{error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy || !email} aria-busy={busy}>
              {busy ? 'One sec…' : isForgot ? 'Send reset link' : mode === 'signin' ? 'Sign in' : 'Create free account'}
            </button>
            {mode === 'signup' && (
              <p className="-mt-1 text-center text-[13px] text-on-surface-variant">
                By creating an account you agree to our <a href="/terms" className="underline">Terms</a> and{' '}
                <a href="/privacy" className="underline">Privacy Policy</a>.
              </p>
            )}
            <div className="-mt-2 flex flex-col items-center">
              {mode === 'signup' && <button type="button" className="min-h-11 px-3 text-[15px] text-on-surface-variant" onClick={() => switchMode('signin')}>Already have an account? <span className="font-semibold text-on-background underline">Sign in</span></button>}
              {mode === 'signin' && <>
                <button type="button" className="min-h-11 px-3 text-[15px] text-on-surface-variant" onClick={() => switchMode('signup')}>New here? <span className="font-semibold text-on-background underline">Create an account</span></button>
                <button type="button" className="min-h-11 px-3 text-[15px] font-semibold underline" onClick={() => switchMode('forgot')}>Forgot password?</button>
              </>}
              {isForgot && <button type="button" className="min-h-11 px-3 text-[15px] font-semibold underline" onClick={() => switchMode('signin')}>Back to sign in</button>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
