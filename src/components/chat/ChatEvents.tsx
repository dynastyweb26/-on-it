'use client';

// The thread's event cards (alive layer item 8).
//
// One job: show the owner what happened while they were away, from the events
// table only. Nothing here writes into StoredChat — the feed is derived state,
// so a restored chat can never replay a stale card.
//
// Lifecycle, all here so ChatView only mounts it:
//   open      → sweep (once per app session) + catch-up query
//   focus /
//   visibility → catch-up query
//   realtime  → a new row for THIS user is prepended as it lands
//   rendered  → seen_at is stamped, so the card retires with the chat
//
// The query is the owner's own rows through their session (RLS), newest first.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/financials';
import { eventVisibleInChat, type EventRow } from '@/lib/events';
import EventCard from '@/components/chat/EventCard';

const LIMIT = 20;
const SWEEP_KEY = 'onit-events-sweep-at';
const SWEEP_EVERY_MS = 6 * 3600e3;

const COLUMNS =
  'id, user_id, kind, actor, invoice_id, document_kind, document_number, client_name, amount, meta, dedupe_key, seen_at, acted_at, acted_result, occurred_at';

export default function ChatEvents({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  // The chat's start: events before it are only kept while unseen.
  const chatStartedAt = useRef(new Date().toISOString());
  const seenSent = useRef(new Set<string>());

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
      const rows = ((data ?? []) as unknown as EventRow[])
        .filter((e) => eventVisibleInChat(e, chatStartedAt.current));
      setEvents(rows);
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
          setEvents((prev) => (prev.some((e) => e.id === row.id) ? prev : [row, ...prev].slice(0, LIMIT)));
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

  // Seen: stamp what is on screen. Only three columns are grantable to the
  // browser, so this is the whole browser-side write.
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

  if (events.length === 0) return null;

  return (
    <div className={`flex w-full flex-col gap-2 ${className}`}>
      {events.map((e) => (
        <EventCard
          key={e.id}
          event={e}
          money={money}
          onOpen={e.invoice_id ? () => router.push(`/invoices/${e.invoice_id}`) : undefined}
        />
      ))}
    </div>
  );
}
