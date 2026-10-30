'use client';
// Is there a Supabase session right now?
//
// The bank feature (popup, red dots, Settings badge, Books footnote, reconnect
// banner) is inert until the answer is yes, so the sign-in sheet never has bank
// chrome behind it. This only reads the session the browser already holds — no
// network request and no database write. AppShell reads the same
// `onAuthStateChange` signal inline for the sign-in throb; this hook exists so
// bank components can ask for it without importing the Supabase client, which
// the structural test in bank-tracking.test.ts forbids.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** False before the first read, false again after SIGNED_OUT. */
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    void supabase.auth.getSession()
      .then(({ data }) => { if (!cancelled) setSignedIn(Boolean(data.session?.user.id)); })
      .catch(() => { /* stay signed out */ });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user.id ?? null;
      if (event === 'SIGNED_OUT') setSignedIn(false);
      else if (uid) setSignedIn(true);
      else if (event === 'INITIAL_SESSION') setSignedIn(false);
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  return signedIn;
}
