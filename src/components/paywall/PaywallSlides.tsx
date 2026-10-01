// The paywall slideshow's slides, built to Claude Design frames 1a–1e: a
// Montserrat 800 headline over a feature graphic — a base object fading out at
// the bottom, plus one elevated overlay card. Everything is drawn on the
// design's fixed 393×300 canvas in DOM/SVG and scaled as a whole by the
// slideshow, so it stays crisp at any size.
//
// All data is invented. The invoice/report "from" mark is the USER's business
// (a neutral contractor tile), never On It's logo — that lives only at the top
// of the page. No tax or deductible wording anywhere.
import type { CSSProperties, ReactNode } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';

export const SLIDE_W = 393;
export const SLIDE_H = 300;

export type SlideId = 'invoice' | 'paid' | 'expense' | 'reports' | 'recap';

export const SLIDE_TITLE: Record<SlideId, [string, string]> = {
  invoice: ['Say it.', 'It’s invoiced.'],
  paid: ['Get paid', 'your way.'],
  expense: ['Snap a receipt.', 'It’s logged.'],
  reports: ['Your books,', 'one tap.'],
  recap: ['Your week', 'at a glance.'],
};

// Warm Premium tokens (tailwind.config.ts). Gold (#d4af37) is a fill only.
const INK = '#1f1b13';
const MUTED = '#4d4635';
const GOLD = '#d4af37';
const GOLD_TEXT = '#735c00';
const HAIRLINE = '#f0e7d8';
const MONT = 'var(--font-montserrat), system-ui, sans-serif';
const INTER = 'var(--font-inter), system-ui, sans-serif';
const MONO = 'ui-monospace, Menlo, monospace';

const fadeOut = (from: number, to: number): CSSProperties => {
  const m = `linear-gradient(to bottom, #000 ${from}%, transparent ${to}%)`;
  return { maskImage: m, WebkitMaskImage: m };
};

// The base object: a white page that fades out toward the bottom.
const BASE: CSSProperties = {
  position: 'absolute', left: 40, top: 18, width: 236, height: 236, boxSizing: 'border-box', padding: 18,
  background: '#fff', borderRadius: 16, display: 'flex', flexDirection: 'column',
  boxShadow: '0 1px 2px rgba(31,27,19,.05), 0 14px 32px rgba(31,27,19,.09)',
  ...fadeOut(42, 88),
};

// The elevated overlay card.
const OVERLAY: CSSProperties = {
  position: 'absolute', right: 22, bottom: 16, width: 240, boxSizing: 'border-box', padding: 14,
  background: '#fff', borderRadius: 18, border: '1px solid rgba(31,27,19,.04)',
  boxShadow: '0 2px 6px rgba(31,27,19,.06), 0 20px 44px rgba(31,27,19,.18)',
  display: 'flex', flexDirection: 'column', gap: 10,
};

const row: CSSProperties = { display: 'flex', justifyContent: 'space-between' };
const eyebrow: CSSProperties = { fontSize: 8.5, fontWeight: 600, letterSpacing: '.12em', color: MUTED };

/** The user's business mark on their own documents: a neutral dark tile. */
function ContractorMark({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.29), background: INK, display: 'grid', placeItems: 'center', flex: 'none' }}>
      <Icon name="home_repair_service" size={Math.round(size * 0.66)} className="text-[#fff8f0]" />
    </div>
  );
}

function Chip({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px 3px 6px', borderRadius: 999, background: '#f3e7c6', color: GOLD_TEXT, fontSize: 10.5, fontWeight: 600 }}>
      <Icon name={icon} size={14} />
      {children}
    </div>
  );
}

function LineItems() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 11, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 10 }}>
      <div style={row}><span>Back door install</span><span>$780.00</span></div>
      <div style={row}><span>Hardware &amp; trim</span><span>$70.00</span></div>
    </div>
  );
}

// ── Slide 1 · Say it. It's invoiced. ────────────────────────────────────────
const WAVE = [5, 10, 14, 8, 12, 6, 11, 14, 7, 4, 9, 5, 3];

function InvoiceGraphic() {
  return (
    <>
      <div style={{ ...BASE, gap: 12 }}>
        <div style={{ ...row, alignItems: 'center' }}>
          <ContractorMark size={24} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: 11, letterSpacing: '.14em', color: GOLD_TEXT }}>INVOICE</div>
            <div style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>INV-0081 · Oct 1</div>
          </div>
        </div>
        <div>
          <div style={eyebrow}>BILL TO</div>
          <div style={{ fontFamily: MONT, fontWeight: 700, fontSize: 14, marginTop: 3 }}>Mike Davis</div>
        </div>
        <LineItems />
        <div style={{ ...row, alignItems: 'baseline', borderTop: `1px solid ${HAIRLINE}`, paddingTop: 9 }}>
          <span style={{ fontSize: 11, color: MUTED }}>Total</span>
          <span style={{ fontFamily: MONT, fontWeight: 800, fontSize: 20 }}>$850.00</span>
        </div>
      </div>

      {/* Voice pill */}
      <div style={{ ...OVERLAY, width: 262, padding: '10px 18px 10px 10px', borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 'none', width: 44, height: 44, borderRadius: '50%', background: GOLD, display: 'grid', placeItems: 'center' }}>
          <Icon name="mic" size={24} filled className="text-on-background" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 14 }}>
            {WAVE.map((h, i) => (
              <i key={i} style={{ width: 2.5, height: h, borderRadius: 2, background: i < 10 ? GOLD_TEXT : '#d9c7a0' }} />
            ))}
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.35 }}>“Invoice Mike Davis, back door install, 850”</div>
        </div>
      </div>
    </>
  );
}

// ── Slide 2 · Get paid your way. ────────────────────────────────────────────
function PaidGraphic() {
  return (
    <>
      <div style={{ ...BASE, gap: 10 }}>
        <div style={eyebrow}>AMOUNT DUE</div>
        <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: 34, lineHeight: 1, letterSpacing: '-0.02em' }}>$850.00</div>
        <div style={{ fontSize: 10.5, color: MUTED }}>Mike Davis · Due Oct 3</div>
        <div style={{ marginTop: 2 }}><LineItems /></div>
      </div>
      <PaymentsCard />
    </>
  );
}

const PAYMENT_TILES = ['Stripe', 'PayPal', 'Cash App', 'Venmo', 'Zelle'] as const;

/** "Accept payments": the five payment-method tiles, then the PAID chip. */
function PaymentsCard() {
  return (
    <div style={{ ...OVERLAY, bottom: 14 }}>
      <div style={{ fontFamily: MONT, fontWeight: 700, fontSize: 13 }}>Accept payments</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
        {PAYMENT_TILES.map((name) => (
          <div
            key={name}
            style={{ height: 50, borderRadius: 10, border: '1px solid #efe4d2', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', color: MUTED }}>{name}</span>
          </div>
        ))}
      </div>
      <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 6px', borderRadius: 999, background: '#c9f2d4', color: '#0f6d31', fontSize: 10.5 }}>
        <Icon name="check_circle" size={15} filled />
        <span style={{ fontWeight: 600, letterSpacing: '.08em' }}>PAID</span>
        <span>· Mike Davis paid $850.00</span>
      </div>
    </div>
  );
}

// ── Slide 3 · Snap a receipt. It's logged. ──────────────────────────────────
function ExpenseGraphic() {
  return (
    <>
      <div style={{ position: 'absolute', left: 54, top: 18, width: 206, filter: 'drop-shadow(0 12px 22px rgba(31,27,19,.10))', ...fadeOut(48, 96) }}>
        <div style={{ background: '#fff', borderRadius: '6px 6px 0 0', padding: '16px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: MONO, fontSize: 9.5, color: MUTED }}>
          <div style={{ textAlign: 'center', fontFamily: MONT, fontWeight: 800, fontSize: 14, letterSpacing: '.06em', color: INK }}>LOWE’S</div>
          <div style={{ textAlign: 'center' }}>10/01/2026 · 08:14 AM</div>
          <div style={{ borderTop: '1px dashed #d9cdb5' }} />
          <div style={row}><span>2X4 STUD 8FT x6</span><span>22.68</span></div>
          <div style={row}><span>WOOD SCREWS 1LB</span><span>11.50</span></div>
          <div style={row}><span>CEDAR SHIMS</span><span>8.00</span></div>
          <div style={{ borderTop: '1px dashed #d9cdb5' }} />
          <div style={{ ...row, color: INK, fontWeight: 700, fontSize: 11 }}><span>TOTAL</span><span>$42.18</span></div>
          <div style={{ textAlign: 'center', paddingTop: 4 }}>THANK YOU</div>
        </div>
        {/* torn bottom edge */}
        <div style={{ height: 8, background: 'linear-gradient(-45deg, transparent 6px, #fff 0), linear-gradient(45deg, transparent 6px, #fff 0)', backgroundSize: '12px 8px', backgroundRepeat: 'repeat-x', backgroundPosition: 'left bottom' }} />
      </div>

      <div style={{ ...OVERLAY, width: 236 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 'none', width: 38, height: 38, borderRadius: 11, background: '#f6ecd9', display: 'grid', placeItems: 'center' }}>
            <Icon name="receipt_long" size={21} className="text-primary" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: MONT, fontWeight: 700, fontSize: 14 }}>Lowe’s</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Supplies · Oct 1</div>
          </div>
          <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: 19 }}>$42.18</div>
        </div>
        <div style={{ alignSelf: 'flex-start' }}><Chip icon="check">Logged</Chip></div>
      </div>
    </>
  );
}

// ── Slide 4 · Your books, one tap. ──────────────────────────────────────────
const REPORT_ROWS: [string, string][] = [
  ['Mike Davis', '$850.00'],
  ['Sarah Lee', '$1,200.00'],
  ['Tom Alvarez', '$640.00'],
  ['Priya Shah', '$1,560.00'],
];

function Stat({ value, label, dot, divider = false }: { value: string; label: string; dot: string; divider?: boolean }) {
  return (
    <div style={divider ? { borderLeft: `1px solid ${HAIRLINE}`, paddingLeft: 10 } : undefined}>
      <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: 17 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: MUTED, marginTop: 3 }}>
        <i style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />{label}
      </div>
    </div>
  );
}

function ReportsGraphic() {
  return (
    <>
      <div style={{ ...BASE, borderRadius: 6, gap: 9 }}>
        <div style={{ ...row, alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: 13 }}>Income Summary</div>
            <div style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>September 2026</div>
          </div>
          <ContractorMark size={20} />
        </div>
        <div style={{ ...row, fontSize: 8, fontWeight: 600, letterSpacing: '.12em', color: MUTED, borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: 5, marginTop: 4 }}>
          <span>CLIENT</span><span>AMOUNT</span>
        </div>
        {REPORT_ROWS.map(([who, amt]) => (
          <div key={who} style={{ ...row, fontSize: 10.5 }}><span>{who}</span><span>{amt}</span></div>
        ))}
      </div>

      <div style={OVERLAY}>
        <div style={{ ...row, alignItems: 'center' }}>
          <div style={{ fontFamily: MONT, fontWeight: 700, fontSize: 13 }}>September</div>
          <Chip icon="picture_as_pdf">PDF</Chip>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.15fr', gap: 8 }}>
          <Stat value="$4,250" label="Income" dot="#1b7a3e" />
          <Stat value="$612" label="Spent" dot="#8a8170" />
          <Stat value="$3,638" label="Kept" dot={GOLD} divider />
        </div>
      </div>
    </>
  );
}

// ── Slide 5 · Your week at a glance. ────────────────────────────────────────
const WEEK: [string, number, boolean][] = [
  ['M', 38, true], ['T', 72, true], ['W', 52, true], ['T', 100, true], ['F', 30, false], ['S', 14, false], ['S', 6, false],
];

function RecapGraphic() {
  return (
    <>
      <div style={{ ...BASE, padding: '16px 18px', gap: 12 }}>
        <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.1em', color: MUTED }}>SEP 28 – OCT 4</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, alignItems: 'end', height: 74 }}>
          {WEEK.map(([, h, past], i) => (
            <div key={i} style={{ height: `${h}%`, borderRadius: 5, background: past ? GOLD : '#ecdcab' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, textAlign: 'center', fontSize: 9.5, color: MUTED }}>
          {WEEK.map(([d], i) => <span key={i}>{d}</span>)}
        </div>
      </div>

      <div style={{ ...OVERLAY, bottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.1em', color: MUTED }}>THIS WEEK · NET</div>
            <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: 26, lineHeight: 1.1, marginTop: 3, letterSpacing: '-0.02em' }}>$1,636</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, textAlign: 'right' }}>
            <div><span style={{ color: MUTED }}>Income </span><b style={{ fontWeight: 600 }}>$1,850</b></div>
            <div><span style={{ color: MUTED }}>Expenses </span><b style={{ fontWeight: 600 }}>$214</b></div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 9, fontSize: 11 }}>
          <Icon name="handyman" size={16} className="text-primary" />
          <span style={{ color: MUTED }}>Most spent on:</span>
          <b style={{ fontWeight: 600 }}>Supplies</b>
        </div>
      </div>
    </>
  );
}

const GRAPHIC: Record<SlideId, () => JSX.Element> = {
  invoice: InvoiceGraphic,
  paid: PaidGraphic,
  expense: ExpenseGraphic,
  reports: ReportsGraphic,
  recap: RecapGraphic,
};

export function PaywallSlide({ id }: { id: SlideId }) {
  const [a, b] = SLIDE_TITLE[id];
  const Graphic = GRAPHIC[id];
  return (
    <div style={{ position: 'relative', width: SLIDE_W, height: SLIDE_H, overflow: 'hidden', background: '#fff8f0', fontFamily: INTER, color: INK }}>
      {/* warm glow + two soft white swooshes behind the graphic */}
      <div aria-hidden style={{ position: 'absolute', left: '50%', top: 96, width: 380, height: 220, transform: 'translateX(-50%)', background: 'radial-gradient(closest-side, #f8ead0, rgba(248,234,208,0))' }} />
      <svg aria-hidden width={393} height={216} viewBox="0 0 393 216" style={{ position: 'absolute', left: 0, top: 84 }}>
        <path d="M-10 186 C 90 120, 210 210, 405 70" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
        <path d="M-10 196 C 100 140, 220 222, 405 92" fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={1.5} strokeLinecap="round" />
      </svg>

      <h2 style={{ position: 'absolute', top: 8, left: 0, right: 0, margin: 0, textAlign: 'center', fontFamily: MONT, fontWeight: 800, fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.025em' }}>
        {a}<br />{b}
      </h2>

      <div aria-hidden style={{ position: 'absolute', left: 0, top: 84, width: SLIDE_W, height: 216, overflow: 'hidden' }}>
        <Graphic />
      </div>
    </div>
  );
}
