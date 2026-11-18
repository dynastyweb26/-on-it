'use client';
// Starts PostHog once, in the browser, when NEXT_PUBLIC_POSTHOG_KEY is set.
// The account id (never email or name) identifies the person; sign-out
// resets it. Public client pages (/pay, /e, /i) never start it.
// What is sent and dropped: lib/analytics/posthog-scrub.ts.
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { createClient } from '@/lib/supabase/client';
import { isPublicPath, posthogOptions } from '@/lib/analytics/posthog-scrub';

let started = false;

export default function PostHogInit() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || started || isPublicPath(window.location.pathname)) return;
    started = true;
    posthog.init(key, posthogOptions());

    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) posthog.identify(user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') posthog.reset();
      else if (session?.user && posthog.get_distinct_id() !== session.user.id) posthog.identify(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);
  return null;
}
