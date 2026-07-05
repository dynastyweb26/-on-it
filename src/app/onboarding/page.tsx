'use client';
/* ═══ Onboarding — the brand moment ═══
   Steps: 1 business info → 2 pick 2-3 colors → 3 pick background
          → 4 pick 1 of 4 templates (live preview) → done.
   Locked logic: dark background = white text, light = black text.
   Live mini invoice preview updates on every tap.                  */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { PALETTE, buildTheme, isDark, onColor } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey, InvoiceRenderData } from '@/lib/pdf/templates';

const TRADES = ['Handyman', 'Trucking', 'Landscaping', 'Electrical', 'Plumbing', 'Painting', 'HVAC', 'Cleaning', 'Roofing', 'Other'];
const TEMPLATE_META: { key: TemplateKey; name: string; blurb: string }[] = [
  { key: 'classic', name: 'Classic', blurb: 'Clean and professional. The safe pick.' },
  { key: 'sidebar', name: 'Ledger', blurb: 'Old-school invoice book. Ruled lines, stamped, built on trust.' },
  { key: 'industrial', name: 'Industrial', blurb: 'Heavy type, hard edges. Built tough.' },
  { key: 'friendly', name: 'Friendly', blurb: 'Rounded and warm. Easy on the eyes.' },
];

const SAMPLE = (business: string, slogan: string, website: string): InvoiceRenderData => ({
  kind: 'invoice',
  invoiceNumber: 1,
  businessName: business || 'Your Business',
  slogan: slogan || null,
  websiteUrl: website || null,
  clientName: 'Sample Client',
  lineItems: [
    { description: 'Service call + labor', qty: 1, unit_price: 250 },
    { description: 'Materials', qty: 1, unit_price: 85 },
  ],
  subtotal: 335, taxRate: 0, taxAmount: 0, total: 335,
  issuedDate: new Date().toLocaleDateString(),
  zelle: '555-0100', cashappTag: '$yourbiz',
});

export default function Onboarding() {
  const supabase = createClient();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [business, setBusiness] = useState('');
  const [trade, setTrade] = useState('');
  const [website, setWebsite] = useState('');
  const [slogan, setSlogan] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const [background, setBackground] = useState<string | null>(null);
  const [template, setTemplate] = useState<TemplateKey>('classic');

  const theme = useMemo(
    () => (background ? buildTheme(colors, background) : null),
    [colors, background]
  );
  const sample = useMemo(() => {
    const s = SAMPLE(business, slogan, website);
    return logoPreview ? { ...s, logoUrl: logoPreview } : s;
  }, [business, slogan, website, logoPreview]);

  function toggleColor(hex: string) {
    setBackground(null);
    setColors((prev) =>
      prev.includes(hex)
        ? prev.filter((c) => c !== hex)
        : prev.length >= 3
          ? prev // max 3 enforced silently
          : [...prev, hex]
    );
  }

  const allDarkOrAllLight =
    colors.length >= 2 &&
    (colors.every((c) => isDark(c)) || colors.every((c) => !isDark(c)));

  async function finish() {
    setBusy(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    let logoUrl: string | null = null;
    if (logoFile) {
      const path = `${user.id}/logo-${Date.now()}`;
      const { error: upErr } = await supabase.storage.from('logos').upload(path, logoFile);
      if (!upErr) {
        logoUrl = supabase.storage.from('logos').getPublicUrl(path).data.publicUrl;
      }
    }

    const { error: dbErr } = await supabase.from('profiles').upsert({
      id: user.id,
      business_name: business.trim(),
      trade_type: trade || null,
      website_url: website.trim() || null,
      slogan: slogan.trim() || null,
      logo_url: logoUrl,
      brand_colors: colors,
      background_color: background,
      invoice_template: template,
    });
    setBusy(false);
    if (dbErr) { setError(dbErr.message); return; }
    const grantToken = document.cookie
      .split('; ').find((c) => c.startsWith('onit_grant='))?.split('=')[1];
    if (grantToken) {
      // access grant first; if the token isn't one, try it as a referral code
      const { data: tier } = await supabase.rpc('redeem_grant', { p_token: grantToken });
      if (!tier) await supabase.rpc('redeem_referral', { p_token: grantToken });
      document.cookie = 'onit_grant=; max-age=0; path=/';
    }
    router.push('/chat');
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-28 pt-8">
      <div className="mb-6 flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary-container' : 'bg-outline-variant'}`} />
        ))}
      </div>

      {step === 1 && (
        <section className="flex flex-col gap-4">
          <h1 className="font-display text-2xl font-extrabold">Tell us about your business</h1>
          <input className="input" placeholder="Business name *" value={business}
            onChange={(e) => setBusiness(e.target.value)} maxLength={120} />
          <div className="flex flex-wrap gap-2">
            {TRADES.map((t) => (
              <button key={t} className={`chip ${trade === t ? 'chip-selected' : ''}`}
                onClick={() => setTrade(t)}>{t}</button>
            ))}
          </div>
          <input className="input" placeholder="Website (optional)" value={website}
            onChange={(e) => setWebsite(e.target.value)} inputMode="url" />
          <input className="input" placeholder="Slogan (optional)" value={slogan}
            onChange={(e) => setSlogan(e.target.value)} maxLength={140} />
          <label className="card flex cursor-pointer items-center gap-3">
            {logoPreview
              ? <img src={logoPreview} className="h-12 w-12 rounded-lg object-cover" alt="" />
              : <span className="grid h-12 w-12 place-items-center rounded-lg bg-surface-container"><Icon name="image" size={24} className="text-on-surface-variant" /></span>}
            <span className="text-sm text-on-surface-variant">{logoFile ? logoFile.name : 'Upload your logo (optional)'}</span>
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setLogoFile(f);
                setLogoPreview(f ? URL.createObjectURL(f) : null);
              }} />
          </label>
          <button className="btn-primary" disabled={!business.trim()} onClick={() => setStep(2)}>
            Next — pick your colors
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4">
          <h1 className="font-display text-2xl font-extrabold">Pick your brand colors</h1>
          <p className="text-sm text-on-surface-variant">Tap 2 or 3. These become your invoice colors.</p>
          <div className="grid grid-cols-5 gap-3">
            {PALETTE.map(({ name, hex }) => {
              const sel = colors.includes(hex);
              return (
                <button key={hex} aria-label={name} title={name}
                  className={`relative aspect-square rounded-full border-2 transition active:scale-90
                    ${sel ? 'border-primary-container ring-gold-selected' : 'border-outline-variant'}`}
                  style={{ background: hex }}
                  onClick={() => toggleColor(hex)}>
                  {sel && (
                    <span className="absolute inset-0 grid place-items-center"
                      style={{ color: onColor(hex) }}><Icon name="check" size={22} /></span>
                  )}
                </button>
              );
            })}
          </div>
          {allDarkOrAllLight && (
            <p className="rounded-xl bg-primary-container/10 p-3 text-sm">
              These colors might be hard to read together. Want to swap one for more contrast? Your call — it&apos;ll still work.
            </p>
          )}
          <button className="btn-primary" disabled={colors.length < 2} onClick={() => setStep(3)}>
            Next — pick your background
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-4">
          <h1 className="font-display text-2xl font-extrabold">Which color is your background?</h1>
          <p className="text-sm text-on-surface-variant">
            Dark background gets white text. Light background gets black text. The rest become your accents.
          </p>
          <div className="flex gap-4">
            {colors.map((hex) => (
              <button key={hex}
                className={`h-24 flex-1 rounded-card border-2 transition active:scale-95
                  ${background === hex ? 'border-primary-container ring-gold-selected font-bold' : 'border-outline-variant font-medium'}`}
                style={{ background: hex, color: onColor(hex) }}
                onClick={() => setBackground(hex)}>
                {PALETTE.find((p) => p.hex === hex)?.name ?? hex}
              </button>
            ))}
          </div>
          {theme && (
            <div className="overflow-hidden rounded-card border border-outline-variant" style={{ height: 300 }}>
              <div style={{ transform: 'scale(0.42)', transformOrigin: 'top left', width: 794, pointerEvents: 'none' }}>
                <InvoiceTemplate template={template} data={sample} theme={theme} />
              </div>
            </div>
          )}
          <button className="btn-primary" disabled={!background} onClick={() => setStep(4)}>
            Looks good — pick a style
          </button>
        </section>
      )}

      {step === 4 && theme && (
        <section className="flex flex-col gap-4">
          <h1 className="font-display text-2xl font-extrabold">Pick your invoice style</h1>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {TEMPLATE_META.map((t) => (
              <button key={t.key}
                className={`chip shrink-0 ${template === t.key ? 'chip-selected' : ''}`}
                onClick={() => setTemplate(t.key)}>
                {t.name}
              </button>
            ))}
          </div>
          <p className="text-sm text-on-surface-variant">{TEMPLATE_META.find((t) => t.key === template)?.blurb}</p>
          <div className="overflow-hidden rounded-card border border-outline-variant" style={{ height: 420 }}>
            <div style={{ transform: 'scale(0.42)', transformOrigin: 'top left', width: 794, pointerEvents: 'none' }}>
              <InvoiceTemplate template={template} data={sample} theme={theme} />
            </div>
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <button className="btn-primary" disabled={busy} onClick={finish}>
            {busy ? 'Setting up…' : 'Confirm and continue'}
          </button>
        </section>
      )}
    </main>
  );
}
