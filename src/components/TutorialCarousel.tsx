'use client';
/* ═══ TutorialCarousel — swipeable "how On It works" walkthrough ═══
   Audience may have low literacy: each slide pairs a short headline + one or
   two plain sentences with a MOCK of the real screen it describes, built from
   the app's own primitives (no screenshots, no images). A gold spotlight ring
   — the same #d4af37 selected-state ring used everywhere else — highlights the
   one control each slide is about.

   Slides are a config array (SLIDES), never hardcoded JSX in the render tree,
   so copy and order stay in one place. Persistence is per-user + versioned:
   bump TUTORIAL_VERSION when the walkthrough changes and every user sees it
   once more on their next app load.

   Triggers (wired in (app)/layout.tsx):
     • auto-show once after onboarding — a fresh account has seen version 0,
       which is behind current, so it opens on the first app screen.
     • reopen any time from the header "?" icon.                             */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';

/* Bump when the walkthrough content changes — every user then sees it once
   more (their stored last-seen version falls behind this). */
export const TUTORIAL_VERSION = 1;

// ── Per-user last-seen persistence ──────────────────────────────
// Keyed by user id so it's genuinely per-user on the device, matching the
// codebase's other local flags (onit_reminder_prompted, chat store). Swap the
// body of these for a profiles column later without touching the component.
const seenKey = (userId: string) => `onit_tutorial_v:${userId}`;

export function getSeenVersion(userId: string): number {
  try {
    return Number(localStorage.getItem(seenKey(userId))) || 0;
  } catch {
    return 0;
  }
}

/** True when this user is behind the current walkthrough (never seen it, or an
 *  older version). Drives the auto-show. */
export function shouldAutoShowTutorial(userId: string): boolean {
  return getSeenVersion(userId) < TUTORIAL_VERSION;
}

export function markTutorialSeen(userId: string) {
  try {
    localStorage.setItem(seenKey(userId), String(TUTORIAL_VERSION));
  } catch {
    /* storage full/blocked — worst case it shows again next load */
  }
}

// ── Mock screen primitives (built from the real token classes) ──
type TabKey = 'chat' | 'invoices' | 'books' | 'settings';
const MOCK_TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'chat', label: 'Chat', icon: 'mic' },
  { key: 'invoices', label: 'Invoices', icon: 'description' },
  { key: 'books', label: 'Books', icon: 'payments' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

function MockTabBar({ active }: { active: TabKey }) {
  return (
    <div className="glass-nav flex justify-around border-t border-outline-variant/40 px-1 py-1">
      {MOCK_TABS.map(({ key, label, icon }) => (
        <div
          key={key}
          className={`flex flex-col items-center gap-0.5 rounded-full px-3 py-1 text-[10px] font-semibold tracking-wide
            ${active === key ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}`}
        >
          <Icon name={icon} size={18} filled={active === key} />
          {label}
        </div>
      ))}
    </div>
  );
}

/** The phone-screen shell: the real header wordmark + "?" and the real bottom
 *  tab bar, so every mock reads as an actual On It screen. */
function MockShell({ active, children }: { active: TabKey; children: React.ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-card border border-outline-variant bg-background shadow-card">
      <div className="flex items-center justify-between border-b border-outline-variant px-3 py-2">
        <span className="font-display text-base font-extrabold">
          On It<span className="text-primary">.</span>
        </span>
        <Icon name="help" size={18} className="text-on-surface-variant" />
      </div>
      <div className="px-3 py-3">{children}</div>
      <MockTabBar active={active} />
    </div>
  );
}

/** A chat bubble in the mock (assistant left, user right). */
function MockBubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-card px-3 py-2 text-[13px] leading-snug
          ${role === 'user'
            ? 'rounded-br-md bg-primary-container text-on-primary-container'
            : 'rounded-bl-md border border-outline-variant/30 bg-surface-container-lowest'}`}
      >
        {children}
      </div>
    </div>
  );
}

/** The chat composer row (camera/gallery stack, mic FAB, field, send), scaled
 *  down. `captureRef`/`micRef` mark whichever control a slide spotlights. */
function MockComposer({ captureId, micId }: { captureId?: string; micId?: string }) {
  return (
    <div className="mt-3 flex items-end gap-1.5">
      <div data-spotlight={captureId} className="flex flex-col gap-1">
        <span className="grid h-7 w-7 place-items-center rounded-full border border-outline-variant bg-surface-container-lowest text-primary">
          <Icon name="photo_camera" size={15} />
        </span>
        <span className="grid h-7 w-7 place-items-center rounded-full border border-outline-variant bg-surface-container-lowest text-primary">
          <Icon name="photo_library" size={15} />
        </span>
      </div>
      <span
        data-spotlight={micId}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary-container text-on-background shadow-card-raised"
      >
        <Icon name="mic" size={24} filled />
      </span>
      <div className="input flex h-10 min-h-0 flex-1 items-center py-0 text-[13px] text-on-surface-variant/60">
        Or type it…
      </div>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-inverse-surface text-inverse-on-surface">
        <Icon name="send" size={16} filled />
      </span>
    </div>
  );
}

/** A scaled-down Books stat tile, matching dashboard's Stat. */
function MiniStat({ label, value, icon, iconCls, tone }: {
  label: string; value: string; icon: string; iconCls: string; tone: string;
}) {
  return (
    <div className="card p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={`grid h-6 w-6 place-items-center rounded-lg ${iconCls}`}>
          <Icon name={icon} size={14} />
        </span>
        <span className="text-[10px] font-semibold text-on-surface-variant/80">{label}</span>
      </div>
      <div className={`font-display text-base font-bold leading-tight ${tone}`}>{value}</div>
    </div>
  );
}

// ── Slide config ────────────────────────────────────────────────
// Each slide names its spotlight target; the matching element carries the same
// value in `data-spotlight`. The Spotlight overlay measures that element and
// draws the gold ring over it, so positions never need hardcoding.
interface Slide {
  id: string;
  headline: string;
  body: string;
  mockScreen: React.ReactNode;
  spotlight: string;
}

const SLIDES: Slide[] = [
  {
    id: 'mic',
    headline: 'Just say it',
    body: "Tap the mic and talk. “Invoice Cyril four fifty for a door install.” On It writes it up.",
    spotlight: 'mic',
    mockScreen: (
      <MockShell active="chat">
        <div className="space-y-2">
          <MockBubble role="assistant">Tell me about the job — who it&apos;s for and what you did.</MockBubble>
          <MockBubble role="user">Invoice Cyril four fifty for a door install.</MockBubble>
        </div>
        <MockComposer micId="mic" />
      </MockShell>
    ),
  },
  {
    id: 'draft',
    headline: 'Check it before it goes',
    body: 'Every invoice comes up as a draft first. Fix a price, change a name, add a line. Nothing sends until you say so.',
    spotlight: 'lineitems',
    mockScreen: (
      <MockShell active="chat">
        <div className="card border-primary-container/50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <Icon name="description" size={14} /> Invoice for Cyril
          </div>
          <div data-spotlight="lineitems">
            <div className="flex justify-between py-0.5 text-[13px]"><span>Door install</span><span className="font-display font-bold">$400.00</span></div>
            <div className="flex justify-between py-0.5 text-[13px]"><span>Hardware</span><span className="font-display font-bold">$35.00</span></div>
            <div className="flex justify-between py-0.5 text-[13px]"><span>Haul-away</span><span className="font-display font-bold">$15.00</span></div>
          </div>
          <div className="mt-2 flex items-end justify-between border-t border-outline-variant pt-2">
            <span className="pb-1 text-[11px] font-semibold uppercase text-on-surface-variant">Total</span>
            <span className="font-display text-2xl tracking-tight text-on-background">$450.00</span>
          </div>
          <div className="btn-primary mt-2 min-h-0 w-full py-2 text-[13px]">
            <Icon name="attach_file" size={15} /> Looks right — send it
          </div>
        </div>
      </MockShell>
    ),
  },
  {
    id: 'send',
    headline: 'Send it from the job site',
    body: 'One tap makes the PDF and sends it. Email or text, your call.',
    spotlight: 'send',
    mockScreen: (
      <MockShell active="invoices">
        <div className="card p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display text-sm font-bold">Cyril</div>
              <div className="text-[11px] text-on-surface-variant">INV-0001 · draft</div>
            </div>
            <div className="font-display text-base font-bold text-primary">$450.00</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="chip min-h-0 gap-1 border-paid px-2 py-1 text-[11px] text-paid">
              <Icon name="check_circle" size={14} /> Mark paid
            </span>
            <span data-spotlight="send" className="chip min-h-0 gap-1 px-2 py-1 text-[11px]">
              <Icon name="attach_file" size={14} /> Share PDF
            </span>
          </div>
        </div>
        <div className="mt-2 rounded-input border border-outline-variant bg-surface-container-lowest p-3">
          <div className="mb-2 h-2 w-16 rounded bg-surface-variant" />
          <div className="mb-1 h-1.5 w-full rounded bg-surface-variant/70" />
          <div className="mb-1 h-1.5 w-4/5 rounded bg-surface-variant/70" />
          <div className="h-1.5 w-2/3 rounded bg-surface-variant/70" />
        </div>
      </MockShell>
    ),
  },
  {
    id: 'paid',
    headline: 'Know who owes you',
    body: 'Mark it paid the second the money lands. Anything still outstanding stays front and center.',
    spotlight: 'markpaid',
    mockScreen: (
      <MockShell active="invoices">
        <div className="mb-2 flex gap-1.5">
          <span className="chip min-h-0 px-2.5 py-1 text-[11px]">All</span>
          <span className="chip chip-selected min-h-0 px-2.5 py-1 text-[11px]">Unpaid</span>
          <span className="chip min-h-0 px-2.5 py-1 text-[11px]">Paid</span>
        </div>
        <div className="card p-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-display text-sm font-bold">Cyril</div>
              <div className="text-[11px] text-on-surface-variant/70">INV-0001</div>
            </div>
            <span className="status-chip bg-sent-container px-2 py-1 text-[10px] text-sent">
              <Icon name="send" size={13} /> sent
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-display text-lg tracking-tight text-on-background">$450.00</span>
            <span data-spotlight="markpaid" className="chip min-h-0 gap-1 border-paid px-2 py-1 text-[11px] text-paid">
              <Icon name="check_circle" size={14} /> Mark paid
            </span>
          </div>
        </div>
      </MockShell>
    ),
  },
  {
    id: 'receipt',
    headline: 'Snap the receipt',
    body: 'Take a picture of it or upload one from your phone. On It pulls out the amount and logs the expense.',
    spotlight: 'capture',
    mockScreen: (
      <MockShell active="chat">
        <div className="space-y-2">
          <MockBubble role="assistant">Snap a photo of any receipt and I&apos;ll log the expense for you.</MockBubble>
        </div>
        <MockComposer captureId="capture" />
      </MockShell>
    ),
  },
  {
    id: 'books',
    headline: 'See what you actually kept',
    body: "Money in, money out, what's left. Updates as you work.",
    spotlight: 'totals',
    mockScreen: (
      <MockShell active="books">
        <div data-spotlight="totals" className="space-y-2">
          <div className="rounded-card bg-inverse-surface p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-inverse-primary/80">Net (all time)</div>
            <div className="font-display text-2xl tracking-tight text-inverse-primary">$3,180.00</div>
            <div className="mt-0.5 text-[10px] text-inverse-on-surface/60">12 invoices created</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Collected" value="$4,050" icon="check_circle" iconCls="bg-paid-container text-paid" tone="text-paid" />
            <MiniStat label="Still owed" value="$900" icon="pending" iconCls="bg-primary-fixed text-primary" tone="text-primary" />
            <MiniStat label="Spent" value="$870" icon="shopping_cart" iconCls="bg-error-container text-error" tone="text-error" />
            <MiniStat label="Deductible" value="$610" icon="receipt_long" iconCls="bg-secondary-container text-on-surface" tone="text-on-surface" />
          </div>
        </div>
      </MockShell>
    ),
  },
  {
    id: 'tax',
    headline: 'One PDF for your tax guy',
    body: "Your whole year totaled up. Hand it over, you're done.",
    spotlight: 'taxsummary',
    mockScreen: (
      <MockShell active="books">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Spent" value="$8,940" icon="shopping_cart" iconCls="bg-error-container text-error" tone="text-error" />
          <MiniStat label="Deductible" value="$6,120" icon="receipt_long" iconCls="bg-secondary-container text-on-surface" tone="text-on-surface" />
        </div>
        <div className="mt-2 space-y-2">
          <div className="btn-primary min-h-0 w-full py-2 text-[13px]">
            <Icon name="add" size={16} /> Add expense
          </div>
          <div className="btn-outline min-h-0 w-full py-2 text-[13px] text-primary">
            See all expenses <Icon name="arrow_forward" size={14} />
          </div>
          <div data-spotlight="taxsummary" className="btn-outline min-h-0 w-full py-2 text-[13px] text-primary">
            <Icon name="receipt_long" size={14} /> Tax summary
          </div>
        </div>
      </MockShell>
    ),
  },
  {
    id: 'brand',
    headline: 'Make it look like your business',
    body: 'Add your logo and details, pick a template. Your invoices with your name on them.',
    spotlight: 'branding',
    mockScreen: (
      <MockShell active="settings">
        <div data-spotlight="branding" className="space-y-2">
          <div className="card p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">Logo</div>
            <div className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface-container">
                <Icon name="image" size={18} className="text-on-surface-variant" />
              </span>
              <span className="chip min-h-0 gap-1 px-2 py-1 text-[11px]">
                <Icon name="upload" size={14} /> Upload
              </span>
            </div>
          </div>
          <div className="card p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">Invoice style</div>
            <div className="flex flex-wrap gap-1.5">
              <span className="chip min-h-0 px-2 py-1 text-[11px]">Classic</span>
              <span className="chip min-h-0 px-2 py-1 text-[11px]">Ledger</span>
              <span className="chip min-h-0 px-2 py-1 text-[11px]">Industrial</span>
              <span className="chip min-h-0 px-2 py-1 text-[11px]">Friendly</span>
            </div>
          </div>
        </div>
      </MockShell>
    ),
  },
];

// ── Spotlight overlay ───────────────────────────────────────────
/** Measures the [data-spotlight="target"] element inside `containerRef` and
 *  draws the gold ring over it. Re-measures on resize, on icon-font load, and
 *  when the slide scrolls into view, so the ring tracks the real layout instead
 *  of relying on hardcoded coordinates. */
function Spotlight({ target, containerRef, active }: {
  target: string;
  containerRef: React.RefObject<HTMLDivElement>;
  active: boolean;
}) {
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const measure = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const el = c.querySelector<HTMLElement>(`[data-spotlight="${target}"]`);
    if (!el) { setBox(null); return; }
    const cr = c.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    setBox({ top: er.top - cr.top, left: er.left - cr.left, width: er.width, height: er.height });
  }, [target, containerRef]);

  useLayoutEffect(() => { measure(); }, [measure, active]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    const el = c.querySelector<HTMLElement>(`[data-spotlight="${target}"]`);
    if (el) ro.observe(el);
    window.addEventListener('resize', measure);
    // Icons load from the Material Symbols stylesheet after first paint and
    // change the target's size — re-measure once they're ready.
    const t = setTimeout(measure, 300);
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); clearTimeout(t); };
  }, [measure, containerRef, target]);

  if (!box) return null;
  const pad = 6;
  return (
    <div
      aria-hidden
      className="spotlight-ring pointer-events-none absolute z-10"
      style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
    />
  );
}

/** One slide: its mock screen plus the spotlight ring overlaid on the target. */
function CarouselSlide({ slide, active }: { slide: Slide; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} className="relative w-full max-w-[320px]">
      {slide.mockScreen}
      <Spotlight target={slide.spotlight} containerRef={containerRef} active={active} />
    </div>
  );
}

// ── Carousel ────────────────────────────────────────────────────
export default function TutorialCarousel({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Skip — top-right, dismisses from any slide */}
      <div className="flex justify-end px-4 py-3">
        <button
          className="min-h-touch rounded-full px-4 text-label-lg font-semibold text-on-surface-variant transition-transform active:scale-95"
          onClick={onClose}
        >
          Skip
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {SLIDES.map((s, i) => (
          <div key={s.id} className="flex w-full shrink-0 snap-center flex-col items-center justify-center gap-6 px-6 pb-8">
            <CarouselSlide slide={s} active={i === index} />
            <div className="text-center">
              <h2 className="font-display text-2xl font-extrabold">{s.headline}</h2>
              <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-primary-container' : 'w-2 bg-outline-variant'}`}
          />
        ))}
      </div>
    </div>
  );
}
