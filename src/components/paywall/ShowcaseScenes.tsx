'use client';
// The showcase's four artworks, ported from the mockup
// (design-reference/paywall-mockup.html, "Step 1 · What you win"): invoice,
// estimate, payment apps, and the dark recap card. Each scene is the mockup's
// headline (+ subtitle where it has one) over its fixed 432px #faefdc tile.
//
// Static artwork only: every scene below is drawn in its END state (approved,
// converted, switched on, added, the finished invoice). The reel and the
// mockup's entrance layers are separate commits; this file is the resting
// picture either way.
import Icon from '@/components/Icon';
import { RECAPS_LIVE } from '@/lib/recaps-live';

export type SceneId = 'invoice' | 'estimate' | 'payments' | 'recap';

/** The reel's scenes, in the mockup's order. The recap story is live-only, so
 *  a dark-launched build must not carry a fourth scene. */
export const SCENES: SceneId[] = RECAPS_LIVE
  ? ['invoice', 'estimate', 'payments', 'recap']
  : ['invoice', 'estimate', 'payments'];

/** The mockup's headline block, two lines reserved so the tile never shifts. */
function Heading({ title, subtitle }: { title: React.ReactNode; subtitle?: string }) {
  return (
    <div className="min-h-[78px]">
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
function Tile({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`h-[432px] overflow-hidden rounded-[20px] bg-tile ${className}`}>{children}</div>
  );
}

function InvoiceScene() {
  return (
    <>
      <Heading title={<>Say it. It’s invoiced.</>} subtitle="Talk through the job. On It writes the invoice." />
      <Tile className="flex flex-col gap-3.5 px-4 py-[18px]">
        <div className="flex items-center gap-[11px] rounded-full border border-hairline bg-surface-container-lowest py-1.5 pl-1.5 pr-3.5">
          <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-primary-container">
            <Icon name="mic" size={21} filled className="text-on-background" />
          </span>
          {/* The mockup types this line on one row; at rest the whole sentence
              is there, so it wraps rather than clipping the amount on a 375px
              phone. */}
          <span className="min-w-0 flex-1 text-[13px] font-medium leading-[1.3]">
            “Invoice Mike Davis, back door install, 850”
          </span>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface-container-lowest p-4">
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

          <div>
            <div className="text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-on-surface-variant">
              Bill to
            </div>
            <div className="mt-[5px] font-display text-[18px] font-extrabold leading-[1.2]">Mike Davis</div>
          </div>

          <div className="flex flex-col gap-2 font-mono text-[13.5px] leading-[1.3]">
            <div className="flex justify-between">
              <span>Back door install</span>
              <span>$780.00</span>
            </div>
            <div className="flex justify-between">
              <span>Hardware &amp; trim</span>
              <span>$70.00</span>
            </div>
          </div>

          <div className="flex items-baseline justify-between border-t-[1.5px] border-dashed border-dash pt-2.5">
            <span className="text-[13px] font-semibold leading-none text-on-surface-variant">Total</span>
            <span className="font-display text-[28px] font-extrabold leading-none tabular-nums text-primary">
              $850.00
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
        <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface-container-lowest p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-positive-container px-2.5 py-1.5 text-[11.5px] font-semibold uppercase leading-none tracking-[.1em] text-positive">
              <Icon name="verified" size={15} />
              Approved
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
              />
            </svg>
            <div className="absolute bottom-2 left-3 font-mono text-[10.5px] font-medium leading-none text-on-surface-variant">
              Signed by Mike Davis
            </div>
            <div className="absolute right-2.5 top-2.5 rotate-[-9deg] rounded-lg border-[2.5px] border-positive bg-positive-container/55 px-2.5 py-[5px] font-display text-[17px] font-extrabold uppercase leading-none tracking-[.08em] text-positive">
              Approved
            </div>
          </div>

          <div className="flex h-[52px] items-center justify-center gap-2 rounded-full border border-[#8fd1a5] bg-positive-container font-display text-[15px] font-bold text-positive">
            <Icon name="check_circle" size={20} />
            Converted to INV-0081
          </div>
        </div>
      </Tile>
    </>
  );
}

/** One payment-method row: icon tile, name, the detail line, and its state. */
function MethodRow({
  mark,
  tint,
  name,
  detail,
  detailMono = false,
  first,
  last,
}: {
  mark: React.ReactNode;
  tint: string;
  name: string;
  detail: string;
  detailMono?: boolean;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex h-11 items-center gap-[11px] px-3 ${first ? '' : ''} ${last ? '' : 'border-b border-hairline'}`}
    >
      <span className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg ${tint}`}>{mark}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium leading-[1.2]">{name}</div>
        <div
          className={`text-[10.5px] leading-[1.2] text-on-surface-variant ${detailMono ? 'font-mono' : ''}`}
        >
          {detail}
        </div>
      </div>
      <span className="text-[12.5px] font-semibold leading-none text-positive">Added</span>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
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
              <div className="text-[10.5px] leading-[1.2] text-on-surface-variant">Visa, Mastercard, Apple Pay</div>
            </div>
            <span className="text-[12.5px] font-semibold leading-none text-positive">On</span>
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
              <div className="font-mono text-[10.5px] leading-[1.2] text-on-surface-variant">Checking ••4821</div>
            </div>
            <span className="text-[12.5px] font-semibold leading-none text-positive">On</span>
          </div>
        </div>

        <Eyebrow>Payment apps</Eyebrow>
        <div className="overflow-hidden rounded-[14px] border border-hairline bg-white">
          <MethodRow
            first
            name="Zelle"
            detail="(555) 014-2290"
            detailMono
            tint="bg-chip"
            mark={<span className="font-display text-base font-extrabold leading-none text-[#6d1ed4]">Z</span>}
          />
          <MethodRow
            name="Cash App"
            detail="$ReyesHome"
            detailMono
            tint="bg-[#00c244]"
            mark={<span className="font-display text-base font-extrabold leading-none text-white">$</span>}
          />
          <MethodRow
            name="PayPal"
            detail="paypal.me/reyeshome"
            detailMono
            tint="bg-chip"
            mark={<span className="font-display text-base font-extrabold leading-none text-[#003087]">P</span>}
          />
          <MethodRow
            last
            name="Venmo"
            detail="@Reyes-Home"
            detailMono
            tint="bg-chip"
            mark={<span className="font-display text-base font-extrabold leading-none text-[#008cff]">V</span>}
          />
        </div>

        <div className="mt-auto flex items-center gap-2.5 rounded-full border border-hairline bg-white py-1.5 pl-1.5 pr-2 shadow-[0_8px_20px_-8px_rgba(31,27,19,.18)]">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-positive-container">
            <Icon name="payments" size={19} className="text-positive" />
          </span>
          <div className="flex min-w-0 flex-1 gap-1 text-[13.5px] font-medium leading-none">
            Mike Davis paid <span className="font-bold tabular-nums">$850.00</span>
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
        <div className="rounded-[20px] bg-[#322d26] px-[18px] pb-4 pt-[18px] text-background">
          <div className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold leading-none text-[#d9cfbd]">
            <Icon name="auto_awesome" size={16} filled className="text-primary-container" />
            Recap · Oct 19 – 25
          </div>
          <div className="mt-3 font-display text-[40px] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums">
            $2,415
          </div>
          <div className="mt-1.5 text-[13px] font-medium leading-none text-[#cfc5b2]">Net · this week · 6 invoices</div>

          <div className="mt-[18px] grid h-28 grid-cols-7 items-end gap-[9px]">
            {BARS.map((h, i) => (
              <div
                key={i}
                style={{ height: `${h}%` }}
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
          <div className="rounded-2xl border border-hairline bg-white px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold leading-none text-on-surface-variant">
              <span className="h-[7px] w-[7px] rounded-full bg-positive" />
              Collected
            </div>
            <div className="mt-[9px] font-display text-[18px] font-extrabold leading-none">
              $3,120<span className="text-xs">.00</span>
            </div>
          </div>
          <div className="rounded-2xl border border-hairline bg-white px-3.5 py-3">
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
 *  scene remounts it (the reel's per-scene motion runs on mount). */
export default function ShowcaseScene({ id }: { id: SceneId }) {
  const scene =
    id === 'estimate' ? <EstimateScene />
    : id === 'payments' ? <PaymentsScene />
    : id === 'recap' ? <RecapScene />
    : <InvoiceScene />;
  return <div className="flex flex-col gap-3">{scene}</div>;
}
