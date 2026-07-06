'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function Login() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    if (password.length < 8) {
      setError('Password needs at least 8 characters.');
      return;
    }
    setBusy(true);
    const fn =
      mode === 'signup'
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });
    const { data, error } = await fn;
    setBusy(false);
    if (error) { setError(error.message); return; }
    if (mode === 'signup' && !data.session) {
      setError('Check your email to confirm your account, then sign in.');
      setMode('signin');
      return;
    }
    // New accounts go to onboarding; profile check handles returning users
    const { data: profile } = await supabase
      .from('profiles').select('id').eq('id', data.session!.user.id).maybeSingle();
    router.push(profile ? '/chat' : '/onboarding');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-6">
      <div>
        <h1 className="font-display text-4xl font-extrabold">
          On It<span className="text-primary">.</span>
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">Invoices done by talking.</p>
      </div>
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
      <button className="btn-primary" disabled={busy || !email} onClick={submit}>
        {busy ? 'One sec…' : mode === 'signup' ? 'Create free account' : 'Sign in'}
      </button>
      <button
        className="text-sm text-on-surface-variant underline"
        onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
      >
        {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
    </main>
  );
}
