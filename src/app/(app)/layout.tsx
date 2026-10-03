'use client';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import FirstRunTutorial from '@/components/tutorial/FirstRunTutorial';
import TutorialReference from '@/components/tutorial/TutorialReference';
import { markTutorialSeen, shouldAutoShowTutorial } from '@/components/tutorial/persistence';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import BackButton from '@/components/BackButton';
import InstallBanner from '@/components/InstallBanner';
import RecapProvider, { useRecaps } from '@/components/recap/RecapProvider';
import { createClient } from '@/lib/supabase/client';

// Secondary routes (not primary tabs) get a Back button to their parent.
function getParentRoute(path: string): string | null {
  if (path.startsWith('/invoices/') && path !== '/invoices') return '/invoices';
  // A client's detail page backs to the list; New / Edit carry their own Cancel.
  if (/^\/clients\/[^/]+$/.test(path) && path !== '/clients/new') return '/clients';
  if (path === '/expenses') return '/dashboard';
  if (path === '/summary') return '/dashboard';
  if (path === '/recaps') return '/dashboard';
  if (path === '/vault') return '/settings';
  if (path.startsWith('/settings/')) return '/settings';
  return null;
}

// 5 tabs (UI redesign, M5): Clients · Invoices · Chat (centre, raised) ·
// Books · Settings. Chat stays the default landing. The Vault page still
// exists at /vault (archived PDFs surface on each invoice's detail page) but
// is not in primary navigation. Icons: Design Standard §4 (+ group, chat_bubble).
const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: '/clients', label: 'Clients', icon: 'group' },
  { href: '/invoices', label: 'Invoices', icon: 'description' },
  { href: '/chat', label: 'Chat', icon: 'chat_bubble' },
  { href: '/dashboard', label: 'Books', icon: 'payments' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

// A tab swipe needs this much horizontal travel AND must be clearly
// horizontal (|dx| > 1.5 × |dy|); anything else is left to scrolling.
const SWIPE_MIN_DX = 70;
const SWIPE_RATIO = 1.5;
// A navigation that never lands (no pathname change) stops blocking swipes
// after this long, checked at the next touchstart — no timers.
const NAV_GUARD_MS = 3000;

function tabIndexOf(pathname: string): number {
  return TABS.findIndex(({ href }) => pathname.startsWith(href));
}

// Where a gesture must NOT switch tabs: text entry, anything opting out via
// data-no-tab-swipe="true" (a SwipeableRow's swipe-to-delete, the chat
// invoice card), horizontal scrollers, and sheets/modals (fixed layers).
function swipeBlockedAt(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest('input, textarea, select, [contenteditable="true"], [data-no-tab-swipe="true"]')) return true;
  let el: Element | null = target;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    if (style.position === 'fixed') return true;
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return true;
    el = el.parentElement;
  }
  return false;
}

// Layout effect in the browser (before paint, so tab motion never flashes the
// resting frame); plain effect during SSR, where React 18 warns on it.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Save this device's IANA timezone (e.g. America/Chicago) on the profile, so
// server jobs can reason in the owner's local time: draft-nudge quiet hours and
// the reminder cron's "today". Only writes when it changed (travel, a new
// phone). Same shape as the profiles_timezone_chk constraint, so a value the DB
// would reject is never sent. timezone is a safe column (column-level UPDATE,
// 20260930000004). Best-effort: a failure changes nothing.
const TZ_RE = /^[A-Za-z0-9_+/-]{1,64}$/;
async function syncTimezone(supabase: ReturnType<typeof createClient>, userId: string) {
  let tz: string | undefined;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return; }
  if (!tz || !TZ_RE.test(tz)) return;
  const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).maybeSingle();
  if (!data || data.timezone === tz) return; // not onboarded yet, or unchanged
  await supabase.from('profiles').update({ timezone: tz }).eq('id', userId);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  // Tab motion (MOTION-SPEC §10). Moving between two tabs slides the new screen
  // in from the side you're heading (class cleared after it plays), and the gold
  // pill glides to the new tab instead of jumping. Secondary routes (index -1)
  // get neither. Reduced motion: the global rule stops both.
  const tabIdx = tabIndexOf(path);
  const prevTabRef = useRef(tabIdx);
  // M5 (release frames / motion file): the new screen crossfades in 160ms,
  // and the newly active tab's icon does a 4px bounce.
  const [enterDir, setEnterDir] = useState<'onit-tab-enter' | null>(null);
  const [bounceIdx, setBounceIdx] = useState(-1);
  useIsoLayoutEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = tabIdx;
    if (prev === -1 || tabIdx === -1 || prev === tabIdx) return;
    setEnterDir('onit-tab-enter');
    setBounceIdx(tabIdx);
    const t = setTimeout(() => { setEnterDir(null); setBounceIdx(-1); }, 420);
    return () => clearTimeout(t);
  }, [tabIdx]);
  const navRef = useRef<HTMLElement>(null);
  // The disc sits behind each tab's icon pill (not the whole tab).
  const tabLinkRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number; animate: boolean } | null>(null);
  useIsoLayoutEffect(() => {
    function measure(animate: boolean) {
      const nav = navRef.current;
      const el = tabIdx >= 0 ? tabLinkRefs.current[tabIdx] : null;
      if (!nav || !el) { setPill(null); return; }
      const n = nav.getBoundingClientRect();
      // Hidden while the keyboard is open (data-kb-hide): keep the last spot.
      if (!n.width) return;
      const r = el.getBoundingClientRect();
      setPill((p) => ({ x: r.left - n.left, y: r.top - n.top, w: r.width, h: r.height, animate: animate && p !== null }));
    }
    measure(true);
    const onResize = () => measure(false);
    window.addEventListener('resize', onResize);
    // Tab widths follow the label font; re-place once it has loaded.
    void document.fonts?.ready.then(() => measure(false));
    return () => window.removeEventListener('resize', onResize);
  }, [tabIdx]);
  // Instagram-style horizontal swipe between tabs. Touch only, one finger,
  // decided once on touchend; vertical scrolling always wins once the gesture
  // turns more vertical than horizontal. `from` is the tab the gesture STARTED
  // on, read from the live URL at touchstart (never a render-time closure).
  const gesture = useRef<{ id: number; x: number; y: number; from: number; vertical: boolean } | null>(null);
  // A swipe's navigation is in flight until the pathname changes; new swipes
  // are ignored meanwhile so one gesture can never chain into two tabs.
  const navigating = useRef<number | null>(null); // start time, or null
  useEffect(() => { navigating.current = null; }, [path]);
  // Two independent surfaces (do not merge — see closeReference):
  //   showFirstRun  — the gated 4-slide first-run carousel (auto-show once).
  //   showReference — the always-available "How On It works" reference doc.
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [showReference, setShowReference] = useState(false);
  // The signed-in user, so the walkthrough's last-seen version is stored
  // per-user. Null until resolved (or a guest — guests get no auto-show).
  const [userId, setUserId] = useState<string | null>(null);

  // Auto-show once when an ONBOARDED user is behind the current walkthrough
  // version. Two explicit gates, so it can never surface at the wrong moment:
  //   1. A real session — guests get nothing.
  //   2. A profile row exists — this is the onboarding-completion signal
  //      (onboarding's finish() is the only thing that creates it). Without it
  //      we don't infer "onboarded" from the mere absence of a stored version,
  //      which is true from the instant an account is created. A brand-new,
  //      pre-onboarding user who lands on an (app) screen (e.g. /chat via '/')
  //      is redirected to /onboarding by the page itself, and this gate keeps
  //      the carousel from flashing in that window.
  // Login and onboarding live OUTSIDE this route group, so this layout never
  // mounts over them at all.
  // A fresh account, once onboarded, has seen version 0 (< current) → the
  // carousel opens on the first app screen; a version bump re-shows it once.
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // guest — nothing to auto-show against
      setUserId(user.id);
      void syncTimezone(supabase, user.id).catch(() => { /* best-effort */ });
      if (!shouldAutoShowTutorial(user.id)) return; // already seen this version
      const { data: profile } = await supabase
        .from('profiles').select('id').eq('id', user.id).maybeSingle();
      if (profile) setShowFirstRun(true); // onboarded + behind → show
    })();
  }, []);

  // Closing the first-run carousel records the seen-version so it never
  // auto-shows again (until TUTORIAL_VERSION is bumped).
  function closeFirstRun() {
    if (userId) markTutorialSeen(userId);
    setShowFirstRun(false);
  }

  // The reference doc deliberately does NOT call markTutorialSeen(). It is
  // always available from the header pill, including for a guest with no
  // session. Marking seen here would push getSeenVersion() up to the current
  // version for a brand-new user who only tapped the pill, silently suppressing
  // the first-run carousel they never actually saw. Only closeFirstRun marks
  // seen — keep these two paths separate.
  // Settings › Help & feedback opens these two from inside a screen.
  useEffect(() => {
    const openReference = () => setShowReference(true);
    const replayWalkthrough = () => setShowFirstRun(true);
    window.addEventListener('onit-open-reference', openReference);
    window.addEventListener('onit-replay-walkthrough', replayWalkthrough);
    return () => {
      window.removeEventListener('onit-open-reference', openReference);
      window.removeEventListener('onit-replay-walkthrough', replayWalkthrough);
    };
  }, []);

  function closeReference() {
    setShowReference(false);
  }

  function onTouchStart(e: React.TouchEvent) {
    gesture.current = null;
    if (navigating.current !== null && Date.now() - navigating.current < NAV_GUARD_MS) return;
    navigating.current = null;
    if (e.touches.length !== 1) return; // multi-touch is never a tab swipe
    const from = tabIndexOf(window.location.pathname);
    if (from === -1 || swipeBlockedAt(e.target)) return;
    const t = e.touches[0];
    gesture.current = { id: t.identifier, x: t.clientX, y: t.clientY, from, vertical: false };
  }
  function onTouchMove(e: React.TouchEvent) {
    const g = gesture.current;
    if (!g || g.vertical) return;
    if (e.touches.length !== 1) { gesture.current = null; return; }
    const t = Array.from(e.touches).find((p) => p.identifier === g.id);
    if (!t) return;
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) g.vertical = true; // scroll — never hijack it
  }
  // The ONLY place a swipe navigates: once, at the end of the gesture.
  function onTouchEnd(e: React.TouchEvent) {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.vertical || navigating.current !== null) return;
    const t = Array.from(e.changedTouches).find((p) => p.identifier === g.id);
    if (!t) return;
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (Math.abs(dx) < SWIPE_MIN_DX || Math.abs(dx) <= SWIPE_RATIO * Math.abs(dy)) return;
    const next = g.from + (dx < 0 ? 1 : -1);
    if (next < 0 || next >= TABS.length) return; // no wrap-around past Clients or Settings
    // The tab under the gesture must still be current (nothing navigated mid-gesture).
    if (tabIndexOf(window.location.pathname) !== g.from) return;
    navigating.current = Date.now();
    router.push(TABS[next].href);
  }
  function onTouchCancel() {
    gesture.current = null; // iOS took the gesture (e.g. native scroll)
  }

  const parentRoute = getParentRoute(path);

  return (
    // data-app-shell: locks document scroll while the shell is mounted (globals.css).
    // data-kb-fit: while the keyboard is open the shell is pinned to the visible
    // area (lib/keyboard.ts), so the chat composer sits right on the keyboard
    // and every tab's scroller ends where the keyboard starts.
    <div data-app-shell="" data-kb-fit="" className="mx-auto flex h-dvh max-w-lg flex-col">
      {/* Weekly / monthly recaps (Watch/Later sheet, story player, Books dot):
          the sheet waits while the walkthrough or the reference is open. */}
      <RecapProvider suppressed={showFirstRun || showReference}>
      <header className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
        <div className="flex items-center gap-1">
          {parentRoute && <BackButton parentHref={parentRoute} />}
          <span className="font-display text-xl font-extrabold">
            On It<span className="text-primary">.</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          {path.startsWith('/chat') && (
            <>
              <button
                aria-label="New chat"
                className="grid h-touch w-touch place-items-center rounded-full text-on-surface-variant transition-transform active:scale-95"
                onClick={() => window.dispatchEvent(new Event('onit-new-chat'))}
              >
                <Icon name="edit_square" size={24} />
              </button>
              <button
                aria-label="Recent conversations"
                className="grid h-touch w-touch place-items-center rounded-full text-on-surface-variant transition-transform active:scale-95"
                onClick={() => window.dispatchEvent(new Event('onit-history'))}
              >
                <Icon name="history" size={24} />
              </button>
            </>
          )}
          {/* Labeled gold capsule (matches the install banner's "Show how"):
              gold FILL + dark on-gold text — never white on this gold (fails
              contrast). Label carries the meaning, so no "?" glyph. */}
          <button
            aria-label="How On It works"
            className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-button bg-primary-container px-4 text-label-lg font-semibold text-on-background transition active:scale-95"
            onClick={() => setShowReference(true)}
          >
            How On It works
          </button>
        </div>
      </header>
      {showFirstRun && <FirstRunTutorial onClose={closeFirstRun} />}
      {/* Reference doc — tabbed, always available from the pill. Never gated,
          never marks seen (see closeReference). */}
      {showReference && <TutorialReference onClose={closeReference} />}
      {/* One scroll owner per screen. Chat owns its scrolling (the message list
          between the header and the composer), so here main must NOT also be a
          scroller: nested scroll containers let iOS hand a gesture to the
          wrong one (the reversal "freeze"). Every other tab scrolls main. */}
      <main
        className={`min-h-0 flex-1 ${path.startsWith('/chat') ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}${enterDir ? ` ${enterDir}` : ''}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        {children}
      </main>
      {/* Slim install strip: in-flow above the tab bar (never fixed), so it can't
          cover the tab bar or the chat input. Self-hides when installed/dismissed
          or when install isn't possible on this device. Both step aside while
          the keyboard is open (data-kb-hide), leaving the room to the field. */}
      <InstallBanner />
      {/* Tab bar (release frames 0a, M5): each tab is an icon pill with the
          label under it. Pills 58×32; Chat is the raised centre pill (64×36,
          4px up) and keeps a soft gold fill at rest. The gold disc slides to
          the active pill on the spring token. */}
      <nav ref={navRef} data-kb-hide="" className="glass-nav relative flex justify-around border-t border-outline-variant/40 px-1 pb-[calc(env(safe-area-inset-bottom)_+_4px)] pt-[7px]">
        {pill && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 rounded-[18px] bg-primary-container"
            style={{
              width: pill.w,
              height: pill.h,
              transform: `translate(${pill.x}px, ${pill.y}px)`,
              transition: pill.animate ? 'transform var(--motion-slow) var(--ease-spring), width var(--motion-slow) var(--ease-spring), height var(--motion-slow) var(--ease-spring)' : 'none',
            }}
          />
        )}
        {TABS.map(({ href, label, icon }, i) => {
          const active = path.startsWith(href);
          const centre = href === '/chat';
          return (
            <Link key={href} href={href}
              aria-current={active ? 'page' : undefined}
              onClick={() => { if (!active) { try { navigator.vibrate?.(8); } catch { /* unsupported */ } } }}
              className={`onit-tab group flex min-w-0 flex-1 flex-col items-center gap-1 pb-1 ${centre ? 'onit-tab-centre' : ''}`}>
              <span ref={(el) => { tabLinkRefs.current[i] = el; }}
                className={`relative grid place-items-center rounded-[18px]
                  ${centre ? '-mt-1 h-9 w-16' : 'h-8 w-[58px]'}
                  ${active ? (pill ? '' : 'bg-primary-container') : centre ? 'bg-primary-soft' : ''}`}>
                <span className={`relative grid place-items-center${bounceIdx === i ? ' onit-tab-bounce' : ''}`}>
                  <Icon name={icon} size={centre ? 27 : 24} filled={active} />
                </span>
                {href === '/dashboard' && <BooksDot />}
              </span>
              <span className={`text-[11.5px] leading-none tracking-[.01em] ${active ? 'font-bold text-on-background' : 'font-medium text-on-surface-variant'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
      </RecapProvider>
    </div>
  );
}

/** (14d) Books tab dot: an unwatched recap from the last 14 days. Red with a
 *  cream ring, top-right of the Books pill (release frames 0a). */
function BooksDot() {
  const { unwatched } = useRecaps();
  if (!unwatched) return null;
  return (
    <>
      <span aria-hidden className="absolute right-[13px] top-0.5 h-[9px] w-[9px] rounded-full border-2 border-background bg-[#c8452c]" />
      <span className="sr-only">, new recap</span>
    </>
  );
}
