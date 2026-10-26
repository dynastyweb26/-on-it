'use client';
// The showcase's four artworks, ported from the mockup
// (design-reference/paywall-mockup.html, "Step 1 · What you win"): invoice,
// estimate, payment apps, and the dark recap card. Each scene is the mockup's
// headline (+ subtitle where it has one) over its fixed 432px #faefdc tile.
//
// The mockup's oi-* motion is wired here with the mockup's own timings (the
// table lives on the keyframes in globals.css), one beat per 4.2s scene. Every
// element's resting CSS is the END frame, so with Reduce Motion on — the global
// rule turns animations off — the same artwork is shown finished, not blank.
// The layers that animate out ("Sent", "Off"/"Not set", the convert button)
// rest hidden: they are replaced by the frame that lands on top of them.
import type { CSSProperties, ReactNode } from 'react';
import Icon from '@/components/Icon';
import { RECAPS_LIVE } from '@/lib/recaps-live';

export type SceneId = 'invoice' | 'estimate' | 'payments' | 'recap';

/** The reel's scenes, in the mockup's order. The recap story is live-only, so
 *  a dark-launched build must not carry a fourth scene. */
export const SCENES: SceneId[] = RECAPS_LIVE
  ? ['invoice', 'estimate', 'payments', 'recap']
  : ['invoice', 'estimate', 'payments'];

/** The mockup's easing and its delay helper, `t(.3)` → "0.30s". */
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const t = (n: number) => `${n.toFixed(2)}s`;
const anim = (name: string, dur: string, at: number, ease = EASE, fill = 'both'): CSSProperties => ({
  animation: `${name} ${dur} ${ease} ${t(at)} ${fill}`,
});

/** The mockup's headline block, two lines reserved so the tile never shifts. */
function Heading({ title, subtitle }: { title: ReactNode; subtitle?: string }) {
  return (
    <div className="min-h-[78px]" style={anim('oi-up', '.5s', 0)}>
      <h2
        id="paywall-step-title"
        tabIndex={-1}
        className="font-display text-[25px] font-extrabold leading-[1.15] tracking-[-0.02em] outline-none"
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1.5 text-[14.5px] leading-[1.45] text-on-surface-variant [text-wrap:pretty]">{subtitle}</p>
      )}
    </div>
  );
}

/** The tile both the mockup and this port draw every scene inside. */
function Tile({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`h-[432px] overflow-hidden rounded-[20px] bg-tile ${className}`}>{children}</div>
  );
}

function InvoiceScene() {
  return (
    <>
      <Heading title={<>Say it. It’s invoiced.</>} subtitle="Talk through the job. On It writes the invoice." />
      <Tile className="flex flex-col gap-3.5 px-4 py-[18px]">
        <div
          className="flex items-center gap-[11px] rounded-full border border-hairline bg-surface-container-lowest py-1.5 pl-1.5 pr-3.5"
          style={anim('oi-up', '.4s', 0)}
        >
          <div className="relative h-[38px] w-[38px] shrink-0">
            {/* the mic's pulse: three ripples, then gone */}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-primary-container opacity-0"
              style={{ animation: `oi-ring 1.6s ${EASE} 3` }}
            />
            <span className="relative grid h-[38px] w-[38px] place-items-center rounded-full bg-primary-container">
              <Icon name="mic" size={21} filled className="text-on-background" />
            </span>
          </div>
          {/* Typed on, as the mockup does. It wraps rather than clipping the
              amount on a 375px phone; Reduce Motion shows it whole. */}
          <span
            className="min-w-0 flex-1 text-[13px] font-medium leading-[1.3]"
            style={anim('oi-type', '1.4s', 0.3, 'steps(44)')}
          >
            “Invoice Mike Davis, back door install, 850”
          </span>
        </div>

        <div
          className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface-container-lowest p-4"
          style={anim('oi-up', '.45s', 1.6)}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-[#2b2721] text-xs font-bold leading-none text-background">
              RH
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold leading-[1.2]">Reyes Home Repair</div>
              <div className="mt-[3px] text-[10.5px] font-semibold uppercase leading-[1.2] tracking-[.1em] text-on-surface-variant">
                Invoice
              </div>
            </div>
            <span className="font-mono text-xs font-medium leading-none text-on-surface-variant">INV-0081</span>
          </div>

          <span className="h-px bg-hairline" />

          <div style={anim('oi-up', '.4s', 1.9)}>
            <div className="text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-on-surface-variant">
              Bill to
            </div>
            <div className="mt-[5px] font-display text-[18px] font-extrabold leading-[1.2]">Mike Davis</div>
          </div>

          <div className="flex flex-col gap-2 font-mono text-[13.5px] leading-[1.3]">
            <div className="flex justify-between" style={anim('oi-up', '.35s', 2.15)}>
              <span>Back door install</span>
              <span>$780.00</span>
            </div>
            <div className="flex justify-between" style={anim('oi-up', '.35s', 2.4)}>
              <span>Hardware &amp; trim</span>
              <span>$70.00</span>
            </div>
          </div>

          <div
            className="flex items-baseline justify-between border-t-[1.5px] border-dashed border-dash pt-2.5"
            style={anim('oi-in', '.3s', 2.6, 'ease-out')}
          >
            <span className="text-[13px] font-semibold leading-none text-on-surface-variant">Total</span>
            {/* The mockup counts the total up from 0 to 850. */}
            <span className="font-display text-[28px] font-extrabold leading-none tabular-nums text-primary">
              <span className="sr-only">$850.00</span>
              <span aria-hidden className="oi-amt" />
            </span>
          </div>
        </div>
      </Tile>
    </>
  );
}

function EstimateScene() {
  return (
    <>
      <Heading title="Estimate approved." subtitle="Clients sign from a link. Convert it in one tap." />
      <Tile className="px-4 py-[18px]">
        <div
          className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface-container-lowest p-4"
          style={anim('oi-up', '.4s', 0)}
        >
          <div className="flex items-center justify-between">
            <div className="grid">
              {/* Sent lands, then the approved chip takes its place. */}
              <div
                className="oi-gone col-start-1 row-start-1 flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#f3ecdf] px-2.5 py-1.5 text-[11.5px] font-semibold uppercase leading-none tracking-[.1em] text-on-surface-variant"
                style={anim('oi-out', '.2s', 1.5, 'ease-out')}
              >
                <Icon name="send" size={15} />
                Sent
              </div>
              <div
                className="col-start-1 row-start-1 flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-positive-container px-2.5 py-1.5 text-[11.5px] font-semibold uppercase leading-none tracking-[.1em] text-positive"
                style={anim('oi-pop', '.4s', 1.6)}
              >
                <Icon name="verified" size={15} />
                Approved
              </div>
            </div>
            <span className="font-mono text-xs font-medium leading-none text-on-surface-variant">E-0040</span>
          </div>

          <div>
            <div className="font-display text-[21px] font-extrabold leading-[1.15]">Mike Davis</div>
            <div className="mt-1 text-[13px] leading-[1.3] text-on-surface-variant">Estimate · Back door install</div>
          </div>

          <div>
            <div className="text-xs font-semibold leading-none text-on-surface-variant">Estimate total</div>
            <div className="mt-1 font-display text-[30px] font-extrabold leading-[1.1] text-primary">$850.00</div>
          </div>

          <div className="relative flex h-24 items-center justify-center rounded-xl border border-hairline bg-[#fffdf9]">
            <svg width={170} height={64} viewBox="0 0 170 64" fill="none" aria-hidden>
              <path
                d="M14 46 C20 8 34 6 30 34 S38 60 56 40 S76 20 84 42 S102 54 118 34 S140 30 156 46"
                stroke="#1f1b13"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={420}
                style={anim('oi-draw', '1.1s', 0.4)}
              />
            </svg>
            <div
              className="absolute bottom-2 left-3 font-mono text-[10.5px] font-medium leading-none text-on-surface-variant"
              style={anim('oi-in', '.3s', 1.4, 'ease-out')}
            >
              Signed by Mike Davis
            </div>
            {/* The stamp's resting transform is its -9° landing. */}
            <div
              className="absolute right-2.5 top-2.5 rotate-[-9deg] rounded-lg border-[2.5px] border-positive bg-positive-container/[0.55] px-2.5 py-[5px] font-display text-[17px] font-extrabold uppercase leading-none tracking-[.08em] text-positive"
              style={anim('oi-stamp', '.45s', 1.6)}
            >
              Approved
            </div>
          </div>

          <div className="grid overflow-hidden">
            {/* Convert is pressed, then the converted chip pops over it. */}
            <div
              className="col-start-1 row-start-1 flex h-[52px] items-center justify-center rounded-full bg-primary-container font-display text-[15px] font-bold text-on-background"
              style={anim('oi-up', '.35s', 2)}
            >
              <div
                className="relative flex items-center justify-center gap-[9px]"
                style={anim('oi-press', '.3s', 2.55, 'ease-out')}
              >
                <Icon name="sync" size={20} />
                Convert to invoice
                <span
                  aria-hidden
                  className="absolute left-1/2 top-1/2 -ml-5 -mt-5 h-10 w-10 rounded-full bg-background opacity-0"
                  style={anim('oi-tap', '.55s', 2.55, 'ease-out')}
                />
              </div>
            </div>
            <div
              className="col-start-1 row-start-1 flex h-[52px] items-center justify-center gap-2 rounded-full border border-[#8fd1a5] bg-positive-container font-display text-[15px] font-bold text-positive"
              style={anim('oi-pop', '.4s', 2.95)}
            >
              <Icon name="check_circle" size={20} />
              Converted to INV-0081
            </div>
          </div>
        </div>
      </Tile>
    </>
  );
}

/** A right-hand state that swaps one label for another: the old one fades out
 *  100ms before the new one pops in, keeping its column. */
function Swap({ out, in: incoming, at }: { out: string; in: ReactNode; at: number }) {
  return (
    <span className="grid justify-items-end text-[12.5px] font-semibold leading-none">
      <span className="oi-gone col-start-1 row-start-1 text-[#8b806b]" style={anim('oi-out', '.15s', at - 0.1, 'ease-out')}>
        {out}
      </span>
      <span className="col-start-1 row-start-1 text-positive" style={anim('oi-in', '.2s', at + 0.05, 'ease-out')}>
        {incoming}
      </span>
    </span>
  );
}

/** One payment-method row: icon tile, name, the detail line (which appears a
 *  beat after the row), and the "Not set → Added" swap. */
function MethodRow({
  mark,
  tint,
  name,
  detail,
  at,
  last,
}: {
  mark: ReactNode;
  tint: string;
  name: string;
  detail: string;
  /** When this row's detail and state land. */
  at: number;
  last?: boolean;
}) {
  return (
    <div className={`flex h-11 items-center gap-[11px] px-3 ${last ? '' : 'border-b border-hairline'}`}>
      <span className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg ${tint}`}>{mark}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium leading-[1.2]">{name}</div>
        <div className="font-mono text-[10.5px] leading-[1.2] text-on-surface-variant" style={anim('oi-in', '.3s', at, 'ease-out')}>
          {detail}
        </div>
      </div>
      <Swap
        out="Not set"
        at={at}
        in={
          <span className="flex items-center gap-[3px]">
            <span style={anim('oi-pop', '.35s', at + 0.05)}>
              <Icon name="check" size={16} />
            </span>
            Added
          </span>
        }
      />
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="px-1 py-0.5 text-[10.5px] font-semibold uppercase leading-none tracking-[.14em] text-on-surface-variant">
      {children}
    </div>
  );
}

function PaymentsScene() {
  return (
    <>
      <Heading title={<>Add your payment apps.<br />Get paid faster.</>} />
      <Tile className="flex flex-col gap-[7px] px-3 py-3.5">
        <Eyebrow>Get paid online</Eyebrow>
        <div className="rounded-[14px] border border-hairline bg-white">
          <div className="flex h-11 items-center gap-[11px] px-3">
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-chip">
              <Icon name="credit_card" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium leading-[1.2]">Card &amp; digital wallets</div>
              <div
                className="text-[10.5px] leading-[1.2] text-on-surface-variant"
                style={anim('oi-in', '.3s', 0.4, 'ease-out')}
              >
                Visa, Mastercard, Apple Pay
              </div>
            </div>
            <Swap out="Off" at={0.45} in={<>On</>} />
          </div>
        </div>

        <Eyebrow>Bank</Eyebrow>
        <div className="rounded-[14px] border border-hairline bg-white">
          <div className="flex h-11 items-center gap-[11px] px-3">
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-chip">
              <Icon name="account_balance" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium leading-[1.2]">Bank transfer</div>
              <div
                className="font-mono text-[10.5px] leading-[1.2] text-on-surface-variant"
                style={anim('oi-in', '.3s', 0.75, 'ease-out')}
              >
                Checking ••4821
              </div>
            </div>
            <Swap out="Off" at={0.8} in={<>On</>} />
          </div>
        </div>

        <Eyebrow>Payment apps</Eyebrow>
        <div className="overflow-hidden rounded-[14px] border border-hairline bg-white">
          <MethodRow
            name="Zelle"
            detail="(555) 014-2290"
            at={1.1}
            tint="bg-chip"
            mark={<span className="font-display text-base font-extrabold leading-none text-[#6d1ed4]">Z</span>}
          />
          <MethodRow
            name="Cash App"
            detail="$ReyesHome"
            at={1.45}
            tint="bg-[#00c244]"
            mark={<span className="font-display text-base font-extrabold leading-none text-white">$</span>}
          />
          <MethodRow
            name="PayPal"
            detail="paypal.me/reyeshome"
            at={1.8}
            tint="bg-chip"
            mark={<span className="font-display text-base font-extrabold leading-none text-[#003087]">P</span>}
          />
          <MethodRow
            last
            name="Venmo"
            detail="@Reyes-Home"
            at={2.15}
            tint="bg-chip"
            mark={<span className="font-display text-base font-extrabold leading-none text-[#008cff]">V</span>}
          />
        </div>

        <div
          className="mt-auto flex items-center gap-2.5 rounded-full border border-hairline bg-white py-1.5 pl-1.5 pr-2 shadow-[0_8px_20px_-8px_rgba(31,27,19,.18)]"
          style={anim('oi-slideup', '.45s', 2.6)}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-positive-container">
            <Icon name="payments" size={19} className="text-positive" />
          </span>
          <div className="flex min-w-0 flex-1 gap-1 text-[13.5px] font-medium leading-none">
            Mike Davis paid
            <span className="font-bold tabular-nums">
              <span className="sr-only">$850.00</span>
              <span aria-hidden className="oi-amt-late" />
            </span>
          </div>
          <span className="rounded-full bg-positive-container px-2.5 py-1.5 text-[11px] font-bold uppercase leading-none tracking-[.1em] text-positive">
            Paid
          </span>
        </div>
      </Tile>
    </>
  );
}

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const BARS = [46, 72, 38, 100, 64, 24, 8];

function RecapScene() {
  return (
    <>
      <Heading title="Your week at a glance." subtitle="A recap of what came in and what went out." />
      <Tile className="flex flex-col gap-3 px-4 py-[18px]">
        <div className="rounded-[20px] bg-[#322d26] px-[18px] pb-4 pt-[18px] text-background" style={anim('oi-up', '.4s', 0)}>
          <div className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold leading-none text-[#d9cfbd]">
            <Icon name="auto_awesome" size={16} filled className="text-primary-container" />
            Recap · Oct 19 – 25
          </div>
          {/* The mockup counts the week's net up from 0 to $2,415. */}
          <div className="mt-3 font-display text-[40px] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums">
            <span className="sr-only">$2,415</span>
            <span aria-hidden className="oi-net" />
          </div>
          <div className="mt-1.5 text-[13px] font-medium leading-none text-[#cfc5b2]">Net · this week · 6 invoices</div>

          <div className="mt-[18px] grid h-28 grid-cols-7 items-end gap-[9px]">
            {BARS.map((h, i) => (
              <div
                key={i}
                style={{ height: `${h}%`, ...anim('oi-grow', '.6s', 0.3 + i * 0.1) }}
                className={`origin-bottom rounded-t-[6px] rounded-b-[3px] ${i === BARS.length - 1 ? 'bg-[#6a6255]' : 'bg-primary-container'}`}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-[9px] text-center font-mono text-[11px] font-medium text-[#a99f8c]">
            {WEEK.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div
            className="rounded-2xl border border-hairline bg-white px-3.5 py-3"
            style={anim('oi-up', '.4s', 1.6)}
          >
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold leading-none text-on-surface-variant">
              <span className="h-[7px] w-[7px] rounded-full bg-positive" />
              Collected
            </div>
            <div className="mt-[9px] font-display text-[18px] font-extrabold leading-none">
              $3,120<span className="text-xs">.00</span>
            </div>
          </div>
          <div
            className="rounded-2xl border border-hairline bg-white px-3.5 py-3"
            style={anim('oi-up', '.4s', 1.8)}
          >
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold leading-none text-on-surface-variant">
              <span className="h-[7px] w-[7px] rounded-full bg-[#8b806b]" />
              Spent
            </div>
            <div className="mt-[9px] font-display text-[18px] font-extrabold leading-none">
              $705<span className="text-xs">.00</span>
            </div>
          </div>
        </div>
      </Tile>
    </>
  );
}

/** One scene, headline + tile. Keyed by id at the call site so a change of
 *  scene remounts it and its motion replays. */
export default function ShowcaseScene({ id }: { id: SceneId }) {
  const scene =
    id === 'estimate' ? <EstimateScene />
    : id === 'payments' ? <PaymentsScene />
    : id === 'recap' ? <RecapScene />
    : <InvoiceScene />;
  return <div className="flex flex-col gap-3">{scene}</div>;
}
