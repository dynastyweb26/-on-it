'use client';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import CoachMarks from '@/components/tutorial/CoachMarks';
import { CAMERA_TIP } from '@/components/tutorial/coach-marks';
import type { TutorialTab } from '@/lib/tutorial-seen';
import TourPicker from '@/components/tutorial/TourPicker';
import TutorialHost from '@/components/tutorial/TutorialHost';
import { consumeSignInCookie, markSignInThrob, stopThrob, throbRemaining } from '@/components/tutorial/throb';
import Icon from '@/components/Icon';
import BackButton from '@/components/BackButton';
import InstallBanner from '@/components/InstallBanner';
import SoftPromptBanner from '@/components/SoftPromptBanner';
import ProCelebration from '@/components/ProCelebration';
import RecapProvider, { useRecaps } from '@/components/recap/RecapProvider';
import TabDeck from '@/components/tabs/TabDeck';
import { COMMIT_EASE, COMMIT_MS, SPRING_EASE, takeTabGestureNavigation } from '@/components/tabs/tab-motion';
import { createClient } from '@/lib/supabase/client';
import { CAMERA_TUTORIAL_TARGET, canAutoStartCameraTutorial } from '@/lib/camera-tutorial';
import { ENABLE_CAMERA_ANIMATION } from '@/lib/feature-flags';
import { noteUpgradeReturn } from '@/lib/upgrade-return';
import { getSharedUser } from '@/lib/auth-client';
import { reducedMotion } from '@/lib/list-motion';
import { NAV_GUARD_MS, pillCentreAt, pillStretch } from '@/lib/swipe';
import { swipeBlockedAt } from '@/lib/swipe-dom';
import { TABS, exactTabIndex, tabIndexOf } from '@/lib/tabs';

// Mobile header row, shared by every tab: 65px total = 64px content + the
// 1px border, so swiping can't change the height. md keeps the old auto row.
const HEADER_CLASS =
  'flex h-[65px] items-center justify-between border-b border-outline-variant/60 px-4 py-0 md:h-auto md:px-6 md:py-3';
// Chat actions: 40px visual box inside the 64px row, with an ::after hit area
// that keeps the 56x56 touch target. Desktop restores the original 56px box.
const HEADER_ICON_CLASS =
  "relative grid h-10 w-14 place-items-center rounded-full text-on-surface-variant transition-transform active:scale-95 after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] md:h-touch";

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
  if (path === '/settings/help/feedback') return '/settings/help';
  // Business profile's two screens back to the Business profile menu.
  if (path === '/settings/business-info' || path === '/settings/business-brand') return '/settings/business';
  if (path.startsWith('/settings/')) return '/settings';
  return null;
}

// 5 tabs (UI redesign, M5): Clients · Invoices · Chat (centre, raised) ·
// Books · Settings. Chat stays the default landing. The Vault page still
// exists at /vault (archived PDFs surface on each invoice's detail page) but
// is not in primary navigation. Icons: Design Standard §4 (+ group, chat_bubble).

// A tab swipe needs this much horizontal travel AND must be clearly
// horizontal (|dx| > 1.5 × |dy|); anything else is left to scrolling.
// A nested-route swipe keeps the old (pre-deck) threshold: this path is only
// used off the exact tab roots, where the deck does not own the gesture.
const SWIPE_MIN_DX = 70;
const SWIPE_RATIO = 1.5;
// A navigation that never lands (no pathname change) stops blocking swipes
// after this long, checked at the next touchstart — no timers.

// Layout effect in the browser (before paint, so tab motion never flashes the
// resting frame); plain effect during SSR, where React 18 warns on it.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type PillRect = { x: number; y: number; w: number; h: number };

function pillTransition(durationMs: number, easing: string): string {
  return `transform ${durationMs}ms ${easing}, width ${durationMs}ms ${easing}, height ${durationMs}ms ${easing}`;
}

// Save this device's IANA timezone (e.g. America/Chicago) on the profile, so
// server jobs can reason in the owner's local time: draft-nudge quiet hours and
// the reminder cron's "today". Only writes when it changed (travel, a new
// phone). Same shape as the profiles_timezone_chk constraint, so a value the DB
// would reject is never sent. timezone is a safe column (column-level UPDATE,
// 20260930000004). Best-effort: a failure changes nothing.
const TZ_RE = /^[A-Za-z0-9_+/-]{1,64}$/;

// Anything that owns the screen while it is open. The first-sign-in camera tip
// waits for these to close instead of starting underneath them. Menus count:
// a modal spotlight over an open "+" menu or row menu is still a hijack.
const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"]';
function isVisible(selector: string): boolean {
  return Array.from(document.querySelectorAll(selector)).some((el) => el.getClientRects().length > 0);
}

async function syncTimezone(supabase: ReturnType<typeof createClient>, userId: string) {
  let tz: string | undefined;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return; }
  if (!tz || !TZ_RE.test(tz)) return;
  const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).maybeSingle();
  if (!data || data.timezone === tz) return; // not onboarded yet, or unchanged
  await supabase.from('profiles').update({ timezone: tz }).eq('id', userId);
}

export default function AppShell({
  children,
  connectEnabled = false,
}: {
  children: React.ReactNode;
  connectEnabled?: boolean;
}) {
  // The deck will pass this to the Settings tab; the split exists so the value
  // is known on the server's first paint instead of flashing "Coming soon".
  const path = usePathname();
  const router = useRouter();
  const exactTab = exactTabIndex(path);
  // Tab motion (MOTION-SPEC §10). Moving between two tabs slides the new screen
  // in from the side you're heading (class cleared after it plays), and the gold
  // pill glides to the new tab instead of jumping. Secondary routes (index -1)
  // get neither. Reduced motion: the global rule stops both.
  const tabIdx = exactTab >= 0 ? exactTab : tabIndexOf(path);
  const prevTabRef = useRef(tabIdx);
  // M5 (release frames / motion file): the new screen crossfades in 160ms,
  // and the newly active tab's icon does a 4px bounce.
  const [enterDir, setEnterDir] = useState<'onit-tab-enter' | null>(null);
  const [bounceIdx, setBounceIdx] = useState(-1);
  // M2 (2·13): a saved client / item lands on a tab — bump + "+1".
  const [bump, setBump] = useState<{ href: string; n: number } | null>(null);
  // The in-app walkthrough is a full-screen layer owned by TutorialHost. The
  // recap prompt must never open over it (same rule the old tour had).
  const [tutorialOpen, setTutorialOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setTutorialOpen(true);
    const onClose = () => setTutorialOpen(false);
    window.addEventListener('onit:tutorial-open', onOpen);
    window.addEventListener('onit:tutorial-close', onClose);
    return () => {
      window.removeEventListener('onit:tutorial-open', onOpen);
      window.removeEventListener('onit:tutorial-close', onClose);
    };
  }, []);
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
    // A drag commit already carries its own motion; the old bounce would fight
    // it. Tab taps (Link) still get the icon bounce.
    if (takeTabGestureNavigation()) return;
    setEnterDir('onit-tab-enter');
    setBounceIdx(tabIdx);
    const t = setTimeout(() => { setEnterDir(null); setBounceIdx(-1); }, 420);
    return () => clearTimeout(t);
  }, [tabIdx]);
  const navRef = useRef<HTMLElement>(null);
  // The disc sits behind each tab's icon pill (not the whole tab).
  const tabLinkRefs = useRef<(HTMLSpanElement | null)[]>([]);
  // The pill is placed imperatively: during a drag it must move every frame
  // without React state, and its geometry must stay byte-identical at rest.
  const pillRef = useRef<HTMLSpanElement>(null);
  const [pillReady, setPillReady] = useState(false);
  const pillReadyRef = useRef(false);
  const pillGeomRef = useRef<{
    rects: PillRect[];
    centres: { x: number; y: number }[];
    active: PillRect;
  } | null>(null);
  // A drag already placed the pill at its target with the gesture's own
  // duration; don't let the path effect restart that transition at 340ms.
  const pillCommitRef = useRef<{ target: number; until: number } | null>(null);
  // Font/resize re-measures must never yank the pill out of a live drag.
  const pillDraggingRef = useRef(false);
  const placePill = useCallback((rect: PillRect, transition: string) => {
    const el = pillRef.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.width = `${rect.w}px`;
    el.style.height = `${rect.h}px`;
    el.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0) scaleX(1)`;
    el.style.opacity = '1';
    if (!pillReadyRef.current) {
      pillReadyRef.current = true;
      setPillReady(true);
    }
  }, []);
  const measurePill = useCallback((activeIdx: number, mode: 'settle' | 'none') => {
    if (pillDraggingRef.current) return;
    const nav = navRef.current;
    const el = activeIdx >= 0 ? tabLinkRefs.current[activeIdx] : null;
    if (!nav || !el) {
      if (pillRef.current) pillRef.current.style.opacity = '0';
      return;
    }
    const pending = pillCommitRef.current;
    if (pending) {
      const fresh = Date.now() < pending.until;
      pillCommitRef.current = null;
      if (pending.target === activeIdx && fresh) {
        // The gesture already placed the pill here with its own duration.
        if (pillRef.current) pillRef.current.style.opacity = '1';
        return;
      }
    }
    const n = nav.getBoundingClientRect();
    // Hidden while the keyboard is open (data-kb-hide): keep the last spot.
    if (!n.width) return;
    const r = el.getBoundingClientRect();
    const transition = mode === 'settle' && pillReadyRef.current && !reducedMotion()
      ? pillTransition(COMMIT_MS, COMMIT_EASE)
      : 'none';
    placePill({ x: r.left - n.left, y: r.top - n.top, w: r.width, h: r.height }, transition);
  }, [placePill]);
  useIsoLayoutEffect(() => {
    measurePill(tabIdx, 'settle');
    const onResize = () => measurePill(tabIdx, 'none');
    window.addEventListener('resize', onResize);
    // Tab widths follow the label font; re-place once it has loaded. Keep the
    // commit easing so an already-running tab-tap glide is not cut short.
    void document.fonts?.ready.then(() => measurePill(tabIdx, 'settle'));
    return () => window.removeEventListener('resize', onResize);
  }, [tabIdx, measurePill]);
  // Drag start measures every target once; move writes only the transform.
  const beginPill = useCallback((activeIdx: number) => {
    const nav = navRef.current;
    if (!nav) return;
    const n = nav.getBoundingClientRect();
    if (!n.width) return;
    const rects: PillRect[] = [];
    for (const el of tabLinkRefs.current) {
      if (!el) return;
      const r = el.getBoundingClientRect();
      rects.push({ x: r.left - n.left, y: r.top - n.top, w: r.width, h: r.height });
    }
    const active = rects[activeIdx];
    if (!active) return;
    pillDraggingRef.current = true;
    pillGeomRef.current = {
      rects,
      centres: rects.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })),
      active,
    };
    placePill(active, 'none');
  }, [placePill]);
  const movePill = useCallback((progress: number) => {
    const geom = pillGeomRef.current;
    const el = pillRef.current;
    if (!geom || !el) return;
    const centre = pillCentreAt(progress, geom.centres);
    const x = centre.x - geom.active.w / 2;
    const y = centre.y - geom.active.h / 2;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scaleX(${pillStretch(progress)})`;
  }, []);
  const endPill = useCallback((target: number | null, durationMs: number) => {
    pillDraggingRef.current = false;
    const geom = pillGeomRef.current;
    if (!geom) return;
    pillGeomRef.current = null;
    if (target === null) pillCommitRef.current = null;
    else pillCommitRef.current = { target, until: Date.now() + durationMs + 80 };
    if (reducedMotion() || durationMs <= 0) {
      placePill(target === null ? geom.active : geom.rects[target], 'none');
      return;
    }
    placePill(
      target === null ? geom.active : geom.rects[target],
      target === null
        ? pillTransition(durationMs, SPRING_EASE)
        : pillTransition(durationMs, COMMIT_EASE),
    );
  }, [placePill]);
  // Instagram-style horizontal swipe between tabs. Touch only, one finger,
  // decided once on touchend; vertical scrolling always wins once the gesture
  // turns more vertical than horizontal. `from` is the tab the gesture STARTED
  // on, read from the live URL at touchstart (never a render-time closure).
  const gesture = useRef<{ id: number; x: number; y: number; from: number; vertical: boolean } | null>(null);
  // A swipe's navigation is in flight until the pathname changes; new swipes
  // are ignored meanwhile so one gesture can never chain into two tabs.
  const navigating = useRef<number | null>(null); // start time, or null
  useEffect(() => { navigating.current = null; }, [path]);

  // Back from Stripe Checkout (?upgraded=1) on ANY tab, e.g. /invoices: record
  // it and start the unlock poll. A no-op when a page already handled it.
  useEffect(() => { noteUpgradeReturn(); }, []);
  // First-sign-in camera tip: signed-in only, offered exactly once. `seenAt`
  // stays undefined until the profile answers (or when the DB column is not
  // applied yet), so an unknown account never auto-starts anything.
  const [signedIn, setSignedIn] = useState(false);
  const [cameraSeenAt, setCameraSeenAt] = useState<string | null | undefined>(undefined);
  const [cameraTip, setCameraTip] = useState(false);
  const cameraUserId = useRef<string | null>(null);
  const cameraCheckSeq = useRef(0);
  const checkCameraTutorial = useCallback(async (userId: string | null) => {
    if (!ENABLE_CAMERA_ANIMATION) {
      // Vaulted: do not read the profile, start the timer or render the tip.
      cameraUserId.current = null;
      setCameraSeenAt(undefined);
      setCameraTip(false);
      return;
    }
    const seq = ++cameraCheckSeq.current;
    cameraUserId.current = userId;
    if (!userId) {
      setSignedIn(false);
      setCameraSeenAt(undefined);
      setCameraTip(false);
      return;
    }
    setSignedIn(true);
    setCameraSeenAt(undefined); // unknown until this user's profile answers
    setCameraTip(false);
    try {
      const { data, error } = await createClient()
        .from('profiles')
        .select('camera_tutorial_seen_at')
        .eq('id', userId)
        .maybeSingle();
      if (seq !== cameraCheckSeq.current) return;
      // Missing profile or missing column (migration not applied) = no offer.
      setCameraSeenAt(error || !data ? undefined : data.camera_tutorial_seen_at ?? null);
    } catch {
      if (seq === cameraCheckSeq.current) setCameraSeenAt(undefined);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await getSharedUser();
      if (!user) return;
      void syncTimezone(supabase, user.id).catch(() => { /* best-effort */ });
      void checkCameraTutorial(user.id);
    })();
  }, [checkCameraTutorial]);

  const closeCameraTip = useCallback(() => setCameraTip(false), []);

  // Offer the one-time camera tip only when Chat is actually ready: signed in,
  // never seen, exact /chat, no other coach tour, no dialog/menu, camera button
  // visible. While an overlay or the target resolves, re-check rather than
  // starting underneath it.
  useEffect(() => {
    if (!ENABLE_CAMERA_ANIMATION || cameraTip) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      if (cancelled) return;
      const canStart = canAutoStartCameraTutorial({
        signedIn,
        seenAt: cameraSeenAt,
        path,
        coachOpen: tutorialOpen,
        overlayOpen: isVisible(OVERLAY_SELECTOR),
        targetVisible: isVisible(CAMERA_TUTORIAL_TARGET),
      });
      if (canStart) {
        const stamp = new Date().toISOString();
        setCameraSeenAt(stamp);
        setCameraTip(true);
        const uid = cameraUserId.current;
        if (uid) {
          // Mark it when shown, not when finished: an interrupted tip must not
          // come back on the next visit. Column-level UPDATE only.
          void (async () => {
            try {
              await createClient()
                .from('profiles')
                .update({ camera_tutorial_seen_at: stamp })
                .eq('id', uid)
                .is('camera_tutorial_seen_at', null);
            } catch { /* best-effort; this session still won't repeat it */ }
          })();
        }
        return;
      }
      if (signedIn && cameraSeenAt === null && path === '/chat' && !tutorialOpen) {
        timer = setTimeout(tick, 300);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [cameraSeenAt, cameraTip, path, signedIn, tutorialOpen]);

  // Sign-in throb: the pill glows gold for 10s after a sign-in, once.
  const [throb, setThrob] = useState(false);
  const throbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startThrob = useCallback(() => {
    const ms = throbRemaining();
    if (ms <= 0) return;
    setThrob(true);
    if (throbTimer.current) clearTimeout(throbTimer.current);
    throbTimer.current = setTimeout(() => { setThrob(false); stopThrob(); }, ms);
  }, []);
  const endThrob = useCallback(() => {
    if (throbTimer.current) clearTimeout(throbTimer.current);
    setThrob(false);
    stopThrob();
  }, []);
  useEffect(() => {
    consumeSignInCookie(); // signed in via the email-confirmation link
    startThrob();
    // A client-side sign-in while the app is open. auth-js also re-emits
    // SIGNED_IN for an EXISTING session (tab refocus, cross-tab sync), so only
    // a change of user after INITIAL_SESSION counts as a new sign-in.
    const supabase = createClient();
    let known: string | null | undefined; // undefined until INITIAL_SESSION
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user.id ?? null;
      if (event === 'INITIAL_SESSION') { known = uid; return; }
      if (event === 'SIGNED_OUT') {
        known = null;
        void checkCameraTutorial(null);
        return;
      }
      if (event === 'SIGNED_IN' && known !== undefined && uid && uid !== known) {
        markSignInThrob();
        startThrob();
        void checkCameraTutorial(uid);
      }
      if (uid) known = uid;
    });
    return () => {
      subscription.unsubscribe();
      if (throbTimer.current) clearTimeout(throbTimer.current);
    };
  }, [startThrob, checkCameraTutorial]);
  const throbClass = throb ? ' onit-help-throb' : '';

  // Picker pick: the host plays that tutorial in the overlay. The player never
  // navigates; it plays over whatever tab you are on.
  const playTutorial = useCallback((tab: TutorialTab) => {
    window.dispatchEvent(new CustomEvent('onit:tutorial-play', { detail: tab }));
  }, []);

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
      <RecapProvider suppressed={cameraTip || tutorialOpen}>

      {/* Tablet / desktop sidebar. md (768-1023, iPad portrait): an 80px icon
          rail so the content keeps ~690px. lg (1024+): the full 288px sidebar
          with labels. Phones have the bottom tab bar instead. */}
      <aside className="hidden md:flex w-20 lg:w-72 shrink-0 flex-col border-r border-outline-variant/60 bg-surface-container-low px-3 py-6 lg:px-5 xl:border-outline-variant/35 xl:px-5 xl:pb-5 xl:pt-7">
        <div className="flex flex-col items-center gap-3 pb-6 pt-1 lg:flex-row lg:justify-between lg:gap-0 lg:px-1 lg:pb-8 xl:pb-7">
          <span className="font-display text-2xl font-extrabold tracking-tight xl:text-[26px] xl:tracking-[-0.01em]">
            On<span className="hidden lg:inline"> It</span><span className="text-primary">.</span>
          </span>
          <TourPicker
            align="left"
            onPick={playTutorial}
            onButtonPress={endThrob}
            buttonClassName={`inline-flex h-10 w-10 items-center justify-center rounded-button bg-primary-container text-on-background transition active:scale-95 lg:h-9 lg:w-auto lg:px-3 lg:text-xs lg:font-semibold xl:gap-1.5 xl:px-3.5 xl:text-[13.5px]${throbClass}`}
          >
            <Icon name="help" size={22} className="lg:hidden" />
            <span className="sr-only lg:not-sr-only">How it works</span>
            {/* The dropdown affordance the design shows beside the label. */}
            <Icon name="expand_more" size={18} className="hidden xl:inline" />
          </TourPicker>
        </div>

        <nav data-coach="side-nav" className="flex flex-col gap-2.5 xl:gap-1">
          {TABS.map(({ href, label, icon }) => {
            const active = path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                title={label}
                className={`relative flex items-center justify-center gap-3.5 rounded-2xl px-0 py-3.5 transition-colors lg:justify-start lg:px-4 xl:h-12 xl:gap-3.5 xl:py-0 ${
                  active
                    ? 'bg-primary-container font-bold text-on-background shadow-sm'
                    : 'font-semibold text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <div className="relative grid h-6 w-6 place-items-center">
                  <Icon name={icon} size={24} filled={active} />
                  {href === '/dashboard' && <BooksDot variant="side" />}
                </div>
                <span className="hidden text-base lg:inline">{label}</span>
                {bump?.href === href && (
                  <span className="absolute right-1 top-1 rounded-full bg-primary-container px-2 py-0.5 text-xs font-bold text-on-background lg:static lg:ml-auto">
                    +1
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-6">
          <InstallBanner variant="sidebar" />
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0 h-full">
        {(parentRoute || path.startsWith('/chat')) ? (
          <header className={HEADER_CLASS}>
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
                    className={HEADER_ICON_CLASS}
                    onClick={() => window.dispatchEvent(new Event('onit-new-chat'))}
                  >
                    <Icon name="edit_square" size={24} />
                  </button>
                  <button
                    aria-label="Recent conversations"
                    className={HEADER_ICON_CLASS}
                    onClick={() => window.dispatchEvent(new Event('onit-history'))}
                  >
                    <Icon name="history" size={24} />
                  </button>
                </>
              )}
              <div className="md:hidden">
                <TourPicker
                  onPick={playTutorial}
                  onButtonPress={endThrob}
                  buttonClassName={`inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-button bg-primary-container px-4 text-label-lg font-semibold text-on-background transition active:scale-95${throbClass}`}
                >
                  How On It works
                </TourPicker>
              </div>
            </div>
          </header>
        ) : (
          <header className={`${HEADER_CLASS} md:hidden`}>
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-extrabold">
                On It<span className="text-primary">.</span>
              </span>
            </div>
            <TourPicker
              onPick={playTutorial}
              onButtonPress={endThrob}
              buttonClassName={`inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-button bg-primary-container px-4 text-label-lg font-semibold text-on-background transition active:scale-95${throbClass}`}
            >
              How On It works
            </TourPicker>
          </header>
        )}

        {ENABLE_CAMERA_ANIMATION && cameraTip && (
          <CoachMarks
            key="camera-tip"
            tab="/chat"
            tourOverride={CAMERA_TIP}
            currentPath={path}
            onDone={closeCameraTip}
          />
        )}
        <TutorialHost />

        {exactTab >= 0 ? (
          <main className="min-h-0 flex-1 overflow-hidden">
            <TabDeck
              activeIndex={exactTab}
              connectEnabled={connectEnabled}
              onPillStart={beginPill}
              onPillMove={movePill}
              onPillEnd={endPill}
            />
          </main>
        ) : (
          <main
            data-tab-scroll-owner=""
            className={`min-h-0 flex-1 ${path.startsWith('/chat') ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}${enterDir ? ` ${enterDir}` : ''}`}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
          >
            {children}
          </main>
        )}

        {/* The one soft upgrade banner due on this app open (lib/soft-prompts.ts).
            A flex sibling, so it never covers the screen or the composer. */}
        <SoftPromptBanner />

        <div className="md:hidden">
          <InstallBanner />
        </div>

        {/* Bottom tab bar for Mobile viewports */}
        <nav ref={navRef} data-kb-hide="" data-coach="tab-bar" className="glass-nav relative flex justify-around border-t border-outline-variant/40 px-1 pb-[calc(env(safe-area-inset-bottom)_+_4px)] pt-[7px] md:hidden">
          <span
            ref={pillRef}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 rounded-[18px] bg-primary-container"
            style={{ opacity: 0, width: 0, height: 0 }}
          />
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
                    ${active ? (pillReady ? '' : 'bg-primary-container') : centre ? 'bg-primary-soft' : ''}`}>
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
      {/* Plays once when the unlock poll sees the paid tier arrive. */}
      <ProCelebration />
    </div>
  );
}

/** (14d) Books tab dot: an unwatched recap from the last 14 days. Red with a
 *  cream ring, top-right of the Books pill (release frames 0a). */
function BooksDot({ variant = 'tab' }: { variant?: 'tab' | 'side' }) {
  const { unwatched } = useRecaps();
  if (!unwatched) return null;
  // The 9px dot was measured against the bottom tab's 58px pill. Inside the
  // sidebar/rail the icon box is 24px, so the same offsets put it off the icon;
  // `side` pins it to the icon's top-right corner instead.
  const pos = variant === 'side' ? '-right-1 -top-1' : 'right-[13px] top-0.5';
  return (
    <>
      <span aria-hidden className={`absolute ${pos} h-[9px] w-[9px] rounded-full border-2 border-background bg-[#c8452c]`} />
      <span className="sr-only">, new recap</span>
    </>
  );
}
