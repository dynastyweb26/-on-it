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
import RecapSheet from '@/components/RecapSheet';
import { createClient } from '@/lib/supabase/client';

// Secondary routes (not primary tabs) get a Back button to their parent.
function getParentRoute(path: string): string | null {
  if (path.startsWith('/invoices/') && path !== '/invoices') return '/invoices';
  if (path === '/expenses') return '/dashboard';
  if (path === '/summary') return '/dashboard';
  if (path === '/vault') return '/settings';
  return null;
}

// 4 tabs. The Vault page still exists at /vault (archived PDFs surface on
// each invoice's detail page) but is no longer in primary navigation.
// Icons: Design Standard §4 canonical assignments.
const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: '/chat', label: 'Chat', icon: 'mic' },
  { href: '/invoices', label: 'Invoices', icon: 'description' },
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
  const [enterDir, setEnterDir] = useState<'onit-from-right' | 'onit-from-left' | null>(null);
  useIsoLayoutEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = tabIdx;
    if (prev === -1 || tabIdx === -1 || prev === tabIdx) return;
    setEnterDir(tabIdx > prev ? 'onit-from-right' : 'onit-from-left');
    const t = setTimeout(() => setEnterDir(null), 320);
    return () => clearTimeout(t);
  }, [tabIdx]);
  const navRef = useRef<HTMLElement>(null);
  const tabLinkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number; animate: boolean } | null>(null);
  useIsoLayoutEffect(() => {
    function measure(animate: boolean) {
      const nav = navRef.current;
      const el = tabIdx >= 0 ? tabLinkRefs.current[tabIdx] : null;
      if (!nav || !el) { setPill(null); return; }
      const n = nav.getBoundingClientRect();
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
    if (next < 0 || next >= TABS.length) return; // no wrap-around past Chat or Settings
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
    <div data-app-shell="" className="mx-auto flex h-dvh max-w-lg flex-col">
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
      {/* Weekly / monthly recap: once per app open, never over the walkthrough. */}
      <RecapSheet suppressed={showFirstRun || showReference} />
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
          or when install isn't possible on this device. */}
      <InstallBanner />
      <nav ref={navRef} className="glass-nav relative flex justify-around border-t border-outline-variant/40 px-2 pb-[calc(env(safe-area-inset-bottom)_+_6px)]">
        {/* The gliding gold pill; until it has measured, the active tab paints its own. */}
        {pill && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 rounded-full bg-primary-container"
            style={{
              width: pill.w,
              height: pill.h,
              transform: `translate(${pill.x}px, ${pill.y}px)`,
              transition: pill.animate ? 'transform 300ms var(--ease-emphasized), width 300ms var(--ease-emphasized)' : 'none',
            }}
          />
        )}
        {TABS.map(({ href, label, icon }, i) => {
          const active = path.startsWith(href);
          return (
            <Link key={href} href={href} ref={(el) => { tabLinkRefs.current[i] = el; }}
              className={`relative my-1.5 flex min-h-touch flex-col items-center justify-center gap-0.5 rounded-full px-4 text-[12px] font-semibold tracking-wide transition-all active:scale-90
                ${active ? `${pill ? '' : 'bg-primary-container '}text-on-primary-container` : 'text-on-surface-variant'}`}>
              <Icon name={icon} size={24} filled={active} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
