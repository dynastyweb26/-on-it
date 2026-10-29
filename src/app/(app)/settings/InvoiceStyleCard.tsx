'use client';

// Business profile → Invoice style, inline in the page (no overlay, route or
// modal). The card owns its own Save button because the profile page has no
// page-level Save; the other fields still save on blur and Logo saves
// immediately.
//
// New saves write brand_colors in role order [background, accent, secondary?]
// and set color_roles_explicit = true. Legacy profiles hydrate their slots from
// the existing buildTheme() scoring, so the preview matches the current PDF
// until the first explicit save. Old snapshots stay on legacy scoring.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import InvoicePreviewFrame from '@/components/invoice/InvoicePreviewFrame';
import { buildTheme } from '@/lib/colors';
import {
  TEMPLATE_LABELS,
  type InvoiceRenderData,
  type TemplateKey,
} from '@/lib/pdf/templates';

const CARD_BORDER = '#EFE5D6';
const INK = '#1E1A16';
const LIGHT_INK = '#FBF5EA';
const GOLD = '#D5B035';
const GOLD_SOFT = '#FBF0CF';
const GOLD_TEXT = '#8A6D12';
const GREEN = '#2E6B4F';
const SLOT_BG = '#FAF4E8';
const EMPTY_BORDER = '#CDBFA8';
const WHITE_OUTLINE = '#D9CFBF';
const DEFAULT_BG = '#1A1A1A';
const DEFAULT_ACCENT = '#D4A017';

// A real A4 page is 794 × 1123 at 96dpi. The card caps the preview at this
// height; the shared frame derives its width from A4 and centers it, so the
// invoice fills the frame edge-to-edge with no letterboxing.
const PREVIEW_H = 340;

type StyleColor = { hex: string; name: string };
type StyleSnapshot = { template: TemplateKey; colors: (string | null)[] };
type StickyBox = { left: number; right: number; bottom: number };

// The footer sits above the whole bottom chrome, not just the tab bar: main's
// bottom edge is above the tab bar and the optional install banner, and the
// tab bar's own padding carries the safe-area inset. Measuring main avoids a
// hardcoded nav height (and accidentally covering the install banner).
function useMainBottomBox(enabled: boolean) {
  const [box, setBox] = useState<StickyBox | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBox(null);
      return;
    }
    const main = document.querySelector('main');
    if (!main) return;

    const measure = () => {
      const m = main.getBoundingClientRect();
      setBox({
        left: m.left,
        right: Math.max(0, window.innerWidth - m.right),
        bottom: Math.max(0, window.innerHeight - m.bottom),
      });
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(main);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      ro?.disconnect();
    };
  }, [enabled]);

  return box;
}

// The fixed footer covers the bottom of main. Pad main by exactly the footer's
// height while it is stuck, so the last page content (not just this card) can
// still scroll clear of it. Restore any prior inline value on hide/unmount.
function useMainBottomPadding(enabled: boolean, height: number) {
  useEffect(() => {
    if (!enabled || height <= 0) return;
    const main = document.querySelector('main');
    if (!main) return;
    const previous = main.style.paddingBottom;
    main.style.paddingBottom = `${height}px`;
    return () => {
      main.style.paddingBottom = previous;
    };
  }, [enabled, height]);
}

function StickySaveBar({
  box,
  label,
  muted,
  busy,
  error,
  onSave,
  onHeight,
}: {
  box: StickyBox;
  label: string;
  muted: boolean;
  busy: boolean;
  error: string;
  onSave: () => void;
  onHeight: (height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => onHeight(el.offsetHeight);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [onHeight]);

  return createPortal(
    <div
      ref={ref}
      data-kb-hide
      className="fixed z-[70] md:hidden"
      style={{ left: box.left, right: box.right, bottom: box.bottom }}
    >
      <div className="border-t border-outline-variant/40 bg-background px-4 pb-2.5 pt-2.5">
        {error && (
          <div
            role="alert"
            className="mb-2 rounded-xl bg-error-container px-3.5 py-2.5 text-sm font-semibold leading-5 text-error-on-container"
          >
            {error}
          </div>
        )}
        <button
          type="button"
          disabled={muted || busy}
          aria-busy={busy}
          onClick={onSave}
          className="h-[52px] w-full rounded-full text-base font-bold transition-colors disabled:cursor-not-allowed"
          style={{
            background: muted ? '#E8DFD0' : GOLD,
            color: muted ? '#8F8474' : INK,
          }}
        >
          {label}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// The design's exact 20-swatch order. Screen-local on purpose: the onboarding
// palette has different names and a few different hexes, and is out of scope.
const STYLE_PALETTE: StyleColor[] = [
  { hex: '#1A1A1A', name: 'Black' },
  { hex: '#3D3D3D', name: 'Charcoal' },
  { hex: '#FFFFFF', name: 'White' },
  { hex: '#708090', name: 'Slate' },
  { hex: '#1B2A4E', name: 'Navy' },
  { hex: '#2F5FE8', name: 'Blue' },
  { hex: '#38BDF8', name: 'Sky' },
  { hex: '#2E6B4F', name: 'Forest' },
  { hex: '#84CC16', name: 'Lime' },
  { hex: '#EA580C', name: 'Orange' },
  { hex: '#D4A017', name: 'Gold' },
  { hex: '#FACC15', name: 'Yellow' },
  { hex: '#B91C1C', name: 'Crimson' },
  { hex: '#DC2626', name: 'Red' },
  { hex: '#92400E', name: 'Brown' },
  { hex: '#D6B896', name: 'Sand' },
  { hex: '#7C3AED', name: 'Violet' },
  { hex: '#0D9488', name: 'Teal' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#C0C0C0', name: 'Silver' },
];

const TEMPLATE_OPTIONS: { key: TemplateKey; name: string; desc: string }[] = [
  { key: 'classic', name: 'Classic', desc: 'Serif, timeless' },
  { key: 'sidebar', name: 'Ledger', desc: 'Mono figures' },
  { key: 'industrial', name: 'Industrial', desc: 'Bold, blocky' },
  { key: 'friendly', name: 'Friendly', desc: 'Rounded, warm' },
];

// Existing profiles may carry one of the older palette hexes. Normalize on
// load so the saved pick still highlights in the new 20-swatch grid. Nothing
// is written until Save.
const LEGACY_HEX: Record<string, string> = {
  '#1B2A4A': '#1B2A4E', // Navy
  '#2B5CE6': '#2F5FE8', // Blue
  '#2D6A4F': '#2E6B4F', // Forest
  '#D4B896': '#D6B896', // Sand
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

function normalizeHex(hex: string): string {
  const upper = hex.toUpperCase();
  return LEGACY_HEX[upper] ?? upper;
}

function colorDef(hex: string): StyleColor {
  return STYLE_PALETTE.find((c) => c.hex === hex) ?? { hex, name: hex };
}

/** Relative luminance, 0 (black) → 1 (white). */
function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The design's contrast ink helper (not the PDF's onColor). */
function inkFor(hex: string): string {
  return luminance(hex) > 0.4 ? INK : LIGHT_INK;
}

type HydratedStyle = { template: TemplateKey; colors: (string | null)[] };

function hydrate(profile: {
  invoice_template?: string | null;
  brand_colors?: string[] | null;
  background_color?: string | null;
  color_roles_explicit?: boolean | null;
}): HydratedStyle {
  const raw = Array.from(new Set(
    (Array.isArray(profile.brand_colors) ? profile.brand_colors : [])
      .filter(isHex)
      .map(normalizeHex),
  )).slice(0, 3);

  const savedBg = isHex(profile.background_color) ? normalizeHex(profile.background_color) : null;
  const template = TEMPLATE_OPTIONS.some((t) => t.key === profile.invoice_template)
    ? (profile.invoice_template as TemplateKey)
    : 'sidebar';

  // Explicit roles: brand_colors is already [background, accent, secondary?].
  if (profile.color_roles_explicit) {
    const bg = savedBg ?? raw[0] ?? DEFAULT_BG;
    const rest = raw.filter((c) => c !== bg);
    return { template, colors: [bg, rest[0] ?? DEFAULT_ACCENT, rest[1] ?? null] };
  }

  // Legacy profiles: use the exact roles the current PDF uses, so the first
  // preview is not a different design. No background_color means the PDF is
  // on its white/gold fallback, not on the stored swatches.
  if (savedBg && raw.length >= 2) {
    const theme = buildTheme(raw, savedBg);
    return {
      template,
      colors: [savedBg, theme.accent, theme.primary !== theme.accent ? theme.primary : null],
    };
  }
  if (raw.length >= 2) {
    return { template, colors: ['#FFFFFF', '#D4A017', null] };
  }
  return { template, colors: [DEFAULT_BG, DEFAULT_ACCENT, null] };
}

// Obviously fake sample data. The Cash App handle exists only so the real
// template's payment block/rail renders in the preview.
const SAMPLE: InvoiceRenderData = {
  kind: 'invoice',
  invoiceNumber: 1,
  businessName: 'Sample Business',
  clientName: 'Sample Client',
  lineItems: [{ description: 'Service call + labor', qty: 1, unit_price: 250 }],
  subtotal: 250,
  taxRate: 0,
  taxAmount: 0,
  total: 250,
  issuedDate: 'Oct 20, 2026',
  cashappTag: 'samplebiz',
};

const PLACEHOLDER_THEME = buildTheme(['#9a9a9a', '#c4c4c4'], '#FFFFFF');

/**
 * The real template at A4 size, scaled to the card's fixed height. The frame is
 * derived from A4 and centered, so the invoice fills it edge-to-edge instead of
 * being letterboxed inside a full-width frame.
 */
function StylePreview({
  template,
  colors,
}: {
  template: TemplateKey;
  colors: (string | null)[];
}) {
  const bg = colors[0];
  const accent = colors[1];
  const secondary = colors[2];
  const complete = Boolean(bg && accent);

  const theme = useMemo(() => {
    if (!bg || !accent) return PLACEHOLDER_THEME;
    return buildTheme(
      [bg, accent, ...(secondary ? [secondary] : [])],
      bg,
      { accent, secondary: secondary ?? null },
    );
  }, [bg, accent, secondary]);

  return (
    <InvoicePreviewFrame
      template={template}
      data={SAMPLE}
      theme={theme}
      fit="height"
      maxHeight={PREVIEW_H}
      dimmed={!complete}
      ariaHidden={!complete}
      overlay={!complete ? (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <div className="flex max-w-full items-center gap-2 rounded-full border border-outline-variant bg-background px-3 py-2.5 text-center text-[13px] font-semibold leading-[1.3] shadow-[0_4px_24px_rgba(115,92,0,0.10)]">
            <Icon name="touch_app" size={18} className="shrink-0 text-primary" />
            <span>Pick a background and accent to preview</span>
          </div>
        </div>
      ) : undefined}
    />
  );
}

export default function InvoiceStyleCard({
  profile,
  onSave,
}: {
  profile: {
    invoice_template?: string | null;
    brand_colors?: string[] | null;
    background_color?: string | null;
    color_roles_explicit?: boolean | null;
  };
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const [initial] = useState(() => hydrate(profile));
  const [template, setTemplate] = useState<TemplateKey>(initial.template);
  const [colors, setColors] = useState<(string | null)[]>(initial.colors);
  const [lastSaved, setLastSaved] = useState<StyleSnapshot>(() => ({
    template: initial.template,
    colors: [...initial.colors],
  }));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [note, setNote] = useState(false);
  const [stickyHeight, setStickyHeight] = useState(0);

  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);

  useEffect(() => () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const dirty = template !== lastSaved.template
    || colors.some((c, i) => c !== lastSaved.colors[i]);
  const showSticky = dirty || saved;
  const stickyBox = useMainBottomBox(showSticky);
  useMainBottomPadding(showSticky, stickyHeight);

  const picked = colors.filter((c): c is string => Boolean(c));
  const count = picked.length;
  const hasBg = Boolean(colors[0]);
  const hasAccent = Boolean(colors[1]);
  const ok = hasBg && hasAccent;

  const status = !ok
    ? (!hasBg && !hasAccent ? 'Pick at least 2 colors' : !hasBg ? 'Pick a background' : 'Pick an accent')
    : count === 3
      ? '3 of 3 picked'
      : '2 picked · 1 optional';
  const statusInk = ok ? GREEN : GOLD_TEXT;

  // Guided fill order: Background → Accent → Secondary. Highlight the first
  // empty slot so the optional third pick is just as discoverable as the
  // required two.
  const nextRequired = colors.findIndex((c) => !c);
  const styleName = TEMPLATE_LABELS[template];

  function markDirty() {
    revision.current += 1;
    setSaved(false);
    setSaveError('');
    if (savedTimer.current) {
      clearTimeout(savedTimer.current);
      savedTimer.current = null;
    }
  }

  function showNote() {
    setNote(true);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(false), 3000);
  }

  function clearNote() {
    setNote(false);
    if (noteTimer.current) {
      clearTimeout(noteTimer.current);
      noteTimer.current = null;
    }
  }

  function pickColor(hex: string) {
    const at = colors.indexOf(hex);
    if (at >= 0) {
      const next = [...colors];
      next[at] = null;
      setColors(next);
      clearNote();
      markDirty();
      return;
    }

    if (count >= 3) {
      showNote();
      return;
    }

    const empty = colors.findIndex((c) => !c);
    if (empty < 0) {
      showNote();
      return;
    }

    const next = [...colors];
    next[empty] = hex;
    setColors(next);
    clearNote();
    markDirty();
  }

  function swap() {
    if (!colors[0] || !colors[1]) return;
    setColors([colors[1], colors[0], colors[2] ?? null]);
    clearNote();
    markDirty();
  }

  async function handleSave() {
    if (!ok || saving) return;
    setSaving(true);
    setSaveError('');
    const revisionAtSave = revision.current;
    const templateAtSave = template;
    const colorsAtSave = [...colors];

    const brand_colors = [colors[0], colors[1], colors[2]]
      .filter((c): c is string => Boolean(c));
    let success = false;
    try {
      success = await onSave({
        invoice_template: template,
        brand_colors,
        background_color: colors[0],
        color_roles_explicit: true,
      });
    } catch {
      success = false;
    }

    setSaving(false);
    if (!success) {
      setSaveError("Couldn't save. Check your connection and try again.");
      return;
    }
    // The server now holds this exact state, even if the user kept editing
    // while the request was in flight. The snapshot must follow the write so a
    // later revert to it is correctly clean.
    setLastSaved({ template: templateAtSave, colors: colorsAtSave });
    // The write landed, but the user changed something while it was in flight:
    // don't show "Saved" for a state that is no longer on screen.
    if (revision.current !== revisionAtSave) return;

    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1800);
  }

  const buttonMuted = !ok;
  const saveLabel = saved ? 'Saved ✓' : ok ? 'Save invoice style' : `${status} to save`;

  return (
    <section className="card space-y-4" aria-labelledby="invoice-style-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="invoice-style-heading" className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
          Invoice style
        </h2>
        <span className="text-sm text-on-surface-variant">{styleName}</span>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-[.08em] text-[#6B6257]">Template</h3>
        <div role="radiogroup" aria-label="Invoice template" className="grid grid-cols-2 gap-2">
          {TEMPLATE_OPTIONS.map((option) => {
            const selected = template === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setTemplate(option.key);
                  markDirty();
                }}
                className={`flex min-h-[58px] min-w-0 items-center gap-2.5 rounded-[14px] p-3 text-left transition-colors ${
                  selected ? 'bg-[#FBF0CF]' : 'bg-white'
                }`}
                style={{ border: selected ? `2px solid ${GOLD}` : '1px solid #E6DCCB' }}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-bold leading-5 text-[#1E1A16]">{option.name}</span>
                  <span className="text-xs leading-4 text-[#6B6257]">{option.desc}</span>
                </span>
                <span
                  aria-hidden
                  className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2"
                  style={{
                    borderColor: selected ? GOLD : EMPTY_BORDER,
                    background: selected ? GOLD : 'transparent',
                    boxShadow: selected ? `inset 0 0 0 3px ${GOLD_SOFT}` : 'none',
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3.5 rounded-[16px] border bg-[#FAF4E8] p-3" style={{ borderColor: CARD_BORDER }}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="shrink-0 font-display text-xs font-bold uppercase tracking-[.08em] text-[#6B6257]">Colors</h3>
          <span aria-live="polite" className="min-w-0 text-right text-[12.5px] font-semibold leading-4" style={{ color: statusInk }}>
            {status}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { role: 'Background', index: 0, required: true },
            { role: 'Accent', index: 1, required: true },
            { role: 'Secondary', index: 2, required: false },
          ].map((slot) => {
            const hex = colors[slot.index];
            const def = hex ? colorDef(hex) : null;
            const highlighted = slot.index === nextRequired;
            return (
              <div
                key={slot.role}
                className="flex min-w-0 flex-col gap-2 rounded-[14px] p-2.5"
                style={{
                  background: SLOT_BG,
                  border: highlighted ? `1.5px solid ${GOLD}` : '1px solid transparent',
                }}
              >
                <span
                  aria-hidden
                  className="h-[30px] w-full rounded-[9px]"
                  style={{
                    background: hex ?? 'transparent',
                    border: hex
                      ? (hex === '#FFFFFF' ? `1px solid ${WHITE_OUTLINE}` : '1px solid transparent')
                      : `1.5px dashed ${EMPTY_BORDER}`,
                  }}
                />
                <span className="flex min-w-0 flex-col">
                  <span
                    className="whitespace-nowrap leading-4 text-[#6B6257]"
                    style={{ fontSize: 'clamp(10px, 2.95vw, 11.5px)' }}
                  >
                    {slot.role}
                  </span>
                  <span
                    className="whitespace-nowrap font-bold leading-5"
                    style={{
                      fontSize: 'clamp(12px, 3.45vw, 13.5px)',
                      color: hex ? INK : (slot.required ? GOLD_TEXT : '#8F8474'),
                    }}
                    title={hex ? (def?.name ?? hex) : undefined}
                  >
                    {hex ? (def?.name ?? hex) : (slot.required ? 'Required' : 'Optional')}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[12.5px] leading-4 text-[#6B6257]">
            Tap a color to add it, tap again to remove
          </span>
          <button
            type="button"
            disabled={!ok}
            onClick={swap}
            aria-label="Swap background and accent colors"
            className={`inline-flex h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D5B035] ${
              ok
                ? 'border-[#E3D7C4] bg-white text-[#1E1A16] active:bg-[#F3EADB]'
                : 'cursor-not-allowed border-[#E8DFD0] bg-[#FAF4E8] text-[#8F8474]'
            }`}
          >
            <Icon name="sync" size={16} />
            Swap BG/Accent
          </button>
        </div>

        <div className="grid grid-cols-5 justify-items-center gap-y-3">
          {STYLE_PALETTE.map(({ hex, name }) => {
            const at = colors.indexOf(hex);
            const selected = at >= 0;
            const full = count >= 3;
            const badge = selected ? ['BG', 'AC', '2ND'][at] : '';
            const ring = selected
              ? `0 0 0 3px ${SLOT_BG}, 0 0 0 5px ${INK}${hex === '#FFFFFF' ? `, inset 0 0 0 1px ${WHITE_OUTLINE}` : ''}`
              : hex === '#FFFFFF'
                ? `inset 0 0 0 1px ${WHITE_OUTLINE}`
                : 'none';
            return (
              <button
                key={hex}
                type="button"
                onClick={() => pickColor(hex)}
                aria-label={name}
                aria-pressed={selected}
                className="grid h-11 w-11 place-items-center rounded-full border-none text-[10px] font-extrabold leading-none transition-[box-shadow,opacity] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E1A16]"
                style={{
                  background: hex,
                  boxShadow: ring,
                  opacity: !selected && full ? 0.4 : 1,
                  color: inkFor(hex),
                  fontFamily: 'var(--font-montserrat), sans-serif',
                }}
              >
                {badge}
              </button>
            );
          })}
        </div>

        {note && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-[12px] bg-[#2A251F] px-3 py-2.5 text-[13.5px] leading-[1.4] text-[#FBF5EA]"
          >
            <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#D5B035] font-display text-xs font-extrabold text-[#1E1A16]">!</span>
            <span>
              <b>3 colors max.</b> Invoices use a background, an accent and one optional secondary. Tap a selected color to remove it first.
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <span className="pl-1 font-display text-xs font-bold uppercase tracking-[.08em] text-[#6B6257]">
          Preview · {styleName}
        </span>
        <StylePreview template={template} colors={colors} />
      </div>

      {saveError && (
        <div
          role="alert"
          className={`rounded-xl bg-error-container px-3.5 py-2.5 text-sm font-semibold leading-5 text-error-on-container${showSticky ? ' hidden md:block' : ''}`}
        >
          {saveError}
        </div>
      )}

      {showSticky && <div aria-hidden className="h-[52px] md:hidden" />}

      <div className={showSticky ? 'hidden md:block' : ''}>
        <button
          type="button"
          disabled={!ok || saving}
          aria-busy={saving}
          onClick={handleSave}
          className="h-[52px] w-full rounded-full text-base font-bold transition-colors disabled:cursor-not-allowed"
          style={{
            background: buttonMuted ? '#E8DFD0' : GOLD,
            color: buttonMuted ? '#8F8474' : INK,
          }}
        >
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>

      {showSticky && stickyBox && (
        <StickySaveBar
          box={stickyBox}
          label={saving ? 'Saving…' : saveLabel}
          muted={buttonMuted}
          busy={saving}
          error={saveError}
          onSave={handleSave}
          onHeight={setStickyHeight}
        />
      )}
    </section>
  );
}
