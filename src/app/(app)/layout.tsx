'use client';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import CoachMarks from '@/components/tutorial/CoachMarks';
import { TOURS } from '@/components/tutorial/coach-marks';
import TourPicker from '@/components/tutorial/TourPicker';
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
  if (path === '/dashboard/recurring') return '/dashboard'; // New / Edit carry their own Cancel
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
  // M2 (2·13): a saved client / item lands on a tab — bump + "+1".
  const [bump, setBump] = useState<{ href: string; n: number } | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const onBump = (e: Event) => {
      const href = (e as CustomEvent<{ href?: string }>).detail?.href;
      if (!href) return;
      clearTimeout(t);
      setBump((b) => ({ href, n: (b?.n ?? 0) + 1 }));
      t = setTimeout(() => setBump(null), 1000);
    };
    window.addEventListener('onit-tab-bump', onBump);
    return () => { window.removeEventListener('onit-tab-bump', onBump); clearTimeout(t); };
  }, []);
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
  // The coach-marks tour that is running (a TOURS key), or null. Tours are
  // on-demand only — nothing here starts one by itself.
  const [coachTab, setCoachTab] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      void syncTimezone(supabase, user.id).catch(() => { /* best-effort */ });
    })();
  }, []);

  const closeCoachMarks = useCallback(() => setCoachTab(null), []);

  // Tab picker → go to that tab, wait for its first target, run its tour.
  // pendingTour holds the pick across the navigation; a newer pick or any
  // other navigation simply replaces / abandons it.
  const pendingTour = useRef<string | null>(null);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runWhenMounted = useCallback((tab: string) => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
    const selector = TOURS[tab].steps[0].selector;
    const started = Date.now();
    const tick = () => {
      if (window.location.pathname !== tab) return; // navigated elsewhere — drop it
      const ready = Array.from(document.querySelectorAll(selector))
        .some((el) => el.getClientRects().length > 0);
      // Start anyway after 4s: the overlay keeps looking for the target.
      if (ready || Date.now() - started > 4000) setCoachTab(tab);
      else waitTimer.current = setTimeout(tick, 80);
    };
    tick();
  }, []);
  function startTour(tab: string) {
    setCoachTab(null);
    if (path === tab) { pendingTour.current = null; runWhenMounted(tab); return; }
    pendingTour.current = tab;
    router.push(tab);
  }
  useEffect(() => {
    const tab = pendingTour.current;
    if (!tab) return;
    if (path === tab) { pendingTour.current = null; runWhenMounted(tab); }
  }, [path, runWhenMounted]);
  useEffect(() => () => { if (waitTimer.current) clearTimeout(waitTimer.current); }, []);

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
    <div data-app-shell="" data-kb-fit="" className="flex h-dvh w-full flex-col md:flex-row">
      {/* Weekly / monthly recaps (Watch/Later sheet, story player, Books dot):
          the sheet waits while the walkthrough or the reference is open. */}
      <RecapProvider suppressed={coachTab !== null}>

      {/* Desktop/Tablet Sidebar (Option A) */}
      <aside className="hidden md:flex w-64 lg:w-72 shrink-0 flex-col border-r border-outline-variant/60 bg-surface-container-low px-5 py-6">
        <div className="flex items-center justify-between pb-8 pt-1 px-1">
          <span className="font-display text-2xl font-extrabold tracking-tight">
            On It<span className="text-primary">.</span>
          </span>
          <TourPicker
            align="left"
            onPick={startTour}
            buttonClassName="inline-flex h-9 items-center rounded-button bg-primary-container px-3 text-xs font-semibold text-on-background transition active:scale-95"
          >
            How it works
          </TourPicker>
        </div>

        <nav data-coach="side-nav" className="flex flex-col gap-2.5">
          {TABS.map(({ href, label, icon }) => {
            const active = path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3.5 rounded-2xl px-4 py-3.5 transition-colors ${
                  active
                    ? 'bg-primary-container font-bold text-on-background shadow-sm'
                    : 'font-semibold text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <Icon name={icon} size={24} filled={active} />
                  {href === '/dashboard' && <BooksDot />}
                </div>
                <span className="text-base">{label}</span>
                {bump?.href === href && (
                  <span className="ml-auto rounded-full bg-primary-container px-2 py-0.5 text-xs font-bold text-on-background">
                    +1
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-6">
          <InstallBanner />
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0 h-full">
        {(parentRoute || path.startsWith('/chat')) ? (
          <header className="flex items-center justify-between border-b border-outline-variant/60 px-4 py-3 md:px-6">
            <div className="flex items-center gap-2">
              {parentRoute && <BackButton parentHref={parentRoute} />}
              <span className="font-display text-xl font-extrabold md:hidden">
                On It<span className="text-primary">.</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
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
              <div className="md:hidden">
                <TourPicker
                  onPick={startTour}
                  buttonClassName="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-button bg-primary-container px-4 text-label-lg font-semibold text-on-background transition active:scale-95"
                >
                  How On It works
                </TourPicker>
              </div>
            </div>
          </header>
        ) : (
          <header className="flex items-center justify-between border-b border-outline-variant/60 px-4 py-3 md:hidden">
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-extrabold">
                On It<span className="text-primary">.</span>
              </span>
            </div>
            <TourPicker
              onPick={startTour}
              buttonClassName="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-button bg-primary-container px-4 text-label-lg font-semibold text-on-background transition active:scale-95"
            >
              How On It works
            </TourPicker>
          </header>
        )}

        {coachTab && <CoachMarks key={coachTab} tab={coachTab} currentPath={path} onDone={closeCoachMarks} />}

        <main
          className={`min-h-0 flex-1 ${path.startsWith('/chat') ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}${enterDir ? ` ${enterDir}` : ''}`}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}
        >
          {children}
        </main>

        <div className="md:hidden">
          <InstallBanner />
        </div>

        {/* Bottom tab bar for Mobile viewports */}
        <nav ref={navRef} data-kb-hide="" data-coach="tab-bar" className="glass-nav relative flex justify-around border-t border-outline-variant/40 px-1 pb-[calc(env(safe-area-inset-bottom)_+_4px)] pt-[7px] md:hidden">
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
                <span ref={(el) => { tabLinkRefs.current[i] = el; }} data-tab-target={href}
                  className={`relative grid place-items-center rounded-[18px]
                    ${centre ? '-mt-1 h-9 w-16' : 'h-8 w-[58px]'}
                    ${active ? (pill ? '' : 'bg-primary-container') : centre ? 'bg-primary-soft' : ''}`}>
                  <span key={bump?.href === href ? `bump-${bump.n}` : 'icon'}
                    className={`relative grid place-items-center${bounceIdx === i ? ' onit-tab-bounce' : ''}${bump?.href === href ? ' onit-tab-bump' : ''}`}>
                    <Icon name={icon} size={centre ? 27 : 24} filled={active} />
                  </span>
                  {bump?.href === href && (
                    <span key={`plus-${bump.n}`} aria-hidden
                      className="onit-plus-one pointer-events-none absolute -top-3 right-1 rounded-full bg-primary-container px-1.5 text-[11px] font-bold leading-[16px] text-on-background">
                      +1
                    </span>
                  )}
                  {href === '/dashboard' && <BooksDot />}
                </span>
                <span className={`text-[11.5px] leading-none tracking-[.01em] ${active ? 'font-bold text-on-background' : 'font-medium text-on-surface-variant'}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
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
