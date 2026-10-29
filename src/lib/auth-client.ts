'use client';
// The browser's shared getUser() (see lib/auth-shared.ts). Use this instead of
// supabase.auth.getUser() in client code under (app): same result shape, one
// network request per page load.
import { createClient } from '@/lib/supabase/client';
import { createSharedGetUser } from '@/lib/auth-shared';
import { handleAuthChange } from '@/lib/cache';
import { handleDraftAuthChange } from '@/lib/drafts';

let shared: ReturnType<typeof createSharedGetUser<Awaited<ReturnType<ReturnType<typeof createClient>['auth']['getUser']>>>> | null = null;

function sharedGetUser() {
  if (!shared) {
    const auth = createClient().auth;
    shared = createSharedGetUser(() => auth.getUser());
    // Sign-in, sign-out, token refresh and profile updates all invalidate it.
    // The same event is where the display cache and any half-typed draft are
    // cleared: this is the ONE place, and it covers the sign-out button, an
    // expired refresh token and a sign-out in another tab (all SIGNED_OUT).
    auth.onAuthStateChange((event) => {
      handleAuthChange(event);
      handleDraftAuthChange(event);
      shared?.clear();
    });
  }
  return shared;
}

export const getSharedUser = () => sharedGetUser().get();
