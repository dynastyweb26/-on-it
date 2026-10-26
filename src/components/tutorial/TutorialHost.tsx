'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getSharedUser } from '@/lib/auth-client';
import { TABS, exactTabIndex, tabIndexOf } from '@/lib/tabs';
import {
  markTutorialSeen,
  readTutorialsSeen,
  writeTutorialsSeen,
  type TutorialTab,
  type TutorialsSeen,
} from '@/lib/tutorial-seen';
import TutorialOverlay from './TutorialOverlay';

const TAB_KEY: Record<string, TutorialTab> = {
  '/clients': 'clients',
  '/invoices': 'invoices',
  '/chat': 'chat',
  '/dashboard': 'books',
  '/settings': 'settings',
};

// Expanded as each mock screen lands. The player/mocks for the remaining tabs
// are committed separately (4–8); keeping the gate here means the minimal host
// cannot open a half-built screen.
const READY_TABS: TutorialTab[] = ['chat', 'invoices', 'clients', 'books', 'settings'];

function exactTabAt(path: string): TutorialTab | null {
  const i = exactTabIndex(path);
  return i >= 0 ? (TAB_KEY[TABS[i].href] ?? null) : null;
}

function tabAt(path: string): TutorialTab | null {
  const i = tabIndexOf(path);
  return i >= 0 ? (TAB_KEY[TABS[i].href] ?? null) : null;
}

export default function TutorialHost() {
  const pathname = usePathname();
  const [seen, setSeen] = useState<TutorialsSeen | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [active, setActive] = useState<TutorialTab | null>(null);
  const loadedFor = useRef<string | null>(null);
  const autoPath = useRef<string | null>(null);
  const activeRef = useRef<TutorialTab | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Read once per signed-in user. A failed read (missing column, network) leaves
  // `seen` null: no autoplay, and the app is never blocked.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      const {
        data: { user },
      } = await getSharedUser();
      if (cancelled) return;
      if (!user) {
        loadedFor.current = null;
        setUserId(null);
        setSeen(null);
        return;
      }
      const next = await readTutorialsSeen(supabase, user.id);
      if (cancelled) return;
      loadedFor.current = user.id;
      setUserId(user.id);
      setSeen(next);
    };

    void load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        loadedFor.current = null;
        setUserId(null);
        setSeen(null);
        setActive(null);
        return;
      }
      if (event === 'SIGNED_IN' && session?.user.id && session.user.id !== loadedFor.current) {
        void load();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // One tutorial per tab entry. The path ref makes sure a seen-state update
  // after Skip/Got it can never chain into another tutorial on the same path.
  useEffect(() => {
    if (!seen || active) return;
    const tab = exactTabAt(pathname);
    if (!tab || !READY_TABS.includes(tab)) return;
    if (autoPath.current === pathname) return;
    autoPath.current = pathname;
    if (seen[tab]) return;
    setActive(tab);
  }, [active, pathname, seen]);

  // Header/sidebar/Settings entry point. Always the current tab, never a picker.
  useEffect(() => {
    const onReplay = () => {
      if (activeRef.current) return;
      const tab = tabAt(window.location.pathname);
      if (!tab || !READY_TABS.includes(tab)) return;
      setActive(tab);
    };
    window.addEventListener('onit:tutorial-replay', onReplay);
    return () => window.removeEventListener('onit:tutorial-replay', onReplay);
  }, []);

  // Keep the weekly/monthly recap sheet from opening over the walkthrough. The
  // shell owns the provider, so it listens for this pair rather than reaching
  // into the tutorial state.
  useEffect(() => {
    window.dispatchEvent(new Event(active ? 'onit:tutorial-open' : 'onit:tutorial-close'));
  }, [active]);

  const close = useCallback(() => {
    const tab = active;
    setActive(null);
    if (!tab) return;
    if (userId && seen) {
      const next = markTutorialSeen(seen, tab);
      setSeen(next);
      void writeTutorialsSeen(createClient(), userId, next);
    }
  }, [active, seen, userId]);

  if (!active) return null;
  return <TutorialOverlay key={active} tab={active} onClose={close} />;
}
