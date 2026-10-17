'use client';
import PasswordInput from '@/components/PasswordInput';
import { useEmailAuth } from '@/components/auth/useEmailAuth';

export default function Login() {
  const {
    mode, email, setEmail, password, setPassword, error, notice, busy,
    showResend, cooldown, passwordRef,
    switchMode, submit, sendReset, resendConfirmation,
  } = useEmailAuth();

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
          <PasswordInput
            ref={passwordRef}
            placeholder="Password (8+ characters)"
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
