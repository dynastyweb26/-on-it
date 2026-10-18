'use client';
/* ═══ Onboarding — the brand moment ═══
   Steps: 1 business name + trade → 2 logo, team size, website, slogan
          (all optional) → 3 pick 2-3 colors → 4 pick background
          → 5 pick 1 of 4 templates (live preview) → done.
   Locked logic: dark background = white text, light = black text.
   Live mini invoice preview updates on every tap.                  */
import { useEffect, useMemo, useRef, useState } from 'react';
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

// Tray placeholders for the three brand-color slots (the third is optional).
const SLOT_HINTS = ['1st color', '2nd color', '3rd · optional'];
const nameOfColor = (hex: string) => PALETTE.find((p) => p.hex === hex)?.name ?? hex;

// Neutral stand-in theme for the preview before a background is picked.
const PLACEHOLDER_THEME = buildTheme(['#9a9a9a', '#c4c4c4'], '#FFFFFF');

// The real invoice template at its A4 size (794 x 1123), scaled to the card
// width so the whole page always shows with no clipped edge and no empty strip.
// scale = (card - 2) / 794; height = (card - 2) * 1123 / 794 + 2.
function InvoicePreview({ template, data, theme, placeholder = false }: {
  template: TemplateKey;
  data: InvoiceRenderData;
  theme: ReturnType<typeof buildTheme>;
  placeholder?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(342);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.offsetWidth);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const inner = Math.max(w - 2, 1);
  return (
    <div ref={ref}
      className="relative overflow-hidden rounded-2xl border border-outline-variant bg-white shadow-[0_4px_24px_rgba(115,92,0,0.08)]"
      style={{ height: (inner * 1123) / 794 + 2 }}>
      <div aria-hidden={placeholder}
        style={{ width: 794, transform: `scale(${inner / 794})`, transformOrigin: 'top left', pointerEvents: 'none', opacity: placeholder ? 0.35 : 1, transition: 'opacity 200ms' }}>
        <InvoiceTemplate template={template} data={data} theme={theme} />
      </div>
      {placeholder && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="rounded-full border border-outline-variant bg-background px-[18px] py-3 text-[15px] font-semibold leading-5 shadow-[0_4px_24px_rgba(115,92,0,0.10)]">
            Pick a background to preview
          </div>
        </div>
      )}
    </div>
  );
}

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

  // A 4th tap is ignored and explained in the footer for ~3s; any change to the
  // picks clears the background (it must be one of the picks).
  const [extraHint, setExtraHint] = useState(false);
  const extraTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(extraTimer.current), []);

  function toggleColor(hex: string) {
    if (colors.includes(hex)) {
      setColors(colors.filter((c) => c !== hex));
      setBackground(null);
      setExtraHint(false);
      return;
    }
    if (colors.length >= 3) {
      setExtraHint(true);
      clearTimeout(extraTimer.current);
      extraTimer.current = setTimeout(() => setExtraHint(false), 3200);
      return;
    }
    setColors([...colors, hex]);
    setBackground(null);
    setExtraHint(false);
  }

  // Each step opens at the top; the footer gets a hairline only while there is
  // more content below it.
  const [more, setMore] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); }, [step]);
  useEffect(() => {
    const check = () =>
      setMore(document.documentElement.scrollHeight - window.scrollY - window.innerHeight > 1);
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    ro?.observe(document.body);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      ro?.disconnect();
    };
  }, [step]);

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

  // One pinned footer for all five steps: optional hint or error strip, then
  // Back (steps 2+) and the primary button.
  const ctaDisabled =
    step === 1 ? !business.trim() : step === 3 ? colors.length < 2 : step === 4 ? !background : false;
  const footerHint =
    step === 3
      ? extraHint ? "That's 3. Tap one to remove it first." : colors.length < 2 ? 'Pick at least 2' : ''
      : step === 4 && !background ? 'Pick a background to continue' : '';
  const showSaveError = step === 5 && Boolean(error) && !busy;
  const ctaLabel = step < 5 ? 'Continue' : busy ? 'Setting up…' : 'Confirm and continue';
  function onContinue() {
    if (step === 5) { if (!busy) finish(); return; }
    setStep(step + 1);
  }

  return (
    <main className="mx-auto max-w-md px-6 pb-40 pt-8">
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
        <section className="flex flex-col">
          <h1 className="text-balance font-display text-[28px] font-extrabold leading-[34px] tracking-tight">Pick your brand colors</h1>
          <p className="mt-2 text-[15px] leading-[22px] text-on-surface-variant">Tap 2 or 3. These become your invoice colors.</p>

          <div aria-live="polite" className="mt-5">
            {colors.length === 0 ? (
              <div className="flex h-14 items-center justify-center rounded-xl border-[1.5px] border-dashed border-outline-variant text-[15px] font-semibold leading-5 text-on-surface-variant">
                Pick 2 or 3
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => {
                  const hex = colors[i];
                  return hex ? (
                    <div key={i} className="flex h-14 min-w-0 items-center gap-2 rounded-xl border border-outline-variant bg-white px-2.5">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-on-background text-[11px] font-bold leading-5 text-background">{i + 1}</span>
                      <span className="h-5 w-5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(31,27,19,0.18)]" style={{ background: hex }} />
                      <span className="line-clamp-2 min-w-0 text-[13px] font-semibold leading-4">{nameOfColor(hex)}</span>
                    </div>
                  ) : (
                    <div key={i} className="flex h-14 min-w-0 items-center justify-center rounded-xl border-[1.5px] border-dashed border-outline-variant px-1 text-center text-[13px] leading-4 text-on-surface-variant">
                      {SLOT_HINTS[i]}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div role="group" aria-label="Brand colors" className="mt-5 grid gap-y-4"
            style={{ gridTemplateColumns: 'repeat(5, 58px)', justifyContent: 'space-between' }}>
            {PALETTE.map(({ name, hex }) => {
              const idx = colors.indexOf(hex);
              const sel = idx >= 0;
              return (
                <button key={hex} aria-pressed={sel} title={name}
                  aria-label={name + (sel ? `, selected, number ${idx + 1}` : '')}
                  className={`relative flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 p-0 transition active:scale-[0.92] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-on-background
                    ${sel ? 'border-primary-container ring-gold-selected' : 'border-outline-variant'}
                    ${!sel && colors.length >= 3 ? 'opacity-45' : ''}`}
                  style={{ background: hex }}
                  onClick={() => toggleColor(hex)}>
                  {sel && (
                    <>
                      <span style={{ color: onColor(hex) }}><Icon name="check" size={26} /></span>
                      <span aria-hidden className="absolute -right-[7px] -top-[7px] grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-background bg-on-background text-[11px] font-bold leading-none text-background">{idx + 1}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {allDarkOrAllLight && (
            <div role="note" className="mt-6 rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3.5">
              <p className="text-pretty text-sm leading-5">
                These might be hard to read together. Want to swap one for more contrast? Your call, it&apos;ll still work.
              </p>
            </div>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="flex flex-col">
          <h1 className="text-balance font-display text-[28px] font-extrabold leading-[34px] tracking-tight">Which color is your background?</h1>
          <p className="mt-2 text-pretty text-[15px] leading-[22px] text-on-surface-variant">
            Dark background gets white text. Light background gets black text. The rest become your accents.
          </p>
          <div role="radiogroup" aria-label="Background color" className="mt-5 grid gap-2.5"
            style={{ gridTemplateColumns: `repeat(${Math.max(colors.length, 2)}, minmax(0, 1fr))` }}>
            {colors.map((hex) => {
              const sel = background === hex;
              return (
                <button key={hex} role="radio" aria-checked={sel}
                  className={`relative h-24 min-w-0 text-balance rounded-[20px] border-2 px-3 text-[15px] font-semibold leading-5 transition active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-on-background
                    ${sel ? 'border-primary-container ring-gold-selected' : hex === '#FFFFFF' ? 'border-outline-variant' : 'border-[rgba(31,27,19,0.12)]'}`}
                  style={{ background: hex, color: onColor(hex) }}
                  onClick={() => setBackground(hex)}>
                  {nameOfColor(hex)}
                  {sel && (
                    <span aria-hidden className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-background bg-on-background text-background">
                      <Icon name="check" size={16} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-5">
            <InvoicePreview template={template} data={sample} theme={theme ?? PLACEHOLDER_THEME} placeholder={!background} />
          </div>
        </section>
      )}

      {step === 5 && theme && (
        <section className="flex flex-col">
          <h1 className="text-balance font-display text-[28px] font-extrabold leading-[34px] tracking-tight">Pick your invoice style</h1>
          {/* Names only: no thumbnail or icon beside them. */}
          <div role="radiogroup" aria-label="Invoice style" className="mt-5 grid grid-cols-2 gap-2.5">
            {TEMPLATE_META.map((t) => {
              const sel = template === t.key;
              return (
                <button key={t.key} role="radio" aria-checked={sel}
                  className={`chip !min-h-[60px] min-w-0 !justify-between !rounded-xl !px-3 !text-[15px] !font-semibold !normal-case !tracking-normal !text-on-background ${sel ? 'chip-selected' : ''}`}
                  onClick={() => { setTemplate(t.key); setError(''); }}>
                  <span className="min-w-0 flex-1 whitespace-nowrap text-left">{t.name}</span>
                  {sel && <Icon name="check" size={20} />}
                </button>
              );
            })}
          </div>
          <p aria-live="polite" className="mt-3.5 text-pretty text-[15px] leading-[22px] text-on-surface-variant">
            {TEMPLATE_META.find((t) => t.key === template)?.blurb}
          </p>
          <div className="mt-4">
            <InvoicePreview template={template} data={sample} theme={theme} />
          </div>
        </section>
      )}

      <div data-kb-lift="" className={`fixed inset-x-0 bottom-0 z-10 border-t bg-background px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 transition-colors ${more ? 'border-surface-container-highest' : 'border-transparent'}`}>
        <div className="mx-auto flex max-w-md flex-col gap-2.5">
          {footerHint && (
            <p aria-live="polite" className="text-center text-[13px] leading-[18px] text-on-surface-variant">{footerHint}</p>
          )}
          {showSaveError && (
            <div role="alert" className="flex items-center gap-2 rounded-xl bg-error-container px-3.5 py-2.5 text-sm font-semibold leading-5 text-error-on-container">
              <Icon name="error" size={20} />
              Couldn&apos;t save. Try again.
            </div>
          )}
          <div className="flex gap-3">
            {step > 1 && (
              <button aria-label="Back" disabled={busy}
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-outline-variant bg-surface-container transition active:scale-[0.94] disabled:opacity-40"
                onClick={() => setStep(step - 1)}>
                <Icon name="arrow_back" size={22} />
              </button>
            )}
            <button className="btn-primary !min-h-14 flex-1 whitespace-nowrap !rounded-full !text-[17px]"
              disabled={ctaDisabled} aria-busy={busy} onClick={onContinue}>
              {busy && (
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" fill="none" stroke="#1f1b13" strokeOpacity="0.25" strokeWidth="3" />
                  <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="#1f1b13" strokeWidth="3" strokeLinecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
                  </path>
                </svg>
              )}
              {ctaLabel}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
