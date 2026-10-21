'use client';

// Business profile → Invoice style. A full-screen overlay (opened from the
// Business profile card) so the design's own header, scrolling body and sticky
// save bar are not competing with the app shell's header or tab bar.
//
// Storage is deliberately unchanged: profiles.invoice_template,
// profiles.brand_colors and profiles.background_color already hold everything
// this screen needs. New saves write brand_colors in role order
// [background, accent, secondary?] and background_color = background, which is
// still readable by the existing buildTheme() and invoice snapshots.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import type { TemplateKey } from '@/lib/pdf/templates';

const PAGE_BG = '#FDF7F0';
const CARD_BORDER = '#EFE5D6';
const MUTED = '#6B6257';
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

type StyleColor = { hex: string; name: string };

// The design's exact 20-swatch order. This is screen-local on purpose: the
// onboarding palette has different names and a few different hexes, and that
// screen is out of scope.
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

function lineFor(hex: string): string {
  return luminance(hex) > 0.4 ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.16)';
}

type HydratedStyle = { template: TemplateKey; colors: (string | null)[] };

function hydrate(profile: {
  invoice_template?: string | null;
  brand_colors?: string[] | null;
  background_color?: string | null;
}): HydratedStyle {
  const raw = Array.from(new Set(
    (Array.isArray(profile.brand_colors) ? profile.brand_colors : [])
      .filter(isHex)
      .map(normalizeHex),
  )).slice(0, 3);

  const savedBg = isHex(profile.background_color) ? normalizeHex(profile.background_color) : null;
  const bg = savedBg ?? (raw.length >= 2 ? raw[0] : DEFAULT_BG);
  const rest = raw.filter((c) => c !== bg);
  const accent = rest[0] ?? (bg === DEFAULT_ACCENT ? DEFAULT_BG : DEFAULT_ACCENT);
  const secondary = rest[1] ?? null;

  const template = TEMPLATE_OPTIONS.some((t) => t.key === profile.invoice_template)
    ? (profile.invoice_template as TemplateKey)
    : 'sidebar';

  return { template, colors: [bg, accent, secondary] };
}

type PreviewColors = {
  bg: string;
  ink: string;
  line: string;
  ac: string;
  acInk: string;
  sec: string;
};

function InvoiceStylePreview({ pv }: { pv: PreviewColors }) {
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const serif = "Georgia, 'Times New Roman', serif";

  return (
    <div
      style={{
        background: pv.bg,
        color: pv.ink,
        border: `1px solid ${pv.line}`,
        borderRadius: 8,
        padding: '18px 16px 16px',
        fontFamily: serif,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'background .2s, color .2s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, whiteSpace: 'nowrap' }}>Dynasty Web</span>
          <span style={{ fontSize: 8, color: pv.ac }}>dynastyweb.co</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', flex: 'none', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '.08em' }}>INVOICE</span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 8, color: pv.ac }}>INV-0001</span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 7 }}>
            <span style={{ color: pv.ac }}>ISSUED</span> 10/20/2026
          </span>
        </div>
      </div>

      <div style={{ height: 1, background: pv.line }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 78px', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 6.5, letterSpacing: '.1em', color: pv.sec }}>BILLED TO</span>
            <span style={{ fontWeight: 700, fontSize: 10 }}>Sample Client</span>
          </div>

          <div style={{ background: pv.ac, color: pv.acInk, padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 6, letterSpacing: '.1em' }}>TOTAL DUE</span>
            <span style={{ fontFamily: mono, fontWeight: 600, fontSize: 19 }}>$250.00</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 22px 34px 34px', gap: 4, fontFamily: mono, fontWeight: 700, fontSize: 6, color: pv.sec, paddingBottom: 4, borderBottom: `1px solid ${pv.line}` }}>
            <span>DESCRIPTION</span>
            <span>QTY</span>
            <span>RATE</span>
            <span style={{ textAlign: 'right' }}>AMOUNT</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 22px 34px 34px', gap: 4, fontSize: 7 }}>
            <span>Service call + labor</span>
            <span>1 ea</span>
            <span>$250.00</span>
            <span style={{ textAlign: 'right' }}>$250.00</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7, paddingTop: 4, borderTop: `1px solid ${pv.line}`, marginLeft: '20%', whiteSpace: 'nowrap' }}>
            <span>Subtotal</span>
            <span>$250.00</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7.5, fontWeight: 700, marginLeft: '20%', whiteSpace: 'nowrap' }}>
            <span>TOTAL DUE</span>
            <span style={{ color: pv.ac }}>$250.00</span>
          </div>
          <span style={{ fontSize: 7, color: pv.ac, marginTop: 4 }}>Thank you for your business.</span>
        </div>

        <div style={{ borderLeft: `1px solid ${pv.line}`, paddingLeft: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 6, letterSpacing: '.08em', color: pv.sec }}>PAYMENT METHODS</span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#00C244', flex: 'none' }} />
            <span style={{ fontFamily: mono, fontWeight: 600, fontSize: 6 }}>CASH APP</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvoiceStyleScreen({
  profile,
  onClose,
  onSave,
}: {
  profile: {
    invoice_template?: string | null;
    brand_colors?: string[] | null;
    background_color?: string | null;
  };
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const [initial] = useState(() => hydrate(profile));
  const [template, setTemplate] = useState<TemplateKey>(initial.template);
  const [colors, setColors] = useState<(string | null)[]>(initial.colors);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [note, setNote] = useState(false);

  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const backRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes; focus lands on Back and stays inside the modal; the app's
  // scroll container is locked so the page behind cannot move. On close, focus
  // returns to the Invoice style card that opened this screen.
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    backRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((el) => el.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!root.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const main = document.querySelector('main');
    const previousOverflow = main instanceof HTMLElement ? main.style.overflow : '';
    if (main instanceof HTMLElement) main.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      if (main instanceof HTMLElement) main.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  useEffect(() => () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

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
  // required two (the design outlines Secondary once both required slots are
  // filled).
  const nextRequired = colors.findIndex((c) => !c);
  const styleName = TEMPLATE_OPTIONS.find((t) => t.key === template)?.name ?? 'Ledger';

  const bg = colors[0] ?? '#FFFFFF';
  const ac = colors[1] ?? '#C9BFAF';
  const sec = colors[2] ?? ac;
  const pv = useMemo<PreviewColors>(
    () => ({ bg, ink: inkFor(bg), line: lineFor(bg), ac, acInk: inkFor(ac), sec }),
    [bg, ac, sec],
  );

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

    const brand_colors = [colors[0], colors[1], colors[2]].filter((c): c is string => Boolean(c));
    let success = false;
    try {
      success = await onSave({
        invoice_template: template,
        brand_colors,
        background_color: colors[0],
      });
    } catch {
      success = false;
    }

    setSaving(false);
    if (!success) {
      setSaveError("Couldn't save. Check your connection and try again.");
      return;
    }
    // The write landed, but the user changed something while it was in flight:
    // don't show "Saved" for a state that is no longer on screen.
    if (revision.current !== revisionAtSave) return;

    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1800);
  }

  const buttonMuted = !ok;
  const saveLabel = saved ? 'Saved ✓' : ok ? 'Save invoice style' : `${status} to save`;

  const overlay = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Invoice style"
      data-no-tab-swipe="true"
      className="fixed inset-0 z-[80] flex h-[100dvh] flex-col bg-[#FDF7F0] text-[#1E1A16]"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-[#EFE5D6] px-4 py-3.5">
        <button
          ref={backRef}
          type="button"
          aria-label="Back to Business profile"
          onClick={onClose}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#1E1A16] transition-colors active:bg-[#F3EADB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D5B035]"
        >
          <Icon name="arrow_back" size={24} />
        </button>
        <div className="flex min-w-0 flex-col">
          <span className="text-xs leading-4 text-[#6B6257]">Business profile</span>
          <h1 className="font-display text-[18px] font-bold leading-6 tracking-[-0.01em] text-[#1E1A16]">Invoice style</h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="mx-auto flex w-full max-w-[430px] flex-col gap-3.5">
          <section className="flex flex-col gap-3 rounded-[18px] border border-[#EFE5D6] bg-white p-4">
            <h2 className="font-display text-xs font-bold uppercase tracking-[.08em] text-[#6B6257]">Template</h2>
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
          </section>

          <section className="flex flex-col gap-3.5 rounded-[18px] border border-[#EFE5D6] bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="shrink-0 font-display text-xs font-bold uppercase tracking-[.08em] text-[#6B6257]">Colors</h2>
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
                className={`inline-flex h-11 shrink-0 items-center rounded-full border px-3 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D5B035] ${
                  ok
                    ? 'border-[#E3D7C4] bg-white text-[#1E1A16] active:bg-[#F3EADB]'
                    : 'cursor-not-allowed border-[#E8DFD0] bg-[#FAF4E8] text-[#8F8474]'
                }`}
              >
                <span aria-hidden className="mr-1 text-[15px] leading-none">⇄</span>
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
                  ? `0 0 0 3px ${PAGE_BG}, 0 0 0 5px ${INK}${hex === '#FFFFFF' ? `, inset 0 0 0 1px ${WHITE_OUTLINE}` : ''}`
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
          </section>

          <div className="flex flex-col gap-2">
            <span className="pl-1 font-display text-xs font-bold uppercase tracking-[.08em] text-[#6B6257]">
              PREVIEW · {styleName}
            </span>
            <InvoiceStylePreview pv={pv} />
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-[#EFE5D6] bg-[#FDF7F0] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto w-full max-w-[430px]">
          {saveError && (
            <div role="alert" className="mb-2 rounded-xl bg-[#FFDAD6] px-3.5 py-2.5 text-sm font-semibold leading-5 text-[#93000A]">
              {saveError}
            </div>
          )}
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
      </footer>
    </div>
  );

  // Portaled to <body>: the app shell and settings content can animate with a
  // transform, which would otherwise make this fixed screen position against
  // that ancestor instead of the viewport. `document` is only absent during an
  // SSR pass; the overlay is opened by a client interaction.
  return typeof document === 'undefined' ? null : createPortal(overlay, document.body);
}
