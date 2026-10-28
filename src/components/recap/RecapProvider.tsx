'use client';
// ═══ Recap access ═══ (RECAP-SPEC §0b, commit 14) — mounted once by the (app)
// layout, so it lives for the whole app open. It
//   • loads the owner's latest recaps (own rows by RLS) and their paid status;
//   • (a) offers the Watch / Later sheet once per app open for a new recap —
//     the newest one from the last 14 days that is unwatched, not put off and
//     not a nothing-at-all period (lib/recap/rows promptPick), or the one a
//     push tap named (/dashboard?recap=<id>). Never auto-plays: the story
//     opens only from "Watch". "Later" stamps prompted_at, so that recap's
//     sheet never comes back (older unprompted ones are retired with it);
//   • owns the story player. open(row) is the ONE way to play a recap (Books
//     row, history list, the sheet's Watch): it primes the audio inside the
//     tap that calls it (iOS's gesture rule), then mounts the story; opening
//     stamps seen_at (watched);
//   • (d) says whether the Books tab dot shows (an unwatched recap from the
//     last 14 days, lib/recap/rows hasUnwatched);
//   • (f) routes the story's buttons: "View invoices" → the unpaid list,
//     "Make an invoice" → a fresh chat.
// The free plan is not shut out any more: it gets the first 2 weekly recaps
// (lib/recap/quota) and everything after that is locked, per row, with the
// "You've used your 2 free recaps" wall on tap. So `access` is only about
// whether recaps exist for this owner ('off' / 'loading' / 'open'); the plan
// decides which rows can be played. Everything is inert while RECAPS_LIVE is
// off.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import RecapMark from '@/components/recap/RecapMark';
import type { RecapAction } from '@/components/recap/clock';
import { createClient } from '@/lib/supabase/client';
import { PAYWALL_ENABLED, isPaidTier } from '@/lib/paywall';
import { recapUnlocked } from '@/lib/recap/quota';
import { subscribeAccess } from '@/lib/upgrade-return';
import { RECAPS_LIVE } from '@/lib/recaps-live';
import { primeRecapAudio } from '@/lib/recap/audio';
import { localYmd, resolveTimeZone } from '@/lib/recap/dates';
import {
  RECAP_FULL_COLS, announces, hasUnwatched, normalizeRow, playable, promptPick, readyTitle, rowLabel, sortRows,
  type RecapRow,
} from '@/lib/recap/rows';
import { getSharedUser } from '@/lib/auth-client';

// The story's code and CSS load only when a recap opens.
const RecapStory = dynamic(() => import('@/components/recap/RecapStory'), { ssr: false });

const LATEST = 8;   // rows kept here (with payload): Books card, dot, prompt
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 'off' = RECAPS_LIVE off or signed out. */
export type RecapAccess = 'off' | 'loading' | 'open';

type RecapCtx = {
  access: RecapAccess;
  /** Free (or canceled) plan: only the two slotted weekly recaps play. */
  freePlan: boolean;
  /** Paid-built rows always play; a free-plan row needs one of the two slots. */
  canPlay: (row: Pick<RecapRow, 'kind' | 'free_plan' | 'free_slot'>) => boolean;
  /** Latest recaps, newest first. */
  rows: RecapRow[];
  /** Books tab dot. */
  unwatched: boolean;
  /** Watched in this app open (lists merge it with their own seen_at). */
  watched: ReadonlySet<string>;
  /** Play a recap. Call it synchronously inside the tap (sound unlock). */
  open: (row: RecapRow) => void;
};

const Ctx = createContext<RecapCtx>({
  access: 'off', freePlan: false, canPlay: () => false, rows: [], unwatched: false, watched: new Set(), open: () => {},
});
export const useRecaps = () => useContext(Ctx);

const today = () => {
  let tz: string | undefined;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* default */ }
  return localYmd(resolveTimeZone(tz), new Date());
};

function stripRecapParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('recap')) return;
  url.searchParams.delete('recap');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

export default function RecapProvider({ suppressed, children }: { suppressed: boolean; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [access, setAccess] = useState<RecapAccess>(RECAPS_LIVE ? 'loading' : 'off');
  const [freePlan, setFreePlan] = useState(false);
  const [rows, setRows] = useState<RecapRow[]>([]);
  const [watched, setWatched] = useState<ReadonlySet<string>>(() => new Set());
  const [prompt, setPrompt] = useState<RecapRow | null>(null);
  const [story, setStory] = useState<RecapRow | null>(null);
  const prompted = useRef(false);   // one sheet decision per app open

  // ── Load ──
  // Runs on mount, and again when the unlock poll sees the tier turn paid
  // (lib/upgrade-return.ts), so a just-paid user unlocks every row with no refresh.
  useEffect(() => {
    if (!RECAPS_LIVE) return;
    const supabase = createClient();
    let live = true;
    const load = () => (async () => {
      const { data: { user } } = await getSharedUser();
      if (!user) { if (live) setAccess('off'); return; }
      let free = false;
      if (PAYWALL_ENABLED) {
        const { data: prof } = await supabase.from('profiles').select('access_tier').eq('id', user.id).maybeSingle();
        free = !isPaidTier((prof?.access_tier as string | null) ?? null);
      }
      // Free owners load their rows like everyone else: the first two weekly
      // recaps are theirs to play, and the rest are shown locked.
      const { data } = await supabase.from('recaps').select(RECAP_FULL_COLS)
        .order('period_end', { ascending: false }).limit(LATEST);
      if (!live) return;
      setFreePlan(free);
      setRows(sortRows(((data ?? []) as Record<string, unknown>[]).map(normalizeRow)));
      setAccess('open');
    })().catch(() => { if (live) setAccess('off'); });   // best-effort: no recaps this time
    void load();
    const off = subscribeAccess(() => { void load(); });
    return () => { live = false; off(); };
  }, []);

  // ── (a) The Watch / Later sheet: once per app open, never over the walkthrough ──
  useEffect(() => {
    if (access !== 'open' || suppressed || prompted.current) return;
    prompted.current = true;
    const supabase = createClient();
    (async () => {
      const wanted = new URLSearchParams(window.location.search).get('recap');
      let row: RecapRow | null = null;
      if (wanted && UUID_RE.test(wanted)) {
        // A push tap: offer that recap even if it was put off before.
        row = rows.find((r) => r.id === wanted) ?? null;
        if (!row) {
          const { data } = await supabase.from('recaps').select(RECAP_FULL_COLS).eq('id', wanted).maybeSingle();
          row = data ? normalizeRow(data as Record<string, unknown>) : null;
        }
        if (row && (!announces(row) || !recapUnlocked(row))) row = null;
      }
      if (!row) {
        // Only a recap this owner can actually open is worth a prompt.
        row = promptPick(rows.filter(recapUnlocked), today());
        if (row) {
          // One sheet, not a stack: older recaps waiting for theirs are retired
          // with this one (still unwatched, so the Books dot stays).
          const older = rows.filter((r) => r.id !== row!.id && !r.seen_at && !r.prompted_at && r.period_end <= row!.period_end);
          if (older.length) {
            const at = new Date().toISOString();
            void supabase.from('recaps').update({ prompted_at: at }).in('id', older.map((r) => r.id)).then(() => undefined);
            setRows((rs) => rs.map((r) => (older.some((o) => o.id === r.id) ? { ...r, prompted_at: at } : r)));
          }
        }
      }
      stripRecapParam();
      if (row) setPrompt(row);
    })().catch(() => { /* no sheet this time */ });
  }, [access, suppressed, rows]);

  // ── Play ──
  const markWatched = useCallback((row: RecapRow) => {
    setWatched((w) => (w.has(row.id) ? w : new Set(w).add(row.id)));
    if (row.seen_at) return;
    const at = new Date().toISOString();
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, seen_at: at } : r)));
    void createClient().from('recaps').update({ seen_at: at }).eq('id', row.id).then(() => undefined);
  }, []);

  const open = useCallback((row: RecapRow) => {
    primeRecapAudio();          // synchronously, inside the caller's tap
    setPrompt(null);
    // Locked rows never play, whatever called this (the UI opens the wall).
    const plays = (r: RecapRow) => playable(r) && recapUnlocked(r);
    const show = (r: RecapRow) => { if (plays(r)) { markWatched(r); setStory(r); } };
    const have = plays(row) ? row : rows.find((r) => r.id === row.id && plays(r));
    if (have) { show(have); return; }
    // A history row (listed without its payload): fetch it, then play.
    void createClient().from('recaps').select(RECAP_FULL_COLS).eq('id', row.id).maybeSingle()
      .then(({ data }) => { if (data) show(normalizeRow(data as Record<string, unknown>)); });
  }, [rows, markWatched]);

  function later() {
    const row = prompt;
    setPrompt(null);
    if (!row || row.prompted_at) return;
    const at = new Date().toISOString();
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, prompted_at: at } : r)));
    void createClient().from('recaps').update({ prompted_at: at }).eq('id', row.id).then(() => undefined);
  }

  // ── (f) The story's buttons ──
  const onAction = useCallback((a: RecapAction) => {
    setStory(null);
    if (a === 'view-invoices') router.push('/invoices?filter=unpaid');
    // Already on Chat: the page won't remount for ?new=1, so ask it directly.
    else if (pathname?.startsWith('/chat')) window.dispatchEvent(new Event('onit-new-chat'));
    else router.push('/chat?new=1');
  }, [router, pathname]);

  const canPlay = useCallback((r: Pick<RecapRow, 'kind' | 'free_plan' | 'free_slot'>) => recapUnlocked(r), []);

  const value = useMemo<RecapCtx>(() => ({
    access,
    freePlan,
    canPlay,
    rows,
    // A locked recap never pulses the Books tab either.
    unwatched: access === 'open' && hasUnwatched(rows.filter(recapUnlocked), today()),
    watched,
    open,
  }), [access, freePlan, canPlay, rows, watched, open]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {prompt && !story && <RecapPrompt row={prompt} onWatch={() => open(prompt)} onLater={later} />}
      {story?.payload && <RecapStory payload={story.payload} onClose={() => setStory(null)} onAction={onAction} />}
    </Ctx.Provider>
  );
}

/** (a) "Your week is ready" — Watch / Later. Backdrop and Escape count as Later. */
function RecapPrompt({ row, onWatch, onLater }: { row: RecapRow; onWatch: () => void; onLater: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onLater(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [onLater]);
  return (
    <div className="fixed inset-0 z-[75] flex items-end md:items-center md:p-6 justify-center bg-on-background/45" onClick={onLater}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recap-prompt-title"
        className="onit-sheet-in w-full max-w-lg rounded-t-card md:rounded-card bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 shadow-card-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <RecapMark size={76} ring />
          <div className="mt-4 text-label-lg font-semibold uppercase tracking-widest text-on-surface-variant">{rowLabel(row)}</div>
          <h2 id="recap-prompt-title" className="mt-1 font-display text-headline-mobile font-extrabold text-on-background">{readyTitle(row)}</h2>
          <p className="mt-1 text-body-md text-on-surface-variant">A quick look at how you did.</p>
        </div>
        <div className="mt-6 space-y-2">
          <button className="btn-primary w-full" onClick={onWatch}>
            <Icon name="play_arrow" size={22} filled /> Watch
          </button>
          <button className="btn-outline w-full text-primary" onClick={onLater}>Later</button>
        </div>
      </div>
    </div>
  );
}
