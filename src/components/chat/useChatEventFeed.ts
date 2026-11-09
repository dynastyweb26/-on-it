'use client';

// The chat's event feed, as a hook (alive layer items 8 and 10).
//
// One job: keep the owner's rows from the events table. Nothing here writes
// into StoredChat — the feed is derived state, so a restored chat can never
// replay a stale card.
//
//   open        → sweep (once per app session) + catch-up query
//   focus /
//   visibility  → catch-up query
//   realtime    → a new row for THIS user is prepended as it lands
//   rendered    → seen_at is stamped, so the card retires with the chat
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { eventVisibleInChat, type EventRow } from '@/lib/events';

const LIMIT = 20;
const SWEEP_KEY = 'onit-events-sweep-at';
const SWEEP_EVERY_MS = 6 * 3600e3;

const COLUMNS =
  'id, user_id, kind, actor, invoice_id, document_kind, document_number, client_name, amount, meta, dedupe_key, seen_at, acted_at, acted_result, occurred_at';

export function useChatEventFeed(chatStartedAt: string): EventRow[] {
  const [userId, setUserId] = useState<string | null>(null);
  const [fetched, setFetched] = useState<EventRow[]>([]);
  const seenSent = useRef(new Set<string>());
  // `chatStartedAt` is the SAVED thread's start (its oldest message), not the
  // moment this page mounted: a refresh restores the chat, and the seen cards
  // that landed during it must come back with it. Visibility is decided at read
  // time, so the start moving (the restore lands after the first render) just
  // re-filters what was already fetched.
  const events = useMemo(
    () => fetched.filter((e) => eventVisibleInChat(e, chatStartedAt)),
    [fetched, chatStartedAt],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (alive) setUserId(user?.id ?? null);
      } catch { /* signed out */ }
    })();
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('events')
        .select(COLUMNS)
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .limit(LIMIT);
      if (error) return;
      setFetched((data ?? []) as unknown as EventRow[]);
    } catch { /* offline: the next focus retries */ }
  }, [userId]);

  // Open: sweep the time-based events, then read the feed.
  useEffect(() => {
    if (!userId) return;
    void (async () => {
      let due = true;
      try {
        const last = Number(sessionStorage.getItem(SWEEP_KEY) ?? 0);
        due = !last || Date.now() - last > SWEEP_EVERY_MS;
      } catch { /* storage blocked */ }
      if (due) {
        try {
          const res = await fetch('/api/events/sweep', { method: 'POST' });
          if (res.ok) sessionStorage.setItem(SWEEP_KEY, String(Date.now()));
        } catch { /* the feed still loads */ }
      }
      await load();
    })();
  }, [userId, load]);

  // Realtime: this user's new rows, nothing else.
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`events-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as unknown as EventRow;
          if (!row?.id) return;
          setFetched((prev) => (prev.some((e) => e.id === row.id) ? prev : [row, ...prev].slice(0, LIMIT)));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  // Catch-up on focus/visibility; connections drop on mobile.
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  // Seen: stamp what has been rendered. Only three columns are grantable to
  // the browser, so this is the whole browser-side write.
  useEffect(() => {
    if (!userId || events.length === 0) return;
    const fresh = events.filter((e) => !e.seen_at && !seenSent.current.has(e.id));
    if (fresh.length === 0) return;
    fresh.forEach((e) => seenSent.current.add(e.id));
    void (async () => {
      try {
        await createClient()
          .from('events')
          .update({ seen_at: new Date().toISOString() })
          .in('id', fresh.map((e) => e.id))
          .eq('user_id', userId);
      } catch { /* it stays unseen and comes back — never a broken thread */ }
    })();
  }, [events, userId]);

  return events;
}
