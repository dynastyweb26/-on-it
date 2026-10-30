'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import SettingsSkeleton from '@/components/SettingsSkeleton';
import { createClient } from '@/lib/supabase/client';
import InvoiceStyleCard from './InvoiceStyleCard';
import { freePlanSummary } from '@/lib/usage';
import { getPushSubscription, subscribeToPush, unsubscribeFromPush, pushAvailability, type PushAvailability } from '@/lib/push';
import { clearChatStorage, clearAllChatStorage } from '@/lib/chat-storage';
import { PAYWALL_ENABLED } from '@/lib/paywall';
import CodeEntry from '@/components/CodeEntry';
import { trialDates, trialEligible } from '@/lib/trial';
import { getSummary, resume, type CancelSummary } from '@/lib/subscription-actions';
import { fmtPlanDate, freePlanAfterLine, offerNotice, pausedLine, type FreeLimits } from '@/lib/subscription/copy';
import { SettingsGroup, SettingsRow, SettingsTitle } from './SettingsRows';
import { PayoutsIndex, PayoutDetail, PAYOUTS_INDEX } from './PayoutsScreens';
import BankAccountsScreen from '@/components/bank/BankAccountsScreen';
import { useBankTracking } from '@/components/bank/BankTrackingProvider';
import { bankRowTitle, bankRowValue } from '@/lib/bank-accounts';
import type { PayoutMethod } from '@/lib/payout-status';
import { OPEN_TOUR_PICKER } from '@/components/tutorial/TourPicker';
import { sectionFromPath, type SettingsSection } from './sections';
import { noteUpgradeReturn, subscribeAccess } from '@/lib/upgrade-return';
import { getSharedUser } from '@/lib/auth-client';
import PageContainer from '@/components/PageContainer';
import SplitView from '@/components/layout/SplitView';

// A live subscription (any of these) gets the "Manage subscription" row → Stripe
// Billing Portal. 'free' and 'canceled' get the upgrade CTA; 'founder' hides the
// whole section (grants bypass billing entirely).
const SUBSCRIBED = new Set(['trialing', 'active', 'past_due']);
// Stored access_tier values hasAccess() reports as themselves; anything else is 'free'.
const PLAN_TIERS = new Set(['founder', 'trialing', 'active', 'past_due', 'canceled']);

// Renewal / first-charge date. Returns null when the field is absent so the
// caller can drop the date clause entirely (null-guard).
const fmtDate = (d: string | null | undefined): string | null =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

// Under Brave with Shields enabled, auth.getUser() has been observed to stall
// indefinitely on this page — the check never settles and the screen sits on
// "Loading…" (Chrome is fine). The cause is not identified as of 2026-08-31.
// Regardless of cause, we bound the wait: past this we show an actionable
// Retry / Sign-in state instead of hanging forever. 8s is well past a
// slow-but-working network token refresh, while the observed stall is
// indefinite — so this only trips on a genuine hang. (reset-password uses 2.5s
// for a purely-local session read — a cheaper, different call.)
const AUTH_TIMEOUT_MS = 8000;

// connectEnabled: is Stripe Connect switched on in THIS deployment? Read on the
// server by settings/page.tsx and passed in, so the Stripe card renders its
// real state on first paint instead of flashing "Coming soon" while a client
// fetch resolves. Fail closed: anything but true renders "Coming soon".
// One component, several screens (release frames 0c): /settings shows the
// grouped rows, /settings/<section> one sub-screen. Every screen loads the same
// profile and keeps the same save paths; only what renders differs.
// method: on /settings/payouts/<method>, which payout method's detail view.
export default function SettingsView({ connectEnabled, subscriptionsEnabled, section = 'main', method, active = true }: {
  connectEnabled: boolean;
  /** Is Stripe subscription checkout open in this deployment (lib/subscriptions)?
   *  Server-read by every mount (the settings wrappers, (app)/layout for the
   *  deck's Settings tab), so the Plan row renders its real state on first
   *  paint. False hides the upgrade CTA for the one line that says where
   *  subscribing lives now — never a button that can only fail. Required on
   *  purpose: a new mount must decide, never inherit a guess. */
  subscriptionsEnabled: boolean;
  section?: SettingsSection; method?: PayoutMethod; active?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  // Bank tracking (mock phase 1): null unless the shell's flag is on, so this
  // screen is untouched in production.
  const bankCtx = useBankTracking();
  // ── Laptop master/detail (design §7) ─────────────────────────────
  // At xl the grouped list is the left pane and the selected row's page is the
  // right pane, driven by the route — the same shape the Invoices split uses.
  // Resolved on the client: the server and the first client render are today's
  // single column, so there is no hydration mismatch. Below xl nothing changes:
  // the `section` prop is the whole story.
  const pathname = usePathname();
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  // The section the route names (null on /settings and on a deeper route). Set
  // on the click so the pane follows the tap immediately, then confirmed by the
  // pathname — the pane must not wait for the navigation's payload.
  const routeSec = sectionFromPath(pathname);
  const [picked, setPicked] = useState<SettingsSection | null>(routeSec);
  useEffect(() => { setPicked(routeSec); }, [routeSec]);
  // The split is the Settings screen itself and its one-level section routes.
  // A deeper route — /settings/payouts/<method> — is its own screen at every
  // width, so it keeps its own page and its Back button.
  const split = wide && (section === 'main' || routeSec !== null);
  const sec: SettingsSection = split ? (picked ?? 'main') : section;
  // A configured row click at xl opens the section in the right pane. Push, not
  // replace, so Back and Forward step through the sections you opened. Below xl
  // SettingsRow is never given this, so the link navigates as it always did.
  function openSection(e: React.MouseEvent<HTMLAnchorElement>, s: SettingsSection) {
    if (!split) return;
    e.preventDefault();
    setPicked(s);
    router.push(`/settings/${s}`, { scroll: false });
  }
  const [p, setP] = useState<any>(null);
  // Signed-in account email, read from the same getSharedUser() call this page
  // already makes. Display only — never written to the profiles row.
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // save() applies optimistically; on a failed write it reverts and raises this,
  // mirroring the Saved banner so a swallowed error can no longer look like success.
  const [saveFailed, setSaveFailed] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  // Zelle is encrypted at rest; only /api/zelle (server-side) touches it.
  // undefined = not loaded yet (or the lookup failed) — never shown as "Not set".
  const [zelleMasked, setZelleMasked] = useState<string | null | undefined>(undefined);
  // real subscription state, not a fire-and-forget button
  const [pushOn, setPushOn] = useState<boolean | null>(null); // null = checking
  const [pushBusy, setPushBusy] = useState(false);
  // What this device can do about push (install needed, blocked, …); read after
  // mount — it depends on window/navigator.
  const [pushAvail, setPushAvail] = useState<PushAvailability | null>(null);
  // Preview-only test sender (/api/push/test answers 404 everywhere else).
  const [pushTestOn, setPushTestOn] = useState(false);
  const [pushTestMsg, setPushTestMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [redirecting, setRedirecting] = useState(false); // decided to leave — never hang on Loading
  // Auth resolution exceeded AUTH_TIMEOUT_MS without settling (see effect) — show
  // an actionable state instead of an indefinite spinner. A late-resolving `p`
  // supersedes it (render order below).
  const [authStuck, setAuthStuck] = useState(false);
  // Subscription: tier drives manage-vs-upgrade; founder hides the section.
  const [access, setAccess] = useState<{
    hasAccess: boolean; tier: string; invoiceCount: number; expenseCount?: number;
    invoiceLimit?: number | null; expenseLimit?: number | null; trialEligible?: boolean;
  } | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingNotice, setBillingNotice] = useState('');
  // Cancel flow (CANCEL-FLOW-SPEC.md §1): server state for the Plan screen
  // (free limits for the "ends" line) and the notice an offer returns with.
  const [planSummary, setPlanSummary] = useState<CancelSummary | null>(null);
  const [planNotice, setPlanNotice] = useState<'discount' | 'paused' | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [planLimits, setPlanLimits] = useState<FreeLimits | null>(null);
  // Stripe Connect: busy covers both the onboarding redirect and a status
  // refresh; notice carries the 503/failure message inline (billing pattern).
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectNotice, setConnectNotice] = useState('');
  // Synchronous in-flight guard for startConnect (see there).
  const connectInFlight = useRef(false);
  // Is Connect switched on in this deployment? Server-rendered (see the prop),
  // so it's known from the first render. Anything but true renders the
  // disabled "Coming soon" card.
  const connectOn = connectEnabled === true;
  // Subscription checkout open in this deployment? Anything but true drops the
  // upgrade disclosure and CTA entirely — no replacement line (default true so
  // an unnamed mount keeps today's screen).
  const subsOn = subscriptionsEnabled !== false;
  // Account deletion: a two-step, typed-confirmation flow kept well away from
  // Sign out. Fires POST /api/delete-account only when the input reads DELETE.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  // YOUR BUSINESS › Clients count: saved clients only (merge 2 · 2·3).
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [productCount, setProductCount] = useState<number | null>(null);
  useEffect(() => {
    // At xl the list is on screen whatever section the route names, so its two
    // counts load on any laptop Settings load.
    if (!active || !(sec === 'main' || split)) return;
    supabase.from('clients').select('id', { count: 'exact', head: true })
      .not('saved_at', 'is', null).is('deleted_at', null)
      .then(({ count }) => setClientCount(count ?? null), () => undefined);
    // Products & Services count (merge 2 · 2·8); quietly absent until the table exists.
    supabase.from('products').select('id', { count: 'exact', head: true })
      .not('saved_at', 'is', null).is('deleted_at', null)
      .then(({ count }) => setProductCount(count ?? null), () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec, active, split]);

  useEffect(() => {
    if (!active) return; // hidden deck panels never redirect or fetch auth
    let alive = true;
    // settled + timer follow the reset-password convention: if the auth
    // resolution below hasn't reached a terminal decision (render p, or redirect)
    // within AUTH_TIMEOUT_MS, treat it as unresolved and show the actionable
    // state. Cleared the moment it settles, and on unmount.
    let settled = false;
    const stuckTimer = setTimeout(() => { if (alive && !settled) setAuthStuck(true); }, AUTH_TIMEOUT_MS);
    const settle = () => { settled = true; clearTimeout(stuckTimer); };
    // Stripe's Account Link return/refresh URLs land on /settings?connect=…
    // (server-built, unchanged): hand them to the Stripe payout view, which
    // runs the return-trip logic below and shows any Connect notice.
    const connectParam = new URLSearchParams(window.location.search).get('connect');
    // Checkout's success URL for Settings is /settings?upgraded=1: show the
    // Plan sub-screen (it re-reads access on load).
    if (sec === 'main' && !connectParam && new URLSearchParams(window.location.search).get('upgraded') === '1') {
      settled = true; clearTimeout(stuckTimer);
      noteUpgradeReturn(); // starts the unlock poll; it outlives this redirect
      router.replace('/settings/plan');
      return () => { alive = false; };
    }
    if (sec === 'main' && connectParam) {
      settled = true; clearTimeout(stuckTimer);
      router.replace(`${PAYOUTS_INDEX}/stripe?connect=${encodeURIComponent(connectParam)}`);
      return () => { alive = false; };
    }
    (async () => {
      try {
        // Fast local gate FIRST: getSession() reads the persisted session from
        // storage with no network round-trip (unlike getUser() below), so a
        // genuinely signed-out user is sent to /login immediately and the
        // redirect can never be blocked by a slow or stalled auth call — the
        // documented getUser() hang no longer leaves a signed-out user sitting
        // on "Loading…". Mirrors chat's getSession-before-getUser convention.
        const { data: { session } } = await supabase.auth.getSession();
        if (!alive) return;
        if (!session) { settle(); setRedirecting(true); router.replace('/login'); return; }

        // The one /api/access read, started now — in parallel with getUser,
        // the profile and /api/zelle instead of after all of them. The route
        // authenticates the cookie itself; only the free-plan usage counts
        // wait on it, so it applies whenever it lands.
        void fetch('/api/access')
          .then((a) => (a.ok ? a.json() : null))
          .then((a) => { if (alive && a) setAccess(a); })
          .catch(() => { /* leave null → the usage row keeps its placeholder */ });

        // Auth-gated page: a signed-out user (or a failed/expired auth check)
        // must land on login, never sit on "Loading…". getUser() can reject on
        // a token-refresh/network failure, so the whole check is guarded — any
        // throw routes to /login. A getUser() that never settles (the observed
        // Brave/Shields stall, cause unidentified) is caught by stuckTimer
        // above, not by this try/catch.
        const { data: { user }, error } = await getSharedUser();
        if (!alive) return;
        if (error || !user) { settle(); setRedirecting(true); router.replace('/login'); return; }
        setAccountEmail(user.email ?? null);

        // Zelle's mask comes from its own route; start it alongside the profile
        // read so the payouts statuses land together. Only the screens that show it.
        const zelleReq = sec === 'main' || sec === 'payouts' || split
          ? fetch('/api/zelle').then((r) => (r.ok ? r.json() : null)).catch(() => null)
          : null;
        // Plan screen: the free limits are their own effect (below), keyed on
        // the section, so the laptop split loads them when Plan is opened rather
        // than only when the route landed there.
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (!alive) return;
        // Signed in but no profile yet → finish onboarding (matches chat's pattern).
        if (!data) { settle(); setRedirecting(true); router.replace('/onboarding'); return; }
        settle();
        setAuthStuck(false); // late resolve after a timeout: recover and render
        setP(data);
        // A payout detail view saved and came back here (?saved=1): the usual
        // "Saved" banner, then drop the param so a reload doesn't repeat it.
        if (sec === 'payouts' && !method && new URLSearchParams(window.location.search).get('saved') === '1') {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
          router.replace(PAYOUTS_INDEX);
        }

        // Stripe Connect return trip. ?connect=refresh means the Account Link
        // expired or was reused — get a fresh one (Stripe's documented flow).
        // ?connect=return means the seller left onboarding, finished or not —
        // re-read the status. Also re-read on any load while setup is
        // incomplete, so a finished-elsewhere onboarding shows up. The param is
        // dropped from the URL first so a reload can't loop the redirect.
        // All of it is skipped unless the server says Connect is on here.
        if (connectParam) router.replace(`${PAYOUTS_INDEX}/stripe`);
        if (connectOn && (sec === 'main' || sec === 'payouts')) {
          if (connectParam === 'refresh') {
            void startConnect();
          } else if (data.stripe_account_id && (connectParam === 'return' || !data.stripe_charges_enabled)) {
            void refreshConnect();
          }
        }

        if (zelleReq) {
          const z = await zelleReq;
          // A failed lookup (e.g. 429) stays undefined: blank, not "Not set".
          if (alive && z) setZelleMasked(z.set ? z.masked : null);
        }
        if (alive) setPushAvail(pushAvailability());
        try {
          const t = await fetch('/api/push/test');
          if (alive) setPushTestOn(t.ok);
        } catch { /* not available — the test row stays hidden */ }
        if (alive) setPushOn(Boolean(await getPushSubscription()));
      } catch {
        // Auth/network failed (rejected) — don't hang; send to login.
        if (!alive) return;
        settle();
        setRedirecting(true);
        router.replace('/login');
      }
    })();
    return () => { alive = false; clearTimeout(stuckTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Plan screen: the free limits (constant SQL functions, the same ones the
  // paywall reads). Its own effect so the laptop split loads them when Plan is
  // opened, not only when the route landed there.
  useEffect(() => {
    if (!active || sec !== 'plan') return;
    let alive = true;
    Promise.all([supabase.rpc('free_invoice_limit'), supabase.rpc('free_expense_limit')]).then(
      (l) => {
        if (!alive) return;
        // A limit worth showing; anything this large is "uncapped" (lib/access displayLimit).
        const shown = (n: unknown) => (typeof n === 'number' && n < 1000 ? n : null);
        setPlanLimits({ invoices: shown(l[0].data), expenses: shown(l[1].data) });
      },
      () => undefined,
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec, active]);

  // Resolves false when the write failed (and was reverted). `silent` skips the
  // page-level Saved/error banners; the Invoice style card shows its own.
  // Per-field write chain. Two saves for the same field never overlap, and a
  // failure only rolls back if no newer save for that field has landed — so a
  // slow request can't undo an edit the user made after it.
  const saveVersions = useRef(new Map<string, number>());
  const saveChains = useRef(new Map<string, Promise<boolean>>());

  // #11 row 40: these fields persist on blur, so leaving with one still focused
  // dropped the last edit. Every keystroke records the pending value here and
  // leaving (pagehide, tab hidden, unmount / navigation) flushes it once.
  const pendingEdits = useRef<Record<string, unknown>>({});
  const saveRef = useRef(save);
  saveRef.current = save;
  const flushPending = () => {
    const patch = pendingEdits.current;
    pendingEdits.current = {};
    if (Object.keys(patch).length) void saveRef.current(patch, { silent: true });
  };
  const touchEdit = (patch: Record<string, unknown>) => {
    pendingEdits.current = { ...pendingEdits.current, ...patch };
  };
  const commitEdit = (column: string, value: unknown) => {
    // The blur handler owns this column now; drop it from the pending set.
    const rest = { ...pendingEdits.current };
    delete rest[column];
    pendingEdits.current = rest;
    return save({ [column]: value });
  };
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushPending(); };
    window.addEventListener('pagehide', flushPending);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flushPending);
      document.removeEventListener('visibilitychange', onHide);
      flushPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(patch: Record<string, unknown>, opts?: { silent?: boolean }): Promise<boolean> {
    const profileId = p?.id;
    if (!profileId) return false;
    const fields = Object.keys(patch);
    const key = [...fields].sort().join(',');
    const previous = Object.fromEntries(fields.map((f) => [f, (p as Record<string, unknown>)[f]]));
    const version = (saveVersions.current.get(key) ?? 0) + 1;
    saveVersions.current.set(key, version);
    setP((cur: Record<string, unknown>) => ({ ...cur, ...patch }));   // optimistic

    const run = async (): Promise<boolean> => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', profileId);
      if (error) {
        // Keep the evidence: which columns were sent and Supabase's code/message
        // (e.g. 42501 permission denied). No values — they can be personal data.
        console.error('settings save failed', JSON.stringify({
          columns: fields, code: error.code, message: error.message, details: error.details, hint: error.hint,
        }));
        // Revert only this field, and only while it is still the newest write.
        if (saveVersions.current.get(key) === version) {
          setP((cur: Record<string, unknown>) => ({ ...cur, ...previous }));
        }
        if (!opts?.silent) {
          setSaveFailed(true);
          setTimeout(() => setSaveFailed(false), 2500);
        }
        return false;
      }
      if (!opts?.silent) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
      return true;
    };

    const prior = saveChains.current.get(key);
    const next = prior ? prior.then(run, run) : run();
    saveChains.current.set(key, next);
    try {
      return await next;
    } finally {
      if (saveChains.current.get(key) === next) saveChains.current.delete(key);
    }
  }

  // ── Logo manager: upload / replace / remove ─────────────────
  // Same mechanism as onboarding: 'logos' bucket, `${user.id}/logo-<ts>` path,
  // public URL stored on profiles.logo_url. No second upload path.
  function logoStoragePath(url: string | null): string | null {
    const m = url?.match(/\/logos\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function uploadLogo(file: File) {
    if (logoBusy) return;
    setLogoBusy(true);
    try {
      const oldPath = logoStoragePath(p.logo_url);
      const path = `${p.id}/logo-${Date.now()}`;
      const { error } = await supabase.storage.from('logos').upload(path, file);
      if (error) return;
      const url = supabase.storage.from('logos').getPublicUrl(path).data.publicUrl;
      await save({ logo_url: url });
      // best-effort cleanup of the replaced file (needs the 005 delete policy)
      if (oldPath) await supabase.storage.from('logos').remove([oldPath]);
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    if (logoBusy) return;
    setLogoBusy(true);
    try {
      const oldPath = logoStoragePath(p.logo_url);
      // pointer first: even if the storage delete fails, invoices already
      // fall back to the business-name header
      await save({ logo_url: null });
      if (oldPath) await supabase.storage.from('logos').remove([oldPath]);
    } finally {
      setLogoBusy(false);
    }
  }

  async function togglePush() {
    if (pushBusy || pushOn === null) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        if (await unsubscribeFromPush()) setPushOn(false);
      } else {
        if (await subscribeToPush()) setPushOn(true);
      }
    } finally {
      setPushBusy(false);
      setPushAvail(pushAvailability()); // a "Don't Allow" just now shows as blocked
    }
  }

  // Preview-only: fire a test notification at this user's own devices.
  async function sendTestPush(body: Record<string, string>) {
    setPushTestMsg('Sending…');
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setPushTestMsg(j.error ?? `Failed (${res.status})`);
      else if (typeof j.candidates === 'number' && !(j.delivered > 0)) setPushTestMsg(j.candidates === 0
        ? 'No eligible draft: needs an invoice draft last edited 1–14 days ago, outside quiet hours, not already notified, and no draft notification in the last 20h.'
        : 'An eligible draft was found but nothing was delivered. Check this device is subscribed.');
      else setPushTestMsg(j.delivered > 0
        ? `Sent to ${j.delivered} device${j.delivered === 1 ? '' : 's'}.`
        : 'No subscribed preview devices. Turn the switch on first.');
    } catch {
      setPushTestMsg('Failed to reach the server.');
    }
  }

  // Plan screen: read the subscription summary, and pick up the notice the
  // cancel screen hands back after an offer (/settings/plan?done=discount|paused),
  // then drop the param so a refresh doesn't repeat it.
  useEffect(() => {
    if (!active || sec !== 'plan') return;
    const done = new URLSearchParams(window.location.search).get('done');
    if (done === 'discount' || done === 'paused') {
      setPlanNotice(done);
      router.replace('/settings/plan');
    }
    let alive = true;
    void getSummary().then((s) => { if (alive) setPlanSummary(s); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec, active]);

  // Resume a canceling or paused subscription, then re-read the profile,
  // access and summary so the Plan screen shows the server's state.
  async function resumePlan() {
    if (resumeBusy) return;
    setResumeBusy(true);
    setBillingNotice('');
    setPlanNotice(null);
    const r = await resume();
    if (!r.ok) {
      setBillingNotice(r.message);
    } else {
      const [{ data: { user } }, a, s] = await Promise.all([
        getSharedUser(),
        fetch('/api/access').then((x) => (x.ok ? x.json() : null)).catch(() => null),
        getSummary(),
      ]);
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (data) setP(data);
      }
      if (a) setAccess(a);
      setPlanSummary(s);
    }
    setResumeBusy(false);
  }

  // The unlock poll (checkout return or a redeemed code) saw the tier turn
  // paid: take the new access and re-read the profile (the Plan row and screen
  // read the tier from it), so Settings flips with no manual refresh.
  const profileId: string | undefined = p?.id;
  useEffect(() => {
    return subscribeAccess((a) => {
      setAccess((prev) => ({ ...(prev ?? { invoiceCount: 0 }), ...a }) as NonNullable<typeof access>);
      if (!profileId) return;
      void supabase.from('profiles').select('*').eq('id', profileId).maybeSingle()
        .then(({ data }) => { if (data) setP(data); }, () => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  // Plan states (spec §1), from the profile the webhook and routes keep in
  // sync. A paused subscription is still live in billing (status 'active')
  // but its tier is the free one, so it's detected from paused_until. A
  // founder whose old subscription is winding down (redeem sets
  // cancel_at_period_end) never gets here: the founder card renders instead.
  //
  // Everything here reads the profile (loaded before first render), never
  // /api/access, so the Plan row and screen render at once instead of
  // popping in seconds later. planTier mirrors hasAccess()'s mapping of the
  // stored access_tier (lib/access.ts): anything unknown is 'free'.
  // The Payouts row's status, and the walkthrough's "no payout method yet"
  // test (data-payouts-set; absent until Zelle has loaded, so the tour never
  // reads a half-loaded row as "none").
  const payoutsAny = Boolean(p) && ((connectOn && p.stripe_charges_enabled)
    || [p.paypal_me, p.cashapp_tag, p.venmo_username, zelleMasked, p.bank_account_last4].some(Boolean));
  const payoutsValue = !p ? null : connectOn && p.stripe_charges_enabled ? 'Connected'
    : payoutsAny ? 'Set up' : zelleMasked === undefined ? null : 'Not set';
  const payoutsSet = payoutsAny ? 'yes' : zelleMasked === undefined ? undefined : 'no';
  const planTier: string = PLAN_TIERS.has(p?.access_tier ?? '') ? p.access_tier : 'free';
  const planBillable = SUBSCRIBED.has(p?.subscription_status ?? '') && planTier !== 'founder';
  const planPaused = planBillable && Boolean(p?.paused_until);
  const planCanceling = planBillable && Boolean(p?.cancel_at_period_end);
  const planLive = SUBSCRIBED.has(planTier) || planPaused;
  const planEnds: string | null = (p?.subscription_status === 'trialing' ? p?.trial_ends_at : p?.current_period_end) ?? null;

  // Subscribed users → Stripe Billing Portal (manage/cancel/update card).
  // Free/canceled users → Checkout ($9.99/mo; a 14-day free trial for
  // first-time customers only, lib/trial.ts).
  // Both redirect to a Stripe-hosted page; the 503 dormant message shows inline.
  async function billingAction(endpoint: '/api/billing-portal' | '/api/checkout') {
    if (billingBusy) return;
    setBillingBusy(true);
    setBillingNotice('');
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (data?.url) { window.location.href = data.url; return; }
      setBillingNotice(data?.message ?? 'That’s not available right now — try again shortly.');
    } catch {
      setBillingNotice('That’s not available right now — try again shortly.');
    } finally {
      setBillingBusy(false);
    }
  }

  // Stripe Connect onboarding → Stripe-hosted Account Link. Creates the Standard
  // account on first use server-side; resumes it after. 503 dormant message
  // shows inline, same as billing.
  async function startConnect() {
    // Ref, not state: two taps in the same frame both see connectBusy=false
    // (state hasn't re-rendered yet), which is how one tap became several POSTs.
    if (connectInFlight.current) return;
    connectInFlight.current = true;
    setConnectBusy(true);
    setConnectNotice('');
    let redirecting = false;
    try {
      const res = await fetch('/api/connect/onboard', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data?.url) {
        // Leaving for Stripe: stay busy/disabled until the page unloads, so a
        // tap during navigation can't fire a second onboarding request.
        redirecting = true;
        window.location.href = data.url;
        return;
      }
      setConnectNotice(data?.message ?? 'Stripe isn’t available right now — try again shortly.');
    } catch {
      setConnectNotice('Stripe isn’t available right now — try again shortly.');
    } finally {
      if (!redirecting) {
        connectInFlight.current = false;
        setConnectBusy(false);
      }
    }
  }

  // Re-read the connected account's status from Stripe (server mirrors it onto
  // the profile) and merge it into local state. Silent on failure: the card
  // just keeps showing the last known state.
  async function refreshConnect() {
    setConnectBusy(true);
    try {
      const res = await fetch('/api/connect/status', { method: 'POST' });
      if (!res.ok) return;
      const s = await res.json();
      if (!s?.connected) return;
      setP((prev: any) => prev && ({
        ...prev,
        stripe_charges_enabled: s.chargesEnabled,
        stripe_details_submitted: s.detailsSubmitted,
        stripe_payouts_enabled: s.payoutsEnabled,
      }));
    } catch {
      /* keep last known state */
    } finally {
      setConnectBusy(false);
    }
  }

  // Permanent: deletes the account, all records, and uploaded files, and cancels
  // any live subscription server-side. Only fires on an exact "DELETE" match.
  async function confirmDelete() {
    if (deleteConfirm !== 'DELETE' || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (res.ok) {
        // The account is gone; clear everything local (conversation AND
        // history), drop the session, and leave for login.
        clearAllChatStorage(p?.id);
        await supabase.auth.signOut().catch(() => {});
        setRedirecting(true);
        router.replace('/login');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setDeleteError(data?.message ?? 'We couldn’t delete your account. Please try again.');
    } catch {
      setDeleteError('We couldn’t delete your account. Please try again.');
    } finally {
      setDeleteBusy(false);
    }
  }

  // Deep link from the "Add terms" tip: /settings/business-info#terms scrolls to the
  // field and focuses it once the profile has loaded.
  const termsReady = !!p && sec === 'business-info';
  useEffect(() => {
    if (!termsReady || window.location.hash !== '#terms') return;
    const el = document.getElementById('terms');
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    (el as HTMLTextAreaElement).focus({ preventScroll: true });
  }, [termsReady]);

  if (redirecting) return <p className="p-6 text-on-surface-variant">Redirecting…</p>;
  // Auth stalled (observed under Brave with Shields; cause unidentified)
  // and no profile yet — actionable, not a hang.
  // Ordered after redirecting (a real decision wins) and gated on !p, so a
  // late-resolving getUser that sets p supersedes this and renders the page.
  if (!p && authStuck) return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <Icon name="sync_problem" size={40} className="text-on-surface-variant" />
      <div className="space-y-1">
        <p className="text-body-lg font-semibold text-on-background">Settings is taking longer than usual</p>
        <p className="text-sm text-on-surface-variant">Your browser may be blocking background access. Try again, or sign in.</p>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary px-5" onClick={() => window.location.reload()}>Retry</button>
        <button className="btn-outline px-5" onClick={() => router.push('/login')}>Sign in</button>
      </div>
    </div>
  );
  if (!p) return <SettingsSkeleton />;

  const is = (s: SettingsSection) => sec === s;
  // The grouped list is the left pane at xl even while a section is selected.
  const showList = is('main') || split;
  const title = (s: SettingsSection) => (s === 'bank' ? 'Bank accounts' : s === 'business' ? 'Business profile' : s === 'business-info' ? 'Business Info' : s === 'business-brand' ? 'Brand Design' : s === 'payouts' ? 'Payment options' : s === 'plan' ? 'Plan' : s === 'notifications' ? 'Notifications' : s === 'help' ? 'Help & feedback' : s === 'login' ? 'Manage login' : 'Settings');
  const banners = (<>
    {saved && <div className="rounded-input bg-paid-container p-2 text-center text-sm font-semibold text-paid">Saved</div>}
    {saveFailed && <div className="rounded-input bg-error-container p-2 text-center text-sm font-semibold text-error-on-container">Couldn’t save — check your connection and try again.</div>}
  </>);
  // A payout method's own route renders no title (unchanged).
  const heading = (s: SettingsSection) => (!(s === 'payouts' && method) ? <SettingsTitle>{title(s)}</SettingsTitle> : null);

  // The left pane: the grouped list, which is the design's master column. At xl
  // the deck keeps it mounted across selections, so its scroll survives a row
  // click.
  const listPane = (
    <>
      {heading('main')}
      {banners}

      {/* The grouped main screen (release frames 0c). Clients and Products &
          Services open the Clients tab (founder rule F3); Recurring expenses
          ("In Books") opens Books › Recurring (merge 3 · 3·3). */}
      {showList && (<>
        <SettingsGroup title="Your business">
          <SettingsRow icon="group" tint="gold" title="Clients" value={clientCount ? String(clientCount) : null} href="/clients" />
          <SettingsRow icon="handyman" tint="gold" title="Products & Services" value={productCount ? String(productCount) : null} href="/clients?segment=products" />
          <SettingsRow icon="storefront" title="Business profile" href="/settings/business" data-coach="settings-profile"
            active={is('business')} onNavigate={(e) => openSection(e, 'business')} />
          <SettingsRow icon="folder" title="Records" value="Vault" href="/vault" />
        </SettingsGroup>
        <SettingsGroup title="Money">
          <SettingsRow icon="autorenew" title="Recurring expenses" value="In Books" href="/dashboard/recurring" />
          {/* Bank tracking: "Connect bank" until linked, then "Bank accounts - N";
              free users see the Pro lock. Hidden entirely when the flag is off. */}
          {bankCtx?.enabled && (
            <SettingsRow
              icon="account_balance_wallet"
              title={bankRowTitle(bankCtx.bank, bankCtx.tier)}
              value={bankRowValue(bankCtx.bank, bankCtx.tier)}
              locked={bankCtx.tier === 'free'}
              href="/settings/bank"
              active={is('bank')}
              onNavigate={(e) => openSection(e, 'bank')}
            />
          )}
          <SettingsRow icon="account_balance" title="Payment options" href="/settings/payouts"
            data-coach="settings-payouts"
            data-payouts-set={payoutsSet}
            active={is('payouts')} onNavigate={(e) => openSection(e, 'payouts')}
            value={payoutsValue} />
        </SettingsGroup>
        <SettingsGroup title="Account">
          {/* Plan: only when the Plan screen has something to show (founder, a
              real subscription, or the paywall on) — the same rule as before.
              Decided from the profile, so the row is there on first render and
              nothing below it shifts. */}
          {(planTier === 'founder' || PAYWALL_ENABLED || planLive) && (
            <SettingsRow icon="workspace_premium" title="Plan" href="/settings/plan"
              active={is('plan')} onNavigate={(e) => openSection(e, 'plan')}
              value={planTier === 'founder' ? 'Founder'
                : planPaused ? 'Paused'
                : planCanceling ? 'Ending'
                : planTier === 'trialing' ? 'Free trial'
                : planTier === 'past_due' ? 'Payment due'
                : planTier === 'active' ? 'Subscribed' : 'Free'} />
          )}
          <SettingsRow icon="notifications" title="Notifications" href="/settings/notifications"
            active={is('notifications')} onNavigate={(e) => openSection(e, 'notifications')}
            value={pushOn === null ? null : pushOn ? 'On' : 'Off'} />
          {p.referral_code && <SettingsRow icon="person_add" title="Invite a contractor" onClick={() => setInviteOpen(true)} />}
          <SettingsRow icon="help" title="Help & feedback" href="/settings/help" data-coach="settings-replay"
            active={is('help')} onNavigate={(e) => openSection(e, 'help')} />
          {/* Sign out + Delete account live on their own screen so they're
              never one stray tap away on the main Settings list. */}
          <SettingsRow icon="person" title="Manage login" href="/settings/login"
            active={is('login')} onNavigate={(e) => openSection(e, 'login')}
            value={accountEmail} />
        </SettingsGroup>
      </>)}
      {/* The version line closes the list pane, exactly where it sat on the page
          below xl. */}
      {showList && (
      <p className="pb-4 text-center text-xs text-on-surface-variant/60">On It · a Dynasty Web product · $9.99/month</p>
      )}
    </>
  );
  // The right pane: the selected section's page. Keyed by the section, so a
  // selection change hands the pane a fresh instance (the Invoice style card
  // seeds state from the profile) instead of the previous section's internals.
  const detailPane = sec === 'main' ? null : (
    <>
      {heading(sec)}
      {banners}

      {/* Business profile: a menu of two screens, same rows as Settings. */}
      {is('business') && (
        <SettingsGroup title="Manage">
          <SettingsRow icon="storefront" title="Business Info" value={p.business_name || null} href="/settings/business-info" />
          <SettingsRow icon="image" title="Brand Design" href="/settings/business-brand" />
        </SettingsGroup>
      )}

      {/* Bank accounts (mock, phase 1). */}
      {is('bank') && <BankAccountsScreen />}

      {is('business-info') && (<>
      <section className="card space-y-3">
        <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Business</h2>
        <input className="input" aria-label="Business name" placeholder="Business name" value={p.business_name ?? ''}
          autoComplete="organization" autoCapitalize="words"
          onChange={(e) => { setP({ ...p, business_name: e.target.value }); touchEdit({ business_name: e.target.value }); }}
          onBlur={(e) => void commitEdit('business_name', e.target.value)} />
        <input className="input" placeholder="Website" type="url" inputMode="url" autoComplete="url"
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          value={p.website_url ?? ''}
          onChange={(e) => { setP({ ...p, website_url: e.target.value }); touchEdit({ website_url: e.target.value }); }}
          onBlur={(e) => void commitEdit('website_url', e.target.value || null)} />
        <input className="input" placeholder="Slogan" autoComplete="off"
          value={p.slogan ?? ''}
          onChange={(e) => { setP({ ...p, slogan: e.target.value }); touchEdit({ slogan: e.target.value }); }}
          onBlur={(e) => void commitEdit('slogan', e.target.value || null)} />
        {/* Shown on the client estimate page, read live from the profile —
            never snapshotted, so a changed number reaches the client. */}
        <input className="input" type="tel" inputMode="tel" aria-label="Business phone"
          placeholder="Business phone" maxLength={30}
          value={p.business_phone ?? ''}
          onChange={(e) => { setP({ ...p, business_phone: e.target.value }); touchEdit({ business_phone: e.target.value }); }}
          onBlur={(e) => void commitEdit('business_phone', e.target.value.trim() || null)} />
        <input className="input" type="email" inputMode="email" aria-label="Business email"
          placeholder="Business email" maxLength={254}
          value={p.business_email ?? ''}
          onChange={(e) => { setP({ ...p, business_email: e.target.value }); touchEdit({ business_email: e.target.value }); }}
          onBlur={(e) => void commitEdit('business_email', e.target.value.trim() || null)} />
        {/* Printed at the bottom of every estimate and invoice. The text is
            copied onto a document when it is first sent, so editing it here
            never changes a document that already went out. */}
        <textarea id="terms" className="input min-h-[8rem] resize-y" aria-label="Terms and conditions"
          placeholder={'Terms and conditions (printed on every estimate and invoice)\nExample: 50% deposit due to schedule the work. Balance due on completion. Estimates valid for 30 days.'}
          maxLength={3000} rows={5}
          value={p.terms ?? ''}
          onChange={(e) => { setP({ ...p, terms: e.target.value }); touchEdit({ terms: e.target.value }); }}
          onBlur={(e) => void commitEdit('terms', e.target.value.trim() || null)} />
        <p className="-mt-1 text-right text-xs text-on-surface-variant">{(p.terms ?? '').length}/3000</p>
      </section>
      </>)}

      {is('business-brand') && (<>
      <section className="card space-y-3">
        <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Logo</h2>
        <div className="flex items-center gap-3">
          {p.logo_url
            ? <img src={p.logo_url} className="h-14 w-14 rounded-lg border border-outline-variant object-cover" alt="Business logo" />
            : <span className="grid h-14 w-14 place-items-center rounded-lg bg-surface-container"><Icon name="image" size={24} className="text-on-surface-variant" /></span>}
          <p className="flex-1 text-sm text-on-surface-variant">
            {p.logo_url ? 'Shown on your invoices.' : 'No logo — invoices show your business name instead.'}
          </p>
        </div>
        <div className="flex gap-2">
          <label className={`chip flex cursor-pointer items-center gap-1.5 ${logoBusy ? 'pointer-events-none opacity-50' : ''}`}>
            <Icon name="upload" size={18} /> {logoBusy ? 'Working…' : p.logo_url ? 'Replace' : 'Upload'}
            <input type="file" accept="image/*" className="hidden" disabled={logoBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadLogo(f);
                e.target.value = ''; // allow re-picking the same file
              }} />
          </label>
          {p.logo_url && (
            <button className="chip flex items-center gap-1.5 border-error text-error" disabled={logoBusy} onClick={removeLogo}>
              <Icon name="delete" size={18} /> Remove
            </button>
          )}
        </div>
      </section>
      </>)}

      {is('payouts') && (method
        ? <PayoutDetail method={method} p={p} connectOn={connectOn} save={save}
            zelleMasked={zelleMasked} onZelleChange={setZelleMasked}
            onBankSaved={(b) => setP((cur: any) => ({ ...cur, ...b }))}
            connect={{ busy: connectBusy, notice: connectNotice, start: () => void startConnect() }} />
        : <PayoutsIndex p={p} zelleMasked={zelleMasked} connectOn={connectOn} />)}

      {is('business-brand') && (
        <InvoiceStyleCard
          profile={p}
          onSave={(patch) => save(patch, { silent: true })}
        />
      )}

      {is('main') && (<>
      {inviteOpen && p.referral_code && (() => {
        // host read dynamically so the link survives the custom-domain move
        const inviteUrl = `${window.location.origin}/i/${p.referral_code}`;
        return (
          <div data-kb-fit="" className="fixed inset-0 z-50 flex items-end md:items-center md:p-6 bg-on-background/40" onClick={() => setInviteOpen(false)}>
          <div role="dialog" aria-label="Invite a contractor"
            className="mx-auto w-full max-w-lg space-y-3 rounded-t-card md:rounded-card bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] onit-sheet-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Invite a contractor</h2>
              <button aria-label="Close" className="grid h-touch w-touch place-items-center rounded-full text-on-surface-variant" onClick={() => setInviteOpen(false)}>
                <Icon name="close" size={24} />
              </button>
            </div>
            <p className="text-sm text-on-surface-variant">Share On It with another contractor.</p>
            <div className="break-all rounded-input border border-outline-variant bg-surface-container px-3 py-2.5 font-mono text-sm">
              {inviteUrl}
            </div>
            <div className="flex gap-2">
              <button className="chip flex items-center gap-1.5"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch { /* clipboard blocked */ }
                }}>
                <Icon name="content_copy" size={18} /> {copied ? 'Copied' : 'Copy link'}
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button className="chip flex items-center gap-1.5"
                  onClick={() => navigator.share({ url: inviteUrl, title: 'On It — invoices done by talking' }).catch(() => {})}>
                  <Icon name="share" size={18} /> Share
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      </>)}

      {/* Paywall kill switch: with the paywall off, only show this section to
          users with a real Stripe subscription (Manage row). Free/canceled
          users get nothing — no "Upgrade $9.99/month" CTA for something that's
          currently unlimited, and no empty Subscription card either. */}
      {is('plan') && planTier === 'founder' && (
        // Founders (a redeemed access code): no upgrade CTA, nothing to manage.
        <section className="card space-y-1">
          <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Plan</h2>
          <p className="text-sm font-semibold text-on-surface">Free access · via code</p>
          <p className="text-sm text-on-surface-variant">Unlimited invoices, estimates and expenses.</p>
        </section>
      )}

      {is('plan') && planTier !== 'founder' && (PAYWALL_ENABLED || planLive) && (
        <section className="card space-y-3">
          <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Subscription</h2>
          {planNotice && (
            <p className="flex items-center gap-2 text-sm font-semibold text-on-surface" role="status">
              <Icon name="check_circle" size={18} className="text-primary" />
              {offerNotice(planNotice)}
            </p>
          )}
          {planPaused ? (
            <>
              {/* Paused (offer). The pause starts when the paid period ends:
                  until then the tier is still paid and current_period_end is
                  the start date; once it has started the tier is free. */}
              <p className="text-sm text-on-surface-variant">
                {pausedLine(p.current_period_end, p.paused_until, !SUBSCRIBED.has(planTier))}
              </p>
              <button className="btn-primary w-full" disabled={resumeBusy} onClick={() => void resumePlan()}>
                {resumeBusy ? 'Resuming…' : 'Resume now'}
              </button>
            </>
          ) : planCanceling ? (
            <>
              <p className="text-sm text-on-surface-variant">
                {fmtPlanDate(planEnds)
                  ? `Your plan ends ${fmtPlanDate(planEnds)}. You keep everything; ${freePlanAfterLine(planLimits ?? planSummary?.freeLimits)}`
                  : `Your plan is set to end. You keep everything; ${freePlanAfterLine(planLimits ?? planSummary?.freeLimits)}`}
              </p>
              <button className="btn-primary w-full" disabled={resumeBusy} onClick={() => void resumePlan()}>
                {resumeBusy ? 'Resuming…' : 'Resume subscription'}
              </button>
              <button className="btn-outline w-full" disabled={billingBusy}
                onClick={() => billingAction('/api/billing-portal')}>
                <Icon name="settings" size={18} /> {billingBusy ? 'Opening…' : 'Manage subscription'}
              </button>
              <p className="text-sm text-on-surface-variant">Update your card in the billing portal.</p>
            </>
          ) : SUBSCRIBED.has(planTier) ? (
            <>
              <p className="text-sm text-on-surface-variant">
                {planTier === 'past_due'
                  ? 'Your last payment didn’t go through. Update your card to keep going.'
                  : planTier === 'trialing'
                    // No trial length here: trials started before the 30 → 14
                    // day change are still running. The end date is right for both
                    // (and the same wording as the paywall disclosure).
                    ? (fmtDate(p.trial_ends_at)
                      ? `Free until ${fmtDate(p.trial_ends_at)}. Then $9.99/month, renews monthly until you cancel.`
                      : 'You’re on a free trial. Then $9.99/month, renews monthly until you cancel.')
                    : `$9.99/month, renews monthly until you cancel${fmtDate(p.current_period_end) ? `. Next renewal ${fmtDate(p.current_period_end)}` : ''}.`}
              </p>
              <button className="btn-outline w-full" disabled={billingBusy}
                onClick={() => billingAction('/api/billing-portal')}>
                <Icon name="settings" size={18} /> {billingBusy ? 'Opening…' : 'Manage subscription'}
              </button>
              <p className="text-sm text-on-surface-variant">Update your card in the billing portal.</p>
              {/* Cancel is two taps from Plan (spec rule 3): this, then the
                  cancel screen's own button. A real button, never a link. */}
              <button className="btn-outline w-full" onClick={() => router.push('/settings/plan/cancel')}>
                Cancel subscription
              </button>
            </>
          ) : (
            <>
              {/* Free plan usage (free / canceled, paywall on): both counts.
                  freePlanSummary is null when the limits aren't known. */}
              {/* The only part that waits for /api/access (the counts): a
                  fixed-height row with a placeholder, so nothing moves when
                  it lands. */}
              {(!access || freePlanSummary(access)) && (
                <div className="flex min-h-5 items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-on-surface">Free plan</p>
                  {access
                    ? <p className="text-right text-sm text-on-surface-variant">{freePlanSummary(access)}</p>
                    : <span aria-hidden className="h-4 w-40 animate-pulse self-center rounded bg-surface-container" />}
                </div>
              )}
              <p className="text-sm text-on-surface-variant">Go unlimited — invoices, estimates, expenses and reminders.</p>
              {subsOn && (
                <>
                  {/* Subscription disclosure — plain, body-size, visible before the Stripe
                      redirect. Material terms match /api/checkout: a TRIAL_DAYS trial for
                      first-time customers only (lib/trial.ts), otherwise billed today. */}
                  <p className="text-sm text-on-surface-variant">
                    {/* The paywall's disclosure, with "in Settings" → "below". */}
                    {trialEligible(p)
                      ? `Free until ${fmtDate(trialDates().end.toISOString())}. Then $9.99/month, renews monthly until you cancel. Cancel anytime below.`
                      : '$9.99/month, renews monthly until you cancel. Cancel anytime below.'}
                  </p>
                  <button className="btn-primary w-full" disabled={billingBusy}
                    onClick={() => billingAction('/api/checkout')}>
                    {billingBusy ? 'Opening…' : trialEligible(p) ? 'Start 14-day free trial' : 'Subscribe — $9.99/month'}
                  </button>
                </>
              )}
              <p className="text-sm text-on-surface-variant">
                <a href="/terms" className="underline">Terms</a>
                {' · '}
                <a href="/privacy" className="underline">Privacy</a>
                {' · '}
                <a href="/eula" className="underline">EULA</a>
              </p>
            </>
          )}
          {billingNotice && <p className="text-sm text-on-surface-variant">{billingNotice}</p>}
          <div className="space-y-2 border-t border-outline-variant/30 pt-3">
            <p className="text-sm font-semibold text-on-surface">Have a code?</p>
            {/* Redeemed → re-read the profile (the Plan screen reads its tier)
                and access, so this section turns into the founder Plan row. */}
            <CodeEntry onRedeemed={() => {
              setTimeout(() => {
                if (p?.id) {
                  void supabase.from('profiles').select('*').eq('id', p.id).maybeSingle()
                    .then(({ data }) => { if (data) setP(data); }, () => undefined);
                }
                void fetch('/api/access').then((r) => (r.ok ? r.json() : null)).then((a) => { if (a) setAccess(a); }).catch(() => {});
              }, 1200);
            }} />
          </div>
        </section>
      )}

      {is('main') && (<>



      </>)}

      {is('notifications') && (
      <section className="card space-y-2">
        <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Notifications</h2>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-on-surface">Payment alerts &amp; reminders</p>
            <p className="text-sm text-on-surface-variant">
              A notification when a client pays online or Stripe needs something, and another when an invoice sits unpaid for 2 days.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={Boolean(pushOn)}
            aria-label="Payment alerts and reminders"
            // Off and not usable here → can't be switched on (the hint below says
            // why). If it's somehow on, it stays switchable so it can go off.
            disabled={pushBusy || pushOn === null || (!pushOn && pushAvail !== 'ready')}
            onClick={togglePush}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50
              ${pushOn ? 'bg-primary-container' : 'bg-outline-variant'}`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-surface-container-lowest shadow left-1 transition-transform duration-[160ms]
                ${pushOn ? 'translate-x-6' : ''}`}
            />
          </button>
        </div>
        {pushOn && p && (
          // Sub-toggle for the draft nudge (profiles.notify_draft_nudges, safe
          // column). Only meaningful once this device gets pushes at all.
          <div className="flex items-center justify-between gap-3 border-t border-outline-variant/30 pt-3">
            <div>
              <p className="text-sm font-semibold text-on-surface">Remind me about unsent drafts</p>
              <p className="text-sm text-on-surface-variant">
                A notification the day after an invoice is drafted but not sent.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={p.notify_draft_nudges !== false}
              aria-label="Remind me about unsent drafts"
              onClick={() => void save({ notify_draft_nudges: p.notify_draft_nudges === false })}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors
                ${p.notify_draft_nudges !== false ? 'bg-primary-container' : 'bg-outline-variant'}`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-surface-container-lowest shadow left-1 transition-transform duration-[160ms]
                  ${p.notify_draft_nudges !== false ? 'translate-x-6' : ''}`}
              />
            </button>
          </div>
        )}
        {!pushOn && pushAvail === 'needs-install' && (
          <p className="text-sm text-on-surface-variant">
            Notifications on iPhone and iPad need On It added to the Home Screen: tap Share in
            Safari, then Add to Home Screen, and open On It from there.
          </p>
        )}
        {!pushOn && pushAvail === 'denied' && (
          <p className="text-sm text-on-surface-variant">
            Notifications are blocked for On It. Turn them on in your phone&apos;s Settings, under Notifications, then come back here.
          </p>
        )}
        {!pushOn && pushAvail === 'unsupported' && (
          <p className="text-sm text-on-surface-variant">This browser can&apos;t show notifications.</p>
        )}
        {pushTestOn && (
          // Preview only (the endpoint 404s elsewhere). Writes nothing: builds
          // the event from your latest sent invoice and sends it to this
          // environment's devices.
          <div className="mt-2 space-y-2 border-t border-outline-variant/30 pt-3">
            <p className="text-sm font-semibold text-on-surface">Send test notification (preview only)</p>
            <div className="flex flex-wrap gap-2">
              {([
                ['Paid in full', { type: 'payment', variant: 'full' }],
                ['Partial payment', { type: 'payment', variant: 'partial' }],
                ['Card payments paused', { type: 'connect_problem', problem: 'charges_paused' }],
                ['Needs a detail', { type: 'connect_problem', problem: 'details_needed' }],
                ['Stripe payouts paused', { type: 'connect_problem', problem: 'payouts_paused' }],
                ['Disconnected', { type: 'connect_problem', problem: 'disconnected' }],
                ['Invoice opened', { type: 'viewed' }],
                ['Draft reminder', { type: 'draft' }],
                // The real run, own drafts only; claims the draft for good.
                ['Run draft notification (real rules)', { type: 'draft_run' }],
              ] as const).map(([label, body]) => (
                <button key={label} className="chip" onClick={() => void sendTestPush(body)}>{label}</button>
              ))}
            </div>
            {pushTestMsg && <p className="text-sm text-on-surface-variant">{pushTestMsg}</p>}
          </div>
        )}
      </section>

      )}

      {is('help') && (
        <SettingsGroup title="Help">
          {/* Opens the same tutorial picker as the header "How On It works" pill. */}
          <SettingsRow icon="play_arrow" title="Replay the walkthrough" onClick={() => window.dispatchEvent(new Event(OPEN_TOUR_PICKER))} />
          <SettingsRow icon="chat_bubble" title="Tell us about On It" href="/settings/help/feedback" />
          {/* §L Q9 */}
          <SettingsRow icon="mail" title="Contact us" value="brandon@dynastyweb.co" href="mailto:brandon@dynastyweb.co?subject=On%20It%20feedback" />
          <SettingsRow icon="description" title="Terms" href="/terms" />
          <SettingsRow icon="lock" title="Privacy" href="/privacy" />
          <SettingsRow icon="description" title="EULA" href="/eula" />
        </SettingsGroup>
      )}

      {is('login') && (<>
      <SettingsGroup title="This device">
        <SettingsRow icon="lock_open" title="Sign out"
          onClick={async () => {
          clearChatStorage(p?.id);
          // Forget this device first (needs the session): a shared phone must
          // not keep getting this account's payment alerts after sign-out.
          await unsubscribeFromPush().catch(() => false);
          // scope 'local' signs out THIS device only. supabase-js defaults to
          // 'global', which deletes every session for the account, so signing
          // out on one device logged the user out on all their others
          // (refresh_token_not_found in the auth logs, 2026-10-15).
          await supabase.auth.signOut({ scope: 'local' });
          router.push('/login');
        }} />
      </SettingsGroup>

      {/* Danger zone — deliberately its own error-bordered card, separated from
          Sign out, gated behind a typed "DELETE" confirmation. */}
      <section className="card space-y-3 border-error/40">
        <h2 className="text-label-lg font-semibold uppercase tracking-wide text-error">Delete account</h2>
        <p className="text-sm text-on-surface-variant">
          This permanently deletes your account, your invoices, expenses, customer records,
          and every file you’ve uploaded. It cannot be undone — your invoices cannot be recovered.
          Any active subscription is canceled as part of deletion.
        </p>
        {!deleteOpen ? (
          <button
            className="inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-button border border-error px-4 font-semibold text-error active:scale-[0.97] transition-transform"
            onClick={() => { setDeleteOpen(true); setDeleteError(''); }}>
            <Icon name="delete_forever" size={18} /> Delete account
          </button>
        ) : (
          <>
            {accountEmail && (
              <p className="text-sm text-on-surface-variant">
                You are deleting the account for{' '}
                <span className="font-semibold text-on-background">{accountEmail}</span>.
              </p>
            )}
            <label htmlFor="delete-confirm" className="text-sm text-on-surface-variant">
              Type <span className="font-semibold text-on-background">DELETE</span> to confirm.
            </label>
            <input id="delete-confirm" className="input" autoComplete="off" autoCapitalize="characters"
              placeholder="DELETE" value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-outline flex-1"
                onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); setDeleteError(''); }}>
                Cancel
              </button>
              <button
                className="flex-1 inline-flex min-h-touch items-center justify-center gap-2 rounded-button bg-error px-4 font-semibold text-white disabled:opacity-40"
                disabled={deleteConfirm !== 'DELETE' || deleteBusy}
                onClick={confirmDelete}>
                {deleteBusy ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
            {deleteError && <p className="text-sm text-error">{deleteError}</p>}
          </>
        )}
      </section>
      </>)}

    </>
  );
  // Laptop: the design's split — the list on the left, the section's page on the
  // right. Both panes render the same markup the phone column renders, so every
  // existing section screen is reused unchanged.
  if (split) return (
    <SplitView
      list={
        // No `overflow-x-hidden` here: on one axis hidden makes the other compute
        // to auto, which turned this wrapper into its own scroll container — it
        // then shrank to the pane and swallowed the overflow, so the pane never
        // scrolled and the last rows sat below the fold.
        <PageContainer size="narrow" className="space-y-4 py-4 xl:max-w-none xl:px-0 xl:pb-2 xl:pt-0">{listPane}</PageContainer>
      }
      detail={detailPane && (
        <div key={sec}><PageContainer size="narrow" className="space-y-4 py-4 xl:max-w-none xl:px-0 xl:pb-8 xl:pt-0">{detailPane}</PageContainer></div>
      )}
      emptyDetail={
        // The design's frames always show a section, so there is no empty-detail
        // copy to reuse here: an icon-only placeholder, no new strings (the same
        // call the Invoices split made).
        <div aria-hidden className="xl:mt-24 grid place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-surface-container text-outline-variant">
            <Icon name="settings" size={30} />
          </span>
        </div>
      }
    />
  );
  return (
    <PageContainer size="narrow" className={`space-y-4 overflow-x-hidden py-4${is('main') ? ' xl:mx-0 xl:h-full xl:w-[440px] xl:max-w-none xl:overflow-visible xl:border-r xl:border-outline-variant/35 xl:px-0 xl:pb-8 xl:pl-6 xl:pr-5 xl:pt-6' : ''}`}>
      {sec === 'main' ? listPane : detailPane}
    </PageContainer>
  );
}
