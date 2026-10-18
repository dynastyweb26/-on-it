'use client';
/* ═══ Onboarding — the brand moment ═══
   Steps: 1 business name + trade → 2 logo, team size, website, slogan
          (all optional) → 3 pick 2-3 colors → 4 pick background
          → 5 pick 1 of 4 templates (live preview) → done.
   Locked logic: dark background = white text, light = black text.
   Live mini invoice preview updates on every tap.                  */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { PALETTE, buildTheme, isDark, onColor } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey, InvoiceRenderData } from '@/lib/pdf/templates';

// Stored as the label in profiles.trade_type (free text, <= 60 chars); nothing
// else reads it and older values (e.g. 'Home services') stay valid. A mix of
// classic trades and broader lines so freelancers and event/photo pros see
// themselves too. Optional; tapping a selected chip again clears it.
const TRADES = [
  'Painting',
  'Plumbing',
  'Electrical',
  'Handyman',
  'General contractor',
  'Landscaping',
  'Cleaning',
  'Photography',
  'Freelancer',
  'Events',
  'Other',
];
// Stored as the key in profiles.team_size (CHECK in 20261017100000); the label
// is display-only. Optional: it is not needed for the first invoice.
const TEAM_SIZES: { key: string; label: string }[] = [
  { key: 'solo', label: 'Just me' },
  { key: '2-5', label: '2 to 5' },
  { key: '6-15', label: '6 to 15' },
  { key: '16+', label: '16 or more' },
];
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
  zelle: '555-0100', cashappTag: '$yourbiz', venmoUsername: 'yourbiz',
});

function OptionalTag() {
  return <span className="rounded-md bg-surface-container-high px-2 py-0.5 text-xs font-semibold leading-4 text-on-surface-variant">Optional</span>;
}

export default function Onboarding() {
  const supabase = createClient();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [business, setBusiness] = useState('');
  const [trade, setTrade] = useState('');
  const [teamSize, setTeamSize] = useState('');
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
      team_size: teamSize || null,
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
      // Access code first (server-only redemption via /api/redeem, exact
      // match); if it isn't one, try it as a referral code.
      let granted = false;
      try {
        const res = await fetch('/api/redeem', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: decodeURIComponent(grantToken) }),
        });
        granted = Boolean((await res.json())?.ok);
      } catch { /* redeem unreachable — fall through to the referral try */ }
      if (!granted) await supabase.rpc('redeem_referral', { p_token: grantToken });
      document.cookie = 'onit_grant=; max-age=0; path=/';
    }
    router.push('/chat');
  }

  return (
    <main className="mx-auto max-w-md px-6 pb-32 pt-8">
      <div className="mb-6 flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary-container' : 'bg-outline-variant'}`} />
        ))}
      </div>

      {step === 1 && (
        <section className="flex flex-col">
          <h1 className="text-balance font-display text-[28px] font-extrabold leading-[34px] tracking-tight">Tell us about your business</h1>
          <p className="mt-2 text-[15px] leading-[22px] text-on-surface-variant">So your invoices look right from day one.</p>

          <div className="mt-7 flex flex-col gap-2.5">
            <label htmlFor="biz-name" className="text-[15px] font-semibold leading-5">Business name</label>
            <input id="biz-name" className="input !min-h-14 !text-[17px]" placeholder="Cyril's Door & Handyman"
              value={business} onChange={(e) => setBusiness(e.target.value)} maxLength={120}
              autoFocus autoComplete="organization" autoCapitalize="words" enterKeyHint="done" required aria-required="true" />
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span id="trade-label" className="text-[15px] font-semibold leading-5">What do you do?</span>
              <OptionalTag />
            </div>
            <div role="radiogroup" aria-labelledby="trade-label" className="flex flex-wrap gap-x-2 gap-y-2.5">
              {TRADES.map((t) => (
                <button key={t} role="radio" aria-checked={trade === t}
                  className={`chip !min-h-12 !rounded-lg ${trade === t ? 'chip-selected' : ''}`}
                  onClick={() => setTrade(trade === t ? '' : t)}>
                  {trade === t && <Icon name="check" size={18} className="-ml-1" />}
                  {t}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col">
          <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-tight">Make it yours</h1>
          <p className="mt-2 text-[15px] leading-[22px] text-on-surface-variant">Add your logo and tell us about your team.</p>

          <div className="mt-6 flex flex-col gap-2">
            <label className={`relative flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[20px] transition active:scale-[0.98] ${
              logoPreview ? 'border border-outline-variant bg-white' : 'border-2 border-dashed border-primary-container bg-surface-container hover:bg-surface-container-high'}`}>
              {logoPreview ? (
                <>
                  <img src={logoPreview} alt="Your logo" className="max-h-[94px] max-w-[calc(100%-112px)] object-contain" />
                  <span className="absolute bottom-0.5 right-2 flex h-11 items-center px-3 text-sm font-semibold text-primary underline underline-offset-[3px]">Change</span>
                </>
              ) : (
                <>
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-background"><Icon name="image" size={30} className="text-primary" /></span>
                  <span className="text-[17px] font-semibold leading-6">Add your logo</span>
                </>
              )}
              <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Add your logo, optional"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setLogoFile(f);
                  setLogoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; });
                }} />
            </label>
            <p className="text-center text-[13px] leading-[18px] text-on-surface-variant">PNG or JPG. You can skip this and add it later in Settings.</p>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span id="team-label" className="text-[15px] font-semibold leading-5">How many people work in your business?</span>
              <OptionalTag />
            </div>
            <div role="radiogroup" aria-labelledby="team-label" className="grid grid-cols-2 gap-2.5">
              {TEAM_SIZES.map((t) => (
                <button key={t.key} role="radio" aria-checked={teamSize === t.key}
                  className={`chip !min-h-14 !rounded-lg !text-base ${teamSize === t.key ? 'chip-selected' : ''}`}
                  onClick={() => setTeamSize(teamSize === t.key ? '' : t.key)}>
                  {teamSize === t.key && <Icon name="check" size={18} className="-ml-1" />}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold leading-[18px] text-on-surface-variant">
              Website (optional)
              <input className="input !min-h-12 !rounded-xl !bg-surface-container-low !text-base font-normal text-on-background" value={website}
                onChange={(e) => setWebsite(e.target.value)} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold leading-[18px] text-on-surface-variant">
              Slogan (optional)
              <input className="input !min-h-12 !rounded-xl !bg-surface-container-low !text-base font-normal text-on-background" value={slogan}
                onChange={(e) => setSlogan(e.target.value)} maxLength={60} />
            </label>
          </div>
        </section>
      )}

      {step === 3 && (
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
          <div className="flex gap-3">
            <button className="btn-outline" onClick={() => setStep(2)}>
              <Icon name="arrow_back" size={20} />
              Back
            </button>
            <button className="btn-primary flex-1" disabled={colors.length < 2} onClick={() => setStep(4)}>
              Next — pick your background
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
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
          <div className="flex gap-3">
            <button className="btn-outline" onClick={() => setStep(3)}>
              <Icon name="arrow_back" size={20} />
              Back
            </button>
            <button className="btn-primary flex-1" disabled={!background} onClick={() => setStep(5)}>
              Looks good — pick a style
            </button>
          </div>
        </section>
      )}

      {step === 5 && theme && (
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
          <div className="flex gap-3">
            <button className="btn-outline" disabled={busy} onClick={() => setStep(4)}>
              <Icon name="arrow_back" size={20} />
              Back
            </button>
            <button className="btn-primary flex-1" disabled={busy} onClick={finish}>
              {busy ? 'Setting up…' : 'Confirm and continue'}
            </button>
          </div>
        </section>
      )}
      {step <= 2 && (
        <div data-kb-lift="" className="fixed inset-x-0 bottom-0 z-10 bg-background px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex max-w-md gap-3">
            {step === 2 && (
              <button aria-label="Back" className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-outline-variant bg-surface-container"
                onClick={() => setStep(1)}>
                <Icon name="arrow_back" size={22} />
              </button>
            )}
            <button className="btn-primary !min-h-14 flex-1 !rounded-full !text-[17px]"
              disabled={step === 1 && !business.trim()}
              onClick={() => setStep(step === 1 ? 2 : 3)}>
              Continue
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
