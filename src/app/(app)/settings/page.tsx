'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { PALETTE, buildTheme, onColor } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey, TEMPLATE_LABELS } from '@/lib/pdf/templates';
import { getPushSubscription, subscribeToPush, unsubscribeFromPush } from '@/lib/push';

const TEMPLATES: TemplateKey[] = ['classic', 'sidebar', 'industrial', 'friendly'];

export default function Settings() {
  const supabase = createClient();
  const router = useRouter();
  const [p, setP] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  // Zelle is encrypted at rest; only /api/zelle (server-side) touches it.
  const [zelleMasked, setZelleMasked] = useState<string | null>(null);
  const [zelleInput, setZelleInput] = useState('');
  const [zelleBusy, setZelleBusy] = useState(false);
  // real subscription state, not a fire-and-forget button
  const [pushOn, setPushOn] = useState<boolean | null>(null); // null = checking
  const [pushBusy, setPushBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [redirecting, setRedirecting] = useState(false); // decided to leave — never hang on Loading

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
        onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }}>
        Sign out
      </button>
      <p className="pb-4 text-center text-xs text-on-surface-variant/60">On It · a Dynasty Web product · $9/month</p>
    </div>
  );
}
