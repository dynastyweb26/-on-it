'use client';
// Step 1 · What you win — the four demo slides, built to
// design-reference/paywall-mockup.html. One slide is on screen at a time: a
// headline, a line under it, and a 432px warm panel whose content builds itself
// (the voice → invoice, the estimate approval, the payment apps switching on,
// the weekly recap). A slide remounts when it comes up, which is what replays
// its animation. The reel under the slide auto-advances on the mockup's 4.2s
// beat; its active mark fills as the progress bar. Reduced motion: no
// auto-advance, and (globals.css) no animation, so every panel is its finished
// state.
//
// All data is invented, as in the mockup. The invoice's "from" mark is the
// user's own business tile, never On It's logo.
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Icon from '@/components/Icon';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

export type SlideId = 'invoice' | 'estimate' | 'paid' | 'recap';

/** The showcase beat. */
export const SHOWCASE_MS = 4200;

const INK = '#1f1b13';
const MUTED = '#4d4635';
const GOLD = '#d4af37';
const GOLD_TEXT = '#735c00';
const GREEN = '#17703a';
const BORDER = '#efe4d2';
const HAIRLINE = '#f0e7d8';
const EASE = 'cubic-bezier(.2,.8,.2,1)';

const MONT = 'var(--font-montserrat), system-ui, sans-serif';
const INTER = 'var(--font-inter), system-ui, sans-serif';
const MONO = 'ui-monospace, "JetBrains Mono", Menlo, monospace';

/** CSS `font:` shorthand split into the longhands React wants. */
const font = (weight: number, size: number, lh: number | string, family: string): CSSProperties => ({
  fontFamily: family, fontWeight: weight, fontSize: size, lineHeight: lh,
});
const mont = (w: number, s: number, lh: number | string) => font(w, s, lh, MONT);
const inter = (w: number, s: number, lh: number | string) => font(w, s, lh, INTER);
const mono = (w: number, s: number, lh: number | string) => font(w, s, lh, MONO);

const up = (dur: number, delay = 0) => `oi-up ${dur}s ${EASE} ${delay ? `${delay}s ` : ''}both`;

const card: CSSProperties = { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16 };
const panel: CSSProperties = {
  height: 432, boxSizing: 'border-box', background: '#faefdc', borderRadius: 20, overflow: 'hidden',
};
const col = (gap: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap });
const row: CSSProperties = { display: 'flex', alignItems: 'center' };

function Head({ title, sub }: { title: ReactNode; sub?: string }) {
  return (
    <div style={{ minHeight: 78, animation: up(.5) }}>
      <div style={{ ...mont(800, 25, 1.15), letterSpacing: '-.02em' }}>{title}</div>
      {sub && <div style={{ ...inter(400, 14.5, 1.45), color: MUTED, marginTop: 6, textWrap: 'pretty' }}>{sub}</div>}
    </div>
  );
}

// ── Slide 1 · Say it. It's invoiced. ────────────────────────────────────────
function InvoiceSlide() {
  return (
    <div style={col(12)}>
      <Head title="Say it. It's invoiced." sub="Talk through the job. On It writes the invoice." />
      <div style={{ ...panel, padding: '18px 16px', ...col(14) }}>
        <div style={{ ...card, ...row, gap: 11, borderRadius: 999, padding: '6px 14px 6px 6px', animation: up(.4) }}>
          <div style={{ position: 'relative', flex: 'none', width: 38, height: 38 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 99, background: GOLD, animation: `oi-ring 1.6s ${EASE} 3` }} />
            <div style={{ position: 'relative', width: 38, height: 38, borderRadius: 99, background: GOLD, display: 'grid', placeItems: 'center' }}>
              <Icon name="mic" size={21} filled className="text-[#1f1b13]" />
            </div>
          </div>
          <div style={{ ...inter(500, 13, 1.3), whiteSpace: 'nowrap', animation: 'oi-type 1.4s steps(44) .3s both' }}>
            “Invoice Mike Davis, back door install, 850”
          </div>
        </div>
        <div style={{ ...card, padding: 16, ...col(12), animation: up(.45, 1.6) }}>
          <div style={{ ...row, gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#2b2721', color: '#fff8f0', display: 'grid', placeItems: 'center', ...inter(700, 12, 1) }}>RH</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={inter(600, 13.5, 1.2)}>Reyes Home Repair</div>
              <div style={{ ...inter(600, 10.5, 1.2), letterSpacing: '.1em', color: MUTED, marginTop: 3 }}>INVOICE</div>
            </div>
            <div style={{ ...mono(500, 12, 1), color: MUTED }}>INV-0081</div>
          </div>
          <div style={{ height: 1, background: HAIRLINE }} />
          <div style={{ animation: up(.4, 1.9) }}>
            <div style={{ ...inter(600, 10.5, 1), letterSpacing: '.1em', color: MUTED }}>BILL TO</div>
            <div style={{ ...mont(800, 18, 1.2), marginTop: 5 }}>Mike Davis</div>
          </div>
          <div style={{ ...col(8), ...mono(400, 13.5, 1.3) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', animation: up(.35, 2.15) }}><span>Back door install</span><span>$780.00</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', animation: up(.35, 2.4) }}><span>Hardware &amp; trim</span><span>$70.00</span></div>
          </div>
          <div style={{ borderTop: '1.5px dashed #e6d9c3', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', animation: 'oi-in .3s ease-out 2.6s both' }}>
            <span style={{ ...inter(600, 13, 1), color: MUTED }}>Total</span>
            <span
              className="oi-count-850"
              style={{ ...mont(800, 28, 1), color: GOLD_TEXT, fontVariantNumeric: 'tabular-nums', '--oi-d': '.9s', '--oi-dl': '2.6s' } as CSSProperties}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slide 2 · Estimate approved. ────────────────────────────────────────────
function EstimateSlide() {
  const chip: CSSProperties = {
    gridArea: '1/1', ...row, gap: 6, padding: '6px 10px', borderRadius: 8, ...inter(600, 11.5, 1), letterSpacing: '.1em', whiteSpace: 'nowrap',
  };
  const action: CSSProperties = {
    gridArea: '1/1', height: 52, boxSizing: 'border-box', borderRadius: 999, ...row, justifyContent: 'center', ...mont(700, 15, 1),
  };
  return (
    <div style={col(12)}>
      <Head title="Estimate approved." sub="Clients sign from a link. Convert it in one tap." />
      <div style={{ ...panel, padding: '18px 16px' }}>
        <div style={{ ...card, padding: 16, ...col(12), animation: up(.4) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'grid' }}>
              <div style={{ ...chip, background: '#f3ecdf', color: MUTED, animation: 'oi-out .2s ease-out 1.5s both' }}>
                <Icon name="send" size={15} />SENT
              </div>
              <div style={{ ...chip, background: '#c9f0d5', color: GREEN, animation: `oi-pop .4s ${EASE} 1.6s both` }}>
                <Icon name="verified" size={15} />APPROVED
              </div>
            </div>
            <span style={{ ...mono(500, 12, 1), color: MUTED }}>E-0040</span>
          </div>
          <div>
            <div style={mont(800, 21, 1.15)}>Mike Davis</div>
            <div style={{ ...inter(400, 13, 1.3), color: MUTED, marginTop: 4 }}>Estimate · Back door install</div>
          </div>
          <div>
            <div style={{ ...inter(600, 12, 1), color: MUTED }}>Estimate total</div>
            <div style={{ ...mont(800, 30, 1.1), color: GOLD_TEXT, marginTop: 4 }}>$850.00</div>
          </div>
          <div style={{ position: 'relative', height: 96, border: `1px solid ${BORDER}`, borderRadius: 12, background: '#fffdf9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="170" height="64" viewBox="0 0 170 64" fill="none" aria-hidden>
              <path
                d="M14 46 C20 8 34 6 30 34 S38 60 56 40 S76 20 84 42 S102 54 118 34 S140 30 156 46"
                stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                style={{ strokeDasharray: 420, animation: `oi-draw 1.1s ${EASE} .4s both` }}
              />
            </svg>
            <div style={{ position: 'absolute', left: 12, bottom: 8, ...mono(500, 10.5, 1), color: MUTED, animation: 'oi-in .3s ease-out 1.4s both' }}>Signed by Mike Davis</div>
            <div style={{ position: 'absolute', right: 10, top: 10, padding: '5px 10px', border: `2.5px solid ${GREEN}`, borderRadius: 8, ...mont(800, 17, 1), letterSpacing: '.08em', color: GREEN, background: 'rgba(201,240,213,.55)', animation: `oi-stamp .45s ${EASE} 1.6s both` }}>APPROVED</div>
          </div>
          <div style={{ display: 'grid' }}>
            <div style={{ ...action, position: 'relative', overflow: 'hidden', gap: 9, background: GOLD, color: INK, animation: up(.35, 2) }}>
              <div style={{ ...row, gap: 9, animation: 'oi-press .3s ease-out 2.55s both' }}>
                <Icon name="sync" size={20} />Convert to invoice
              </div>
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: 40, height: 40, margin: '-20px 0 0 -20px', borderRadius: 99, background: '#fff8f0', animation: 'oi-tap .55s ease-out 2.55s both' }} />
            </div>
            <div style={{ ...action, gap: 8, background: '#c9f0d5', border: '1px solid #8fd1a5', color: GREEN, animation: `oi-pop .4s ${EASE} 2.95s both` }}>
              <Icon name="check_circle" size={20} />Converted to INV-0081
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slide 3 · Add your payment apps. Get paid faster. ───────────────────────
type Method = { label: string; detail: string; delay: number; mark: ReactNode; markBg?: string };

const markLetter = (color: string): CSSProperties => ({ ...mont(800, 16, 1), color });

function SettingRow({ m, last, status }: { m: Method; last: boolean; status: ReactNode }) {
  return (
    <div style={{ height: 44, ...row, gap: 11, padding: '0 12px', borderBottom: !last ? `1px solid ${HAIRLINE}` : undefined }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: m.markBg ?? '#f1e6d3', display: 'grid', placeItems: 'center' }}>{m.mark}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={inter(500, 13.5, 1.2)}>{m.label}</div>
        <div style={{ ...(m.detail.startsWith('Visa') ? inter(400, 10.5, 1.2) : mono(400, 10.5, 1.2)), color: MUTED, animation: `oi-in .3s ease-out ${m.delay + .1}s both` }}>{m.detail}</div>
      </div>
      <div style={{ display: 'grid', justifyItems: 'end', ...inter(600, 12.5, 1) }}>{status}</div>
    </div>
  );
}

const off = (text: string, delay: number): ReactNode => (
  <span style={{ gridArea: '1/1', color: '#8b806b', animation: `oi-out .15s ease-out ${delay}s both` }}>{text}</span>
);
const on = (delay: number): ReactNode => (
  <span style={{ gridArea: '1/1', color: GREEN, animation: `oi-pop .3s ${EASE} ${delay}s both` }}>On</span>
);
const added = (delay: number): ReactNode => (
  <span style={{ gridArea: '1/1', ...row, gap: 3, color: GREEN, animation: `oi-in .2s ease-out ${delay}s both` }}>
    <span style={{ display: 'grid', animation: `oi-pop .35s ${EASE} ${delay}s both` }}><Icon name="check" size={16} /></span>Added
  </span>
);

const APPS: Method[] = [
  { label: 'Zelle', detail: '(555) 014-2290', delay: 1.1, mark: <span style={markLetter('#6d1ed4')}>Z</span> },
  { label: 'Cash App', detail: '$ReyesHome', delay: 1.45, markBg: '#00c244', mark: <span style={markLetter('#fff')}>$</span> },
  { label: 'PayPal', detail: 'paypal.me/reyeshome', delay: 1.8, mark: <span style={markLetter('#003087')}>P</span> },
  { label: 'Venmo', detail: '@Reyes-Home', delay: 2.15, mark: <span style={markLetter('#008cff')}>V</span> },
];

const sectionLabel = (pad: string): CSSProperties => ({ ...inter(600, 10.5, 1), letterSpacing: '.14em', color: MUTED, padding: pad });
const group: CSSProperties = { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' };

function PaidSlide() {
  return (
    <div style={col(12)}>
      <Head title={<>Add your payment apps.<br />Get paid faster.</>} />
      <div style={{ ...panel, padding: '14px 12px', ...col(7) }}>
        <div style={sectionLabel('2px 4px')}>GET PAID ONLINE</div>
        <div style={group}>
          <SettingRow
            last
            m={{ label: 'Card & digital wallets', detail: 'Visa, Mastercard, Apple Pay', delay: .3, mark: <Icon name="credit_card" size={18} className="text-[#1f1b13]" /> }}
            status={<>{off('Off', .3)}{on(.45)}</>}
          />
        </div>
        <div style={sectionLabel('4px 4px 2px')}>BANK</div>
        <div style={group}>
          <SettingRow
            last
            m={{ label: 'Bank transfer', detail: 'Checking ••4821', delay: .65, mark: <Icon name="account_balance" size={18} className="text-[#1f1b13]" /> }}
            status={<>{off('Off', .65)}{on(.8)}</>}
          />
        </div>
        <div style={sectionLabel('4px 4px 2px')}>PAYMENT APPS</div>
        <div style={group}>
          {APPS.map((m, i) => (
            <SettingRow key={m.label} m={m} last={i === APPS.length - 1} status={<>{off('Not set', m.delay - .1)}{added(m.delay + .05)}</>} />
          ))}
        </div>
        <div style={{ marginTop: 'auto', ...row, gap: 10, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 999, padding: '6px 8px 6px 6px', boxShadow: '0 8px 20px -8px rgba(31,27,19,.18)', animation: `oi-slideup .45s ${EASE} 2.6s both` }}>
          <div style={{ width: 32, height: 32, borderRadius: 99, background: '#c9f0d5', display: 'grid', placeItems: 'center' }}>
            <Icon name="payments" size={19} className="text-[#17703a]" />
          </div>
          <div style={{ flex: 1, ...inter(500, 13.5, 1), display: 'flex', gap: 4 }}>
            Mike Davis paid{' '}
            <span className="oi-count-850" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', '--oi-d': '.8s', '--oi-dl': '2.8s' } as CSSProperties} />
          </div>
          <div style={{ padding: '6px 10px', borderRadius: 999, background: '#c9f0d5', ...inter(700, 11, 1), letterSpacing: '.1em', color: GREEN }}>PAID</div>
        </div>
      </div>
    </div>
  );
}

// ── Slide 4 · Your week at a glance. ────────────────────────────────────────
const WEEK_BARS: [number, string][] = [[46, GOLD], [72, GOLD], [38, GOLD], [100, GOLD], [64, GOLD], [24, GOLD], [8, '#6a6255']];

function Stat({ dot, label, dollars, delay }: { dot: string; label: string; dollars: string; delay: number }) {
  return (
    <div style={{ ...card, padding: '12px 14px', animation: up(.4, delay) }}>
      <div style={{ ...row, gap: 6, ...inter(600, 12.5, 1), color: MUTED }}>
        <span style={{ width: 7, height: 7, borderRadius: 9, background: dot }} />{label}
      </div>
      <div style={{ ...mont(800, 18, 1), marginTop: 9 }}>{dollars}<span style={{ fontSize: 12 }}>.00</span></div>
    </div>
  );
}

function RecapSlide() {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <div style={col(12)}>
      <Head title="Your week at a glance." sub="A recap of what came in and what went out." />
      <div style={{ ...panel, padding: '18px 16px', ...col(12) }}>
        <div style={{ background: '#322d26', borderRadius: 20, padding: '18px 18px 16px', color: '#fff8f0', animation: up(.4) }}>
          <div style={{ ...row, gap: 6, ...inter(600, 12, 1), color: '#d9cfbd', whiteSpace: 'nowrap' }}>
            <Icon name="auto_awesome" size={16} filled className="text-[#d4af37]" />Recap · Oct 19 – 25
          </div>
          <div
            className="oi-count-net"
            style={{ ...mont(800, 40, 1.1), letterSpacing: '-.02em', marginTop: 12, fontVariantNumeric: 'tabular-nums' }}
          />
          <div style={{ ...inter(500, 13, 1), color: '#cfc5b2', marginTop: 6 }}>Net · this week · 6 invoices</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 9, alignItems: 'end', height: 112, marginTop: 18 }}>
            {WEEK_BARS.map(([h, bg], i) => (
              <div key={i} style={{ height: `${h}%`, background: bg, borderRadius: '6px 6px 3px 3px', transformOrigin: 'bottom', animation: `oi-grow .6s ${EASE} ${.3 + i * .1}s both` }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 9, marginTop: 8, ...mono(500, 11, 1), color: '#a99f8c', textAlign: 'center' }}>
            {days.map((d, i) => <span key={i}>{d}</span>)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Stat dot={GREEN} label="Collected" dollars="$3,120" delay={1.6} />
          <Stat dot="#8b806b" label="Spent" dollars="$705" delay={1.8} />
        </div>
      </div>
    </div>
  );
}

const SLIDES: Record<SlideId, () => JSX.Element> = {
  invoice: InvoiceSlide,
  estimate: EstimateSlide,
  paid: PaidSlide,
  recap: RecapSlide,
};

const SLIDE_LABEL: Record<SlideId, string> = {
  invoice: 'Say it. It’s invoiced.',
  estimate: 'Estimate approved.',
  paid: 'Get paid faster.',
  recap: 'Your week at a glance.',
};

export default function PaywallDemo({ slides }: {
  /** In reel order; the reel opens on the first. */
  slides: SlideId[];
}) {
  const n = slides.length;
  const [idx, setIdx] = useState(0);
  const reduced = usePrefersReducedMotion();
  const go = useCallback((i: number) => setIdx(((i % n) + n) % n), [n]);

  // The beat restarts whenever the slide changes (a dot tap included).
  useEffect(() => {
    if (reduced || n < 2) return;
    const t = setTimeout(() => go(idx + 1), SHOWCASE_MS);
    return () => clearTimeout(t);
  }, [idx, reduced, n, go]);

  const Slide = SLIDES[slides[idx]];
  return (
    <section aria-roledescription="carousel" aria-label="What On It does" className="w-full">
      {/* Laptop (design "copy on the left, the live demo on the right"): the slide's
          own column (headline, then its panel) becomes one 412 + 56 + 460 row. The
          slide sets its layout inline, so the switch is important at xl only. */}
      <div
        key={slides[idx]}
        role="group"
        aria-roledescription="slide"
        aria-label={`${idx + 1} of ${n}: ${SLIDE_LABEL[slides[idx]]}`}
        className="xl:[&>div]:!grid xl:[&>div]:!grid-cols-[412px_460px] xl:[&>div]:!items-center xl:[&>div]:!gap-14"
      >
        <Slide />
      </div>
      <div className="flex items-center justify-center gap-0.5 pt-[14px]" aria-label="Reel">
        {slides.map((id, i) => (
          <button
            key={id}
            type="button"
            aria-label={SLIDE_LABEL[id]}
            aria-current={i === idx ? 'true' : undefined}
            onClick={() => go(i)}
            className="flex bg-transparent px-[3px] py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {i === idx ? (
              <span className="block h-1.5 w-6 overflow-hidden rounded-full bg-[#e3d6bf]">
                <span
                  key={`${id}-${reduced}`}
                  className="block h-full w-full origin-left rounded-full bg-[#1f1b13]"
                  style={{ animation: `oi-bar ${SHOWCASE_MS}ms cubic-bezier(.3,.6,.4,1) both` }}
                />
              </span>
            ) : (
              <span className="block h-1.5 w-1.5 rounded-full bg-[#e3d6bf]" />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
