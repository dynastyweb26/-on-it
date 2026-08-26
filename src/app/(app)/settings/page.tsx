'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { PALETTE, buildTheme, onColor } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey, TEMPLATE_LABELS } from '@/lib/pdf/templates';
import { getPushSubscription, subscribeToPush, unsubscribeFromPush } from '@/lib/push';
import { clearChatStorage, clearAllChatStorage } from '@/lib/chat-storage';
import { PAYWALL_ENABLED } from '@/lib/paywall';

const TEMPLATES: TemplateKey[] = ['classic', 'sidebar', 'industrial', 'friendly'];

// A live subscription (any of these) gets the "Manage subscription" row → Stripe
// Billing Portal. 'free' and 'canceled' get the upgrade CTA; 'founder' hides the
// whole section (grants bypass billing entirely).
const SUBSCRIBED = new Set(['trialing', 'active', 'past_due']);

// Renewal / first-charge date. Returns null when the field is absent so the
// caller can drop the date clause entirely (null-guard).
const fmtDate = (d: string | null | undefined): string | null =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

export default function Settings() {
  const supabase = createClient();
  const router = useRouter();
  const [p, setP] = useState<any>(null);
  const [saved, setSaved] = useState(false);
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
  // Subscription: tier drives manage-vs-upgrade; founder hides the section.
  const [access, setAccess] = useState<{ hasAccess: boolean; tier: string; invoiceCount: number } | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingNotice, setBillingNotice] = useState('');
  // Account deletion: a two-step, typed-confirmation flow kept well away from
  // Sign out. Fires POST /api/delete-account only when the input reads DELETE.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Auth-gated page: a signed-out user (or a failed/expired auth check)
        // must land on login, never sit on "Loading…". getUser() can reject on
        // a token-refresh/network failure, so the whole check is guarded — any
        // throw routes to /login rather than leaving the effect hung.
        const { data: { user }, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || !user) { setRedirecting(true); router.replace('/login'); return; }

        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (!active) return;
        // Signed in but no profile yet → finish onboarding (matches chat's pattern).
        if (!data) { setRedirecting(true); router.replace('/onboarding'); return; }
        setP(data);

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
        // Auth/network failed — don't hang; send to login.
        if (!active) return;
        setRedirecting(true);
        router.replace('/login');
      }
    })();
    return () => { active = false; };
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
    const next = { ...p, ...patch };
    setP(next);
    await supabase.from('profiles').update(patch).eq('id', p.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
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
  if (!p) return <p className="p-6 text-on-surface-variant">Loading…</p>;
  const theme = p.background_color ? buildTheme(p.brand_colors, p.background_color) : null;

  return (
    <div className="space-y-4 px-4 py-4">
      {saved && <div className="rounded-input bg-paid-container p-2 text-center text-sm font-semibold text-paid">Saved</div>}

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

      <section className="card space-y-3">
        <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Payment info on invoices</h2>
        <input className="input" placeholder="Cash App ($tag)"
          value={p.cashapp_tag ?? ''} onChange={(e) => setP({ ...p, cashapp_tag: e.target.value })}
          onBlur={(e) => save({ cashapp_tag: e.target.value || null })} />
        <input className="input" placeholder="PayPal.me handle"
          value={p.paypal_me ?? ''} onChange={(e) => setP({ ...p, paypal_me: e.target.value })}
          onBlur={(e) => save({ paypal_me: e.target.value || null })} />
        <div className="flex gap-2">
          <input className="input flex-1"
            placeholder={zelleMasked ? `Zelle: ${zelleMasked}` : 'Zelle (phone or email)'}
            value={zelleInput} onChange={(e) => setZelleInput(e.target.value)} />
          <button className="btn-primary px-4 py-2 text-sm" disabled={zelleBusy || (!zelleInput.trim() && !zelleMasked)}
            onClick={saveZelle}>
            {zelleBusy ? 'Saving…' : zelleMasked && !zelleInput.trim() ? 'Remove' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-on-surface-variant/80">Zelle is stored encrypted. Leave the field empty and tap Remove to clear it.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Invoice style</h2>
        <div className="flex gap-2">
          {TEMPLATES.map((t) => (
            <button key={t} className={`chip ${p.invoice_template === t ? 'chip-selected' : ''}`}
              onClick={() => save({ invoice_template: t })}>{TEMPLATE_LABELS[t]}</button>
          ))}
        </div>
        <div className="grid grid-cols-10 gap-2">
          {PALETTE.map(({ hex, name }) => {
            const sel = p.brand_colors?.includes(hex);
            return (
              <button key={hex} title={name}
                className={`aspect-square rounded-full border ${sel ? 'border-primary-container ring-gold-selected' : 'border-outline-variant'}`}
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
          <div className="overflow-hidden rounded-input border border-outline-variant" style={{ height: 240 }}>
            <div style={{ transform: 'scale(0.36)', transformOrigin: 'top left', width: 794, pointerEvents: 'none' }}>
              <InvoiceTemplate template={p.invoice_template} theme={theme} data={{
                kind: 'invoice', invoiceNumber: 1, businessName: p.business_name,
                logoUrl: p.logo_url, websiteUrl: p.website_url, slogan: p.slogan,
                clientName: 'Sample Client',
                lineItems: [{ description: 'Service call + labor', qty: 1, unit_price: 250 }],
                subtotal: 250, taxRate: 0, taxAmount: 0, total: 250,
                issuedDate: new Date().toLocaleDateString(),
                cashappTag: p.cashapp_tag, paypalMe: p.paypal_me,
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
        <p className="text-sm text-on-surface-variant">Your expenses by category for tax time — view it or export a PDF.</p>
        <button className="btn-outline w-full text-primary" onClick={() => router.push('/summary')}>
          <Icon name="receipt_long" size={18} /> Tax summary
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
