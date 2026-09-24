'use client';
/* ═══ Tutorial mock-UI primitives ═══
   Every slide's illustration is a MOCK of the real screen it describes, built
   from the app's own primitives — no screenshots, no images, no hardcoded hex.
   Colors come only from the design tokens (tailwind.config.ts), so a theme
   change carries through and the mocks can't rot out of sync with the app.
   A gold spotlight ring (the same #d4af37 selected-state ring used app-wide,
   pulled from the token in globals.css) highlights the one control a slide is
   about. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';

// The real bottom-nav tabs. `active` is the tab the mock screen sits on; a
// slide about Expenses or Tax passes 'books' so the user sees where in the app
// the feature lives (§ the tab bar is part of "this is a real screen").
export type TabKey = 'chat' | 'invoices' | 'books' | 'settings';
const MOCK_TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'chat', label: 'Chat', icon: 'mic' },
  { key: 'invoices', label: 'Invoices', icon: 'description' },
  { key: 'books', label: 'Books', icon: 'payments' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

export function MockTabBar({ active }: { active: TabKey }) {
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

/** The phone-screen shell: the real header wordmark + help icon and the real
 *  bottom tab bar, so every mock reads as an actual On It screen. */
export function MockShell({ active, children }: { active: TabKey; children: React.ReactNode }) {
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
export function MockBubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
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
 *  down. `captureId`/`micId` mark whichever control a slide spotlights. */
export function MockComposer({ captureId, micId }: { captureId?: string; micId?: string }) {
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

/** A scaled-down Books stat tile, matching the dashboard's Stat. */
export function MiniStat({ label, value, icon, iconCls, tone }: {
  label: string; value: string; icon: IconName; iconCls: string; tone: string;
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

// ── Spotlight overlay ───────────────────────────────────────────
/** Measures the [data-spotlight="target"] element inside `containerRef` and
 *  draws the gold ring over it. Re-measures on resize, on icon-font load, and
 *  when the slide becomes active, so the ring tracks the real layout instead of
 *  relying on hardcoded coordinates. */
export function Spotlight({ target, containerRef, active, pulse = true }: {
  target: string;
  containerRef: React.RefObject<HTMLDivElement>;
  active: boolean;
  // Pulse (first-run, one slide on screen, eye-directing) vs a static ring
  // (reference doc, several rings on a scrollable stack — labels, not blinks).
  pulse?: boolean;
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
    // The icon font (display: block) may land after first paint and change the
    // target's size — re-measure once it's ready.
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
      className={`${pulse ? 'spotlight-ring' : 'spotlight-ring-static'} pointer-events-none absolute z-10`}
      style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
    />
  );
}

/** One slide's illustration: its mock screen plus the spotlight ring overlaid
 *  on the target control. Takes only what it needs (no Slide type import) so
 *  slides.tsx can import the mock primitives without a circular reference. */
export function SlideMock({ mock, spotlight, active, pulse = true }: {
  mock: React.ReactNode;
  spotlight: string;
  active: boolean;
  pulse?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} className="relative w-full max-w-[320px]">
      {mock}
      <Spotlight target={spotlight} containerRef={containerRef} active={active} pulse={pulse} />
    </div>
  );
}
