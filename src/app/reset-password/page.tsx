'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import PasswordInput from '@/components/PasswordInput';

export default function ResetPassword() {
  const supabase = createClient();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The /auth/confirm handler has already verified the recovery token
    // (token_hash + verifyOtp) and written the session cookies before
    // redirecting here, so the browser client reads that session. Gate the form
    // on it; if it never arrives (came here without a valid recovery), show the
    // retry path.
    let settled = false;
    const mark = (ok: boolean) => { if (!settled) { settled = true; setPhase(ok ? 'ready' : 'invalid'); } };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (session) mark(true); });
    supabase.auth.getSession().then(({ data }) => { if (data.session) mark(true); });
    const t = setTimeout(() => mark(false), 2500); // no session in time → invalid link
    return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setError('');
    if (password.length < 8) { setError('Password needs at least 8 characters.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setPhase('done');
    // Route into the app — onboarding for a brand-new profile, otherwise chat.
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user
      ? await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
      : { data: null };
    setTimeout(() => router.push(profile ? '/chat' : '/onboarding'), 900);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-6">
      <div>
        <h1 className="font-display text-4xl font-extrabold">
          On It<span className="text-primary">.</span>
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">Set a new password.</p>
      </div>

      {phase === 'checking' && <p className="text-sm text-on-surface-variant">Verifying your link…</p>}

      {phase === 'invalid' && (
        <>
          <p className="text-sm text-error">This reset link is invalid or has expired.</p>
          <button className="btn-primary" onClick={() => router.push('/login')}>Back to sign in</button>
        </>
      )}

      {phase === 'ready' && (
        <>
          <PasswordInput
            placeholder="New password (8+ characters)"
            autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-error">{error}</p>}
          <button className="btn-primary" disabled={busy || !password} onClick={submit}>
            {busy ? 'One sec…' : 'Set new password'}
          </button>
        </>
      )}

      {phase === 'done' && <p className="text-sm text-on-surface-variant">Password updated. Taking you in…</p>}
    </main>
  );
}
