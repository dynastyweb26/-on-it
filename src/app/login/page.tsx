'use client';
import { useEffect, useState } from 'react';
import IntroHero from '@/components/auth/IntroHero';
import AuthSheet, { type SheetEntry } from '@/components/auth/AuthSheet';
import { useEmailAuth } from '@/components/auth/useEmailAuth';

// Welcome screen: where signed-out users land. Get Started / Sign in open the
// auth sheet. Auth logic lives in useEmailAuth (also handles ?confirmed / ?authError).
export default function Login() {
  const auth = useEmailAuth();
  const [entry, setEntry] = useState<SheetEntry | null>(null);

  // Coming back from an /auth/confirm outcome: open straight to the email step.
  useEffect(() => {
    if (auth.arrivedFromLink) setEntry('signin');
  }, [auth.arrivedFromLink]);

  function open(e: SheetEntry) {
    auth.switchMode(e === 'signin' ? 'signin' : 'signup');
    setEntry(e);
  }

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
      <div className="flex h-11 shrink-0 items-center justify-center font-display text-[22px] font-extrabold leading-7" aria-label="On It.">
        <span>On It</span><span className="ml-0.5 mt-3 h-[5px] w-[5px] rounded-full bg-primary-container" />
      </div>
      <IntroHero />
      <div className="shrink-0 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <h1 className="mb-5 text-balance text-center font-display text-[32px] font-extrabold leading-10 tracking-tight">
          Fast Invoices.<br />Fast Money.
        </h1>
        <button className="btn-primary w-full text-[17px]" onClick={() => open('start')}>Get Started</button>
        <button className="mt-1 min-h-12 w-full text-[15px] text-on-surface-variant" onClick={() => open('signin')}>
          Already have an account? <span className="font-semibold text-on-background underline">Sign in</span>
        </button>
        <div className="flex h-8 items-center justify-center gap-5 text-[13px] text-on-surface-variant">
          <a href="/terms" className="underline underline-offset-2">Terms</a>
          <a href="/privacy" className="underline underline-offset-2">Privacy Policy</a>
        </div>
      </div>
      {entry && <AuthSheet key={entry} entry={entry} auth={auth} onClose={() => setEntry(null)} />}
    </main>
  );
}
