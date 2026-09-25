'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import SettingsSkeleton from '@/components/SettingsSkeleton';
import { createClient } from '@/lib/supabase/client';
import { PALETTE, buildTheme, onColor } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey, TEMPLATE_LABELS } from '@/lib/pdf/templates';
import { getPushSubscription, subscribeToPush, unsubscribeFromPush } from '@/lib/push';
import { clearChatStorage, clearAllChatStorage } from '@/lib/chat-storage';
import { PAYWALL_ENABLED } from '@/lib/paywall';

const TEMPLATES: TemplateKey[] = ['classic', 'sidebar', 'industrial', 'friendly'];

// PayPal / Cash App / Venmo are plain profiles columns saved through the shared
// save() path (on blur), exactly like every other field on this page. Zelle is
// NOT here — it keeps its encrypted /api/zelle path.
// Users paste full URLs and prefixed handles; each field normalizes ON BLUR to
// the bare handle that gets stored, stripping the site / scheme / www and the
// method's sigil. Zelle is intentionally NOT normalized — it's a phone or email,
// both valid as typed.
const normalizePaypal = (v: string) =>
  v.trim().replace(/^(?:https?:\/\/)?(?:www\.)?paypal\.me\//i, '').replace(/\/+$/, '');
const normalizeCashapp = (v: string) =>
  v.trim().replace(/^(?:https?:\/\/)?(?:www\.)?cash\.app\//i, '').replace(/^\$/, '').replace(/\/+$/, '');
const normalizeVenmo = (v: string) =>
  v.trim().replace(/^(?:https?:\/\/)?(?:www\.)?venmo\.com\/u\//i, '').replace(/^@/, '').replace(/\/+$/, '');
// A bare PayPal username has no dots or slashes; anything with them (e.g. a
// domain like "mypaypal.com") would build a broken paypal.me/<...> link.
const isValidPaypalHandle = (v: string) => !/[./\\]/.test(v);

const PAY_HANDLES = [
  { key: 'paypal_me',      label: 'PayPal',   hint: 'paypal.me/username', placeholder: 'Enter your paypal.me username', mark: '/brands/paypal.svg',  color: '#003087', normalize: normalizePaypal },
  { key: 'cashapp_tag',    label: 'Cash App', hint: '$cashtag',           placeholder: 'Enter your $cashtag',           mark: '/brands/cashapp.svg', color: '#00D632', normalize: normalizeCashapp },
  { key: 'venmo_username', label: 'Venmo',    hint: '@username',          placeholder: 'Enter your username',           mark: '/brands/venmo.svg',   color: '#008CFF', normalize: normalizeVenmo },
] as const;

// Brand marks: Simple Icons monochrome glyphs in public/brands/, recolored to the
// brand's own color. The SVG is a CSS mask (its shape only) and the brand color
// is the fill, so the glyph shape is never restyled. Slot sizing is unchanged.
function BrandMark({ src, color }: { src: string; color: string }) {
  return (
    <span aria-hidden
      className="h-11 w-11 shrink-0"
      style={{
        display: 'inline-block',
        backgroundColor: color,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }} />
  );
}

// A live subscription (any of these) gets the "Manage subscription" row → Stripe
// Billing Portal. 'free' and 'canceled' get the upgrade CTA; 'founder' hides the
// whole section (grants bypass billing entirely).
const SUBSCRIBED = new Set(['trialing', 'active', 'past_due']);

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

export default function Settings() {
  const supabase = createClient();
  const router = useRouter();
  const [p, setP] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  // save() applies optimistically; on a failed write it reverts and raises this,
  // mirroring the Saved banner so a swallowed error can no longer look like success.
  const [saveFailed, setSaveFailed] = useState(false);
  // Inline PayPal.me validation message (username, not a URL/domain).
  const [paypalError, setPaypalError] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  // Zelle is encrypted at rest; only /api/zelle (server-side) touches it.
  const [zelleMasked, setZelleMasked] = useState<string | null>(null);
  const [zelleInput, setZelleInput] = useState('');
  const [zelleBusy, setZelleBusy] = useState(false);
  // real subscription state, not a fire-and-forget button
  const [pushOn, setPushOn] = useState<boolean | null>(null); // null = checking
  const [pushBusy, setPushBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [redirecting, setRedirecting] = useState(false); // decided to leave — never hang on Loading
  // Auth resolution exceeded AUTH_TIMEOUT_MS without settling (see effect) — show
  // an actionable state instead of an indefinite spinner. A late-resolving `p`
  // supersedes it (render order below).
  const [authStuck, setAuthStuck] = useState(false);
  // Subscription: tier drives manage-vs-upgrade; founder hides the section.
  const [access, setAccess] = useState<{ hasAccess: boolean; tier: string; invoiceCount: number } | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingNotice, setBillingNotice] = useState('');
  // Stripe Connect: busy covers both the onboarding redirect and a status
  // refresh; notice carries the 503/failure message inline (billing pattern).
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectNotice, setConnectNotice] = useState('');
  // Synchronous in-flight guard for startConnect (see there).
  const connectInFlight = useRef(false);
  // Is Connect switched on in this deployment (GET /api/connect/status)?
  // null = not known yet. Anything but a confirmed true renders the disabled
  // "Coming soon" card — fail closed on error / rate limit.
  const [connectOn, setConnectOn] = useState<boolean | null>(null);
  // Account deletion: a two-step, typed-confirmation flow kept well away from
  // Sign out. Fires POST /api/delete-account only when the input reads DELETE.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    let active = true;
    // settled + timer follow the reset-password convention: if the auth
    // resolution below hasn't reached a terminal decision (render p, or redirect)
    // within AUTH_TIMEOUT_MS, treat it as unresolved and show the actionable
    // state. Cleared the moment it settles, and on unmount.
    let settled = false;
    const stuckTimer = setTimeout(() => { if (active && !settled) setAuthStuck(true); }, AUTH_TIMEOUT_MS);
    const settle = () => { settled = true; clearTimeout(stuckTimer); };
    (async () => {
      try {
        // Fast local gate FIRST: getSession() reads the persisted session from
        // storage with no network round-trip (unlike getUser() below), so a
        // genuinely signed-out user is sent to /login immediately and the
        // redirect can never be blocked by a slow or stalled auth call — the
        // documented getUser() hang no longer leaves a signed-out user sitting
        // on "Loading…". Mirrors chat's getSession-before-getUser convention.
        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;
        if (!session) { settle(); setRedirecting(true); router.replace('/login'); return; }

        // Auth-gated page: a signed-out user (or a failed/expired auth check)
        // must land on login, never sit on "Loading…". getUser() can reject on
        // a token-refresh/network failure, so the whole check is guarded — any
        // throw routes to /login. A getUser() that never settles (the observed
        // Brave/Shields stall, cause unidentified) is caught by stuckTimer
        // above, not by this try/catch.
        const { data: { user }, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || !user) { settle(); setRedirecting(true); router.replace('/login'); return; }

        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (!active) return;
        // Signed in but no profile yet → finish onboarding (matches chat's pattern).
        if (!data) { settle(); setRedirecting(true); router.replace('/onboarding'); return; }
        settle();
        setAuthStuck(false); // late resolve after a timeout: recover and render
        setP(data);

        // Stripe Connect return trip. ?connect=refresh means the Account Link
        // expired or was reused — get a fresh one (Stripe's documented flow).
        // ?connect=return means the seller left onboarding, finished or not —
        // re-read the status. Also re-read on any load while setup is
        // incomplete, so a finished-elsewhere onboarding shows up. The param is
        // dropped from the URL first so a reload can't loop the redirect.
        // All of it is skipped unless the server says Connect is on here.
        const connectParam = new URLSearchParams(window.location.search).get('connect');
        if (connectParam) router.replace('/settings');
        let on = false;
        try {
          const c = await fetch('/api/connect/status', { method: 'GET' });
          on = c.ok && (await c.json())?.enabled === true;
        } catch { /* stays off */ }
        if (!active) return;
        setConnectOn(on);
        if (on) {
          if (connectParam === 'refresh') {
            void startConnect();
          } else if (data.stripe_account_id && (connectParam === 'return' || !data.stripe_charges_enabled)) {
            void refreshConnect();
          }
        }

        try {
          const res = await fetch('/api/zelle');
          const z = await res.json();
          if (active && z.set) setZelleMasked(z.masked);
        } catch { /* leave unset */ }
        try {
          const a = await fetch('/api/access');
          if (active && a.ok) setAccess(await a.json());
        } catch { /* leave null → the section simply doesn't render */ }
        if (active) setPushOn(Boolean(await getPushSubscription()));
      } catch {
        // Auth/network failed (rejected) — don't hang; send to login.
        if (!active) return;
        settle();
        setRedirecting(true);
        router.replace('/login');
      }
    })();
    return () => { active = false; clearTimeout(stuckTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveZelle() {
    setZelleBusy(true);
    try {
      const res = await fetch('/api/zelle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: zelleInput }),
      });
      const z = await res.json();
      if (res.ok) {
        setZelleMasked(z.set ? z.masked : null);
        setZelleInput('');
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    } finally {
      setZelleBusy(false);
    }
  }

  async function save(patch: Record<string, unknown>) {
    const prev = p;                         // snapshot for rollback on failure
    setP({ ...p, ...patch });               // optimistic
    const { error } = await supabase.from('profiles').update(patch).eq('id', prev.id);
    if (error) {
      setP(prev);                           // revert — the write did not land
      setSaveFailed(true);
      setTimeout(() => setSaveFailed(false), 2500);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  // Explicit confirm for the three profile-backed handles. The per-field onBlur
  // saves still fire; this is an additional "save all three at once" button. Zelle
  // is deliberately excluded — it keeps its own encrypted Save/Remove path.
  function savePaymentHandles() {
    const paypal = (p.paypal_me ?? '').trim();
    if (paypal && !isValidPaypalHandle(paypal)) {
      setPaypalError('Enter just your PayPal.me username — no URLs, dots, or slashes.');
      return;
    }
    save({
      paypal_me: paypal || null,
      cashapp_tag: p.cashapp_tag || null,
      venmo_username: p.venmo_username || null,
    });
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
        if (await unsubscribeFromPush(supabase)) setPushOn(false);
      } else {
        if (await subscribeToPush(supabase, p.id)) setPushOn(true);
      }
    } finally {
      setPushBusy(false);
    }
  }

  // Subscribed users → Stripe Billing Portal (manage/cancel/update card).
  // Free/canceled users → Checkout (start the $9.99/mo, 30-day-free-trial plan).
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
  const theme = p.background_color ? buildTheme(p.brand_colors, p.background_color) : null;

  return (
    <div className="space-y-4 px-4 py-4 overflow-x-hidden">
      {saved && <div className="rounded-input bg-paid-container p-2 text-center text-sm font-semibold text-paid">Saved</div>}
      {saveFailed && <div className="rounded-input bg-error-container p-2 text-center text-sm font-semibold text-error-on-container">Couldn’t save — check your connection and try again.</div>}

      <section className="card space-y-3">
        <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Business</h2>
        <input className="input" value={p.business_name ?? ''}
          onChange={(e) => setP({ ...p, business_name: e.target.value })}
          onBlur={(e) => save({ business_name: e.target.value })} />
        <input className="input" placeholder="Website"
          value={p.website_url ?? ''} onChange={(e) => setP({ ...p, website_url: e.target.value })}
          onBlur={(e) => save({ website_url: e.target.value || null })} />
        <input className="input" placeholder="Slogan"
          value={p.slogan ?? ''} onChange={(e) => setP({ ...p, slogan: e.target.value })}
          onBlur={(e) => save({ slogan: e.target.value || null })} />
      </section>

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

      {/* ── Block 1 — Stripe Connect, its own cream-tinted card ────────
          Four states from the profile's mirrored Stripe status:
            not connected                        → Connect (creates the account)
            can't charge, seller owes a due item → Finish setup (resumes onboarding)
            can't charge, nothing due from them  → In review, no button; Stripe is
                                                   verifying. Status is re-read on
                                                   every load until it flips.
            charges enabled                      → Connected + the card-payments opt-in
          The stripe_* columns are server-written only; the switch saves
          card_payments_enabled through the normal save() path.
          Gated on connectOn: unless GET /api/connect/status confirms Connect
          is switched on in this deployment (STRIPE_CONNECT_ENABLED), render
          the original disabled "Coming soon" card instead — no tappable
          Connect, no stored-account state, no card switch. */}
      {connectOn !== true ? (
      <section className="card space-y-3" style={{ background: '#fff8f0' }}>
        <div className="flex items-center gap-3">
          <BrandMark src="/brands/stripe.svg" color="#635BFF" />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-bold text-on-background">Stripe</h3>
            <p className="font-body text-sm text-on-surface-variant">Accept cards &amp; online payments</p>
          </div>
          <button type="button" disabled
            className="shrink-0 rounded-button px-4 py-2 font-body text-sm font-semibold text-white pointer-events-none"
            style={{ background: '#5f09b2' }}>
            Coming soon
          </button>
        </div>
      </section>
      ) : (
      <section className="card space-y-3" style={{ background: '#fff8f0' }}>
        <div className="flex items-center gap-3">
          <BrandMark src="/brands/stripe.svg" color="#635BFF" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-xl font-bold text-on-background">Stripe</h3>
              {p.stripe_account_id && (
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-body text-xs font-semibold ${p.stripe_charges_enabled ? 'bg-paid-container text-paid' : 'bg-surface-container text-on-surface-variant'}`}>
                  {p.stripe_charges_enabled ? 'Connected' : p.stripe_details_submitted ? 'In review' : 'Setup incomplete'}
                </span>
              )}
            </div>
            <p className="font-body text-sm text-on-surface-variant">Accept cards &amp; online payments</p>
          </div>
          {/* Action only when the seller has something to do: not yet connected,
              or a requirement is currently/past due on them. Never while in review. */}
          {!p.stripe_charges_enabled && (!p.stripe_account_id || !p.stripe_details_submitted) && (
            <button type="button" disabled={connectBusy} onClick={startConnect}
              className="shrink-0 rounded-button px-4 py-2 font-body text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: '#5f09b2' }}>
              {connectBusy ? 'Opening…' : p.stripe_account_id ? 'Finish setup' : 'Connect'}
            </button>
          )}
        </div>
        {p.stripe_account_id && !p.stripe_charges_enabled && (
          <p className="font-body text-sm text-on-surface-variant">
            {p.stripe_details_submitted
              ? 'Stripe is reviewing your account. Card payments turn on once they approve it.'
              : 'Finish setting up your Stripe account to start taking card payments.'}
          </p>
        )}
        {p.stripe_charges_enabled && (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="font-body text-sm text-on-surface-variant">
                Let clients pay invoices by card. Money goes straight to your Stripe account; Stripe’s card fees apply.
              </p>
              <button
                role="switch"
                aria-checked={Boolean(p.card_payments_enabled)}
                aria-label="Accept card payments"
                onClick={() => save({ card_payments_enabled: !p.card_payments_enabled })}
                className={`relative h-8 w-14 shrink-0 rounded-full transition-colors
                  ${p.card_payments_enabled ? 'bg-primary-container' : 'bg-outline-variant'}`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-surface-container-lowest shadow transition-all
                    ${p.card_payments_enabled ? 'left-7' : 'left-1'}`}
                />
              </button>
            </div>
            {!p.stripe_payouts_enabled && (
              <p className="font-body text-sm text-on-surface-variant">
                Payouts are paused until Stripe has everything it needs. Check your Stripe dashboard.
              </p>
            )}
          </>
        )}
        {connectNotice && <p className="font-body text-sm text-on-surface-variant">{connectNotice}</p>}
      </section>
      )}

      {/* ── Block 2 — PayPal / Cash App / Venmo, one card, three rows ──
          Wiring UNCHANGED: per-field save() on blur (PayPal strips/validates),
          and the bottom Save button fires the existing savePaymentHandles() —
          the same three-field save(). Zelle is deliberately NOT in this group. */}
      <section className="card space-y-5">
        {PAY_HANDLES.map(({ key, label, hint, placeholder, mark, color, normalize }) => {
          const on = Boolean(p[key]);
          const isPaypal = key === 'paypal_me';
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-3">
                <BrandMark src={mark} color={color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-xl font-bold text-on-background">{label}</h3>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-body text-xs font-semibold ${on ? 'bg-paid-container text-paid' : 'bg-surface-container text-on-surface-variant'}`}>
                      {on ? 'Configured' : 'Not set'}
                    </span>
                  </div>
                  <p className="font-body text-sm font-semibold" style={{ color: '#735c00' }}>{hint}</p>
                </div>
              </div>
              {/* PayPal & Venmo get flagged by password-manager extensions as
                  credential fields. autoComplete="off" alone didn't clear the
                  indicator (Chrome ignores it on such fields), so we also tell
                  1Password (data-1p-ignore) and LastPass (data-lpignore) to skip
                  them. Not autoComplete="username" — that would mark the field AS
                  a credential. Cash App isn't flagged, so it's left untouched. */}
              <input className="input" placeholder={placeholder}
                {...(key === 'cashapp_tag'
                  ? {}
                  : { autoComplete: 'off', 'data-1p-ignore': true, 'data-lpignore': 'true' })}
                value={p[key] ?? ''}
                onChange={(e) => {
                  setP({ ...p, [key]: e.target.value }); // store raw while typing
                  if (isPaypal) setPaypalError('');      // clear as they edit
                }}
                onBlur={(e) => {
                  const v = normalize(e.target.value);   // → bare handle, on blur
                  if (isPaypal && v && !isValidPaypalHandle(v)) {
                    setPaypalError('Enter just your PayPal.me username — no URLs, dots, or slashes.');
                    setP({ ...p, [key]: v });            // show the normalized (still-invalid) value
                    return;                              // don't save a handle that would build a broken link
                  }
                  save({ [key]: v || null });            // save() sets p[key]=v, so the field shows the bare handle
                }} />
              {isPaypal && paypalError && <p className="font-body text-xs text-error">{paypalError}</p>}
            </div>
          );
        })}
        {/* Full-width gold Save — fires the SAME savePaymentHandles() as before. */}
        <button className="btn-primary w-full" onClick={savePaymentHandles}>Save PayPal, Cash App &amp; Venmo</button>
      </section>

      {/* ── Block 3 — Zelle, its own card ─────────────────────────────
          Wiring UNCHANGED: encrypted column via /api/zelle (saveZelle), masked
          placeholder, own Save/Remove button. Never folded into the group save. */}
      <section className="card space-y-3">
        <div className="flex items-center gap-3">
          <BrandMark src="/brands/zelle.svg" color="#6D1ED4" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-xl font-bold text-on-background">Zelle</h3>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-body text-xs font-semibold ${zelleMasked ? 'bg-paid-container text-paid' : 'bg-surface-container text-on-surface-variant'}`}>
                {zelleMasked ? 'Configured' : 'Not set'}
              </span>
            </div>
            <p className="font-body text-sm font-semibold" style={{ color: '#735c00' }}>Phone or email</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input className="input flex-1"
            placeholder={zelleMasked ? `Zelle: ${zelleMasked}` : 'Phone or email'}
            value={zelleInput} onChange={(e) => setZelleInput(e.target.value)} />
          <button className="btn-primary px-4 py-2 text-sm" disabled={zelleBusy || (!zelleInput.trim() && !zelleMasked)}
            onClick={saveZelle}>
            {zelleBusy ? 'Saving…' : zelleMasked && !zelleInput.trim() ? 'Remove' : 'Save'}
          </button>
        </div>
        <p className="font-body text-xs text-on-surface-variant/80">Use the phone number or email enrolled with your bank’s Zelle — it must match, or payments won’t reach you. Stored encrypted; leave empty and tap Remove to clear.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Invoice style</h2>
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
          {TEMPLATES.map((t) => (
            <button key={t} className={`chip shrink-0 ${p.invoice_template === t ? 'chip-selected' : ''}`}
              onClick={() => save({ invoice_template: t })}>{TEMPLATE_LABELS[t]}</button>
          ))}
        </div>
        <div className="grid grid-cols-5 justify-items-start gap-2">
          {PALETTE.map(({ hex, name }) => {
            const sel = p.brand_colors?.includes(hex);
            return (
              <button key={hex} title={name}
                className={`h-8 w-8 rounded-full border ${sel ? 'border-primary-container ring-gold-selected' : 'border-outline-variant'}`}
                style={{ background: hex }}
                onClick={() => {
                  const cur: string[] = p.brand_colors ?? [];
                  const next = sel ? cur.filter((c) => c !== hex) : cur.length >= 3 ? cur : [...cur, hex];
                  save({ brand_colors: next, background_color: next.includes(p.background_color) ? p.background_color : null });
                }} />
            );
          })}
        </div>
        {(p.brand_colors?.length ?? 0) >= 2 && (
          <div className="flex gap-2">
            {p.brand_colors.map((hex: string) => (
              <button key={hex}
                className={`flex-1 rounded-xl border py-2 text-sm ${p.background_color === hex ? 'border-primary-container ring-gold-selected font-bold' : 'border-outline-variant font-medium'}`}
                style={{ background: hex, color: onColor(hex) }}
                onClick={() => save({ background_color: hex })}>
                {p.background_color === hex ? 'Background — selected' : 'Set background'}
              </button>
            ))}
          </div>
        )}
        {theme && (
          <div className="overflow-hidden rounded-input border border-outline-variant" style={{ height: 1123 * 0.36 }}>
            <div style={{ transform: 'scale(0.36)', transformOrigin: 'top left', width: 794, pointerEvents: 'none' }}>
              <InvoiceTemplate template={p.invoice_template} theme={theme} data={{
                kind: 'invoice', invoiceNumber: 1, businessName: p.business_name,
                logoUrl: p.logo_url, websiteUrl: p.website_url, slogan: p.slogan,
                clientName: 'Sample Client',
                lineItems: [{ description: 'Service call + labor', qty: 1, unit_price: 250 }],
                subtotal: 250, taxRate: 0, taxAmount: 0, total: 250,
                issuedDate: new Date().toLocaleDateString(),
                cashappTag: p.cashapp_tag, paypalMe: p.paypal_me, venmoUsername: p.venmo_username,
              }} />
            </div>
          </div>
        )}
      </section>

      {p.referral_code && (() => {
        // host read dynamically so the link survives the custom-domain move
        const inviteUrl = `${window.location.origin}/i/${p.referral_code}`;
        return (
          <section className="card space-y-3">
            <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Invite</h2>
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
          </section>
        );
      })()}

      {/* Paywall kill switch: with the paywall off, only show this section to
          users with a real Stripe subscription (Manage row). Free/canceled
          users get nothing — no "Upgrade $9.99/month" CTA for something that's
          currently unlimited, and no empty Subscription card either. */}
      {access && access.tier !== 'founder' && (PAYWALL_ENABLED || SUBSCRIBED.has(access.tier)) && (
        <section className="card space-y-3">
          <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Subscription</h2>
          {SUBSCRIBED.has(access.tier) ? (
            <>
              <p className="text-sm text-on-surface-variant">
                {access.tier === 'past_due'
                  ? 'Your last payment didn’t go through. Update your card to keep going.'
                  : access.tier === 'trialing'
                    ? `You’re on your 30-day free trial — $9.99/month${fmtDate(p.trial_ends_at) ? `, first charge ${fmtDate(p.trial_ends_at)}` : ''}.`
                    : `You’re subscribed at $9.99/month${fmtDate(p.current_period_end) ? ` — renews ${fmtDate(p.current_period_end)}` : ''}.`}
              </p>
              <button className="btn-outline w-full" disabled={billingBusy}
                onClick={() => billingAction('/api/billing-portal')}>
                <Icon name="settings" size={18} /> {billingBusy ? 'Opening…' : 'Manage subscription'}
              </button>
              <p className="text-sm text-on-surface-variant">Cancel or update your card in the billing portal.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-on-surface-variant">Go unlimited — invoices, quotes, and reminders.</p>
              {/* Subscription disclosure — plain, body-size, visible before the Stripe
                  redirect. Material terms match trial_period_days: 30 in /api/checkout. */}
              <p className="text-sm text-on-surface-variant">
                30-day free trial, then $9.99/month, recurring. Cancel anytime.
              </p>
              <button className="btn-primary w-full" disabled={billingBusy}
                onClick={() => billingAction('/api/checkout')}>
                {billingBusy ? 'Opening…' : 'Upgrade — $9.99/month'}
              </button>
              <p className="text-sm text-on-surface-variant">
                <a href="/terms" className="underline">Terms</a>
                {' · '}
                <a href="/privacy" className="underline">Privacy</a>
              </p>
            </>
          )}
          {billingNotice && <p className="text-sm text-on-surface-variant">{billingNotice}</p>}
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Records</h2>
        <p className="text-sm text-on-surface-variant">Every invoice and receipt, archived automatically — search and reopen any PDF.</p>
        <button className="btn-outline w-full text-primary" onClick={() => router.push('/vault')}>
          <Icon name="folder" size={18} /> Vault
        </button>
      </section>

      <section className="card space-y-2">
        <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Notifications</h2>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-on-surface-variant">Payment reminders when an invoice goes unpaid for 2 days.</p>
          <button
            role="switch"
            aria-checked={Boolean(pushOn)}
            aria-label="Payment reminders"
            disabled={pushBusy || pushOn === null}
            onClick={togglePush}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50
              ${pushOn ? 'bg-primary-container' : 'bg-outline-variant'}`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-surface-container-lowest shadow transition-all
                ${pushOn ? 'left-7' : 'left-1'}`}
            />
          </button>
        </div>
      </section>

      <button className="w-full py-3 text-sm text-error underline"
        onClick={async () => { clearChatStorage(p?.id); await supabase.auth.signOut(); router.push('/login'); }}>
        Sign out
      </button>

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

      <div className="flex justify-center gap-4 text-sm text-on-surface-variant">
        <a href="/terms" className="underline">Terms</a>
        <a href="/privacy" className="underline">Privacy</a>
      </div>
      <p className="pb-4 text-center text-xs text-on-surface-variant/60">On It · a Dynasty Web product · $9.99/month</p>
    </div>
  );
}
