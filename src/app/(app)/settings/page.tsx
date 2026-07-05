'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PALETTE, buildTheme, onColor } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey } from '@/lib/pdf/templates';

const TEMPLATES: TemplateKey[] = ['classic', 'sidebar', 'industrial', 'friendly'];

export default function Settings() {
  const supabase = createClient();
  const router = useRouter();
  const [p, setP] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      setP(data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(patch: Record<string, unknown>) {
    const next = { ...p, ...patch };
    setP(next);
    await supabase.from('profiles').update(patch).eq('id', p.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function enableNotifications() {
    // Push subscription for the 2-day payment follow-ups
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    });
    const json = sub.toJSON();
    await supabase.from('push_subscriptions').upsert(
      { user_id: p.id, endpoint: json.endpoint!, p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      { onConflict: 'endpoint' }
    );
    alert("You're set — I'll nudge you when invoices go unpaid for 2 days.");
  }

  if (!p) return <p className="p-6 text-ink/50">Loading…</p>;
  const theme = p.background_color ? buildTheme(p.brand_colors, p.background_color) : null;

  return (
    <div className="space-y-4 px-4 py-4">
      {saved && <div className="rounded-xl bg-green-100 p-2 text-center text-sm text-green-800">Saved</div>}

      <section className="card space-y-3">
        <h2 className="font-display font-bold">Business</h2>
        <input className="w-full rounded-xl border border-line px-3 py-2.5" value={p.business_name ?? ''}
          onChange={(e) => setP({ ...p, business_name: e.target.value })}
          onBlur={(e) => save({ business_name: e.target.value })} />
        <input className="w-full rounded-xl border border-line px-3 py-2.5" placeholder="Website"
          value={p.website_url ?? ''} onChange={(e) => setP({ ...p, website_url: e.target.value })}
          onBlur={(e) => save({ website_url: e.target.value || null })} />
        <input className="w-full rounded-xl border border-line px-3 py-2.5" placeholder="Slogan"
          value={p.slogan ?? ''} onChange={(e) => setP({ ...p, slogan: e.target.value })}
          onBlur={(e) => save({ slogan: e.target.value || null })} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-display font-bold">Payment info on invoices</h2>
        <input className="w-full rounded-xl border border-line px-3 py-2.5" placeholder="Cash App ($tag)"
          value={p.cashapp_tag ?? ''} onChange={(e) => setP({ ...p, cashapp_tag: e.target.value })}
          onBlur={(e) => save({ cashapp_tag: e.target.value || null })} />
        <input className="w-full rounded-xl border border-line px-3 py-2.5" placeholder="PayPal.me handle"
          value={p.paypal_me ?? ''} onChange={(e) => setP({ ...p, paypal_me: e.target.value })}
          onBlur={(e) => save({ paypal_me: e.target.value || null })} />
        <p className="text-xs text-ink/50">Zelle is stored encrypted — manage it during invoice setup.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display font-bold">Invoice style</h2>
        <div className="flex gap-2">
          {TEMPLATES.map((t) => (
            <button key={t} className={`chip capitalize ${p.invoice_template === t ? 'chip-selected' : ''}`}
              onClick={() => save({ invoice_template: t })}>{t}</button>
          ))}
        </div>
        <div className="grid grid-cols-10 gap-2">
          {PALETTE.map(({ hex, name }) => {
            const sel = p.brand_colors?.includes(hex);
            return (
              <button key={hex} title={name}
                className={`aspect-square rounded-full border ${sel ? 'border-gold ring-2 ring-gold' : 'border-line'}`}
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
                className={`flex-1 rounded-xl border py-2 text-sm ${p.background_color === hex ? 'border-gold ring-2 ring-gold font-bold' : 'border-line font-medium'}`}
                style={{ background: hex, color: onColor(hex) }}
                onClick={() => save({ background_color: hex })}>
                {p.background_color === hex ? 'Background ✓' : 'Set background'}
              </button>
            ))}
          </div>
        )}
        {theme && (
          <div className="overflow-hidden rounded-xl border border-line" style={{ height: 240 }}>
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

      <section className="card space-y-2">
        <h2 className="font-display font-bold">Notifications</h2>
        <p className="text-sm text-ink/60">Get a nudge when an invoice goes unpaid for 2 days.</p>
        <button className="btn-gold w-full" onClick={enableNotifications}>Turn on payment reminders</button>
      </section>

      <button className="w-full py-3 text-sm text-red-700 underline"
        onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }}>
        Sign out
      </button>
      <p className="pb-4 text-center text-xs text-ink/35">On It · a Dynasty Web product · $9/month</p>
    </div>
  );
}
