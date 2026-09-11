// ═══ ON IT — Brand color system ═══
// The locked logic:
//   1. User picks 2-3 colors from the 20-swatch palette
//   2. User explicitly picks which one is the BACKGROUND (no auto-guessing)
//   3. Dark background  → main text is WHITE
//      Light background → main text is BLACK
//   4. Remaining picks: darker one → primary (headers, business name, table headers)
//                       brighter one → accent (totals, website link, slogan, dividers)
//   5. If only 2 colors picked, primary and accent are the same non-background color.

export const PALETTE: { name: string; hex: string }[] = [
  { name: 'Midnight Black', hex: '#1A1A1A' },
  { name: 'Charcoal', hex: '#3D3D3D' },
  { name: 'Pure White', hex: '#FFFFFF' },
  { name: 'Slate Grey', hex: '#708090' },
  { name: 'Navy Blue', hex: '#1B2A4A' },
  { name: 'Royal Blue', hex: '#2B5CE6' },
  { name: 'Sky Blue', hex: '#38BDF8' },
  { name: 'Forest Green', hex: '#2D6A4F' },
  { name: 'Lime Green', hex: '#84CC16' },
  { name: 'Ember Orange', hex: '#EA580C' },
  { name: 'Amber Gold', hex: '#D4A017' },
  { name: 'Sunshine Yellow', hex: '#FACC15' },
  { name: 'Brick Red', hex: '#B91C1C' },
  { name: 'Crimson', hex: '#DC2626' },
  { name: 'Rust Brown', hex: '#92400E' },
  { name: 'Tan', hex: '#D4B896' },
  { name: 'Purple', hex: '#7C3AED' },
  { name: 'Teal', hex: '#0D9488' },
  { name: 'Hot Pink', hex: '#EC4899' },
  { name: 'Silver', hex: '#C0C0C0' },
];

export interface BrandTheme {
  background: string;
  text: string;      // white on dark bg, black on light bg — no exceptions
  primary: string;   // headers, business name, table header background
  accent: string;    // totals, website link, slogan, dividers
}

/** Relative luminance 0 (black) → 1 (white) */
export function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const isDark = (hex: string) => luminance(hex) < 0.35;

/** Saturation proxy for "brightest" pick → accent role */
function saturation(hex: string): number {
  const c = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const max = Math.max(...rgb), min = Math.min(...rgb);
  return max === 0 ? 0 : (max - min) / max;
}

export function buildTheme(selected: string[], background: string): BrandTheme {
  const text = isDark(background) ? '#FFFFFF' : '#000000';
  const rest = selected.filter((c) => c.toLowerCase() !== background.toLowerCase());

  if (rest.length === 0) {
    // Degenerate case: single color picked. Fall back to Amber Gold accent.
    return { background, text, primary: text, accent: '#D4A017' };
  }
  if (rest.length === 1) {
    return { background, text, primary: rest[0], accent: rest[0] };
  }
  // Two remaining: brighter/more saturated → accent, other → primary
  const [a, b] = rest;
  const aScore = saturation(a) + luminance(a) * 0.5;
  const bScore = saturation(b) + luminance(b) * 0.5;
  return aScore >= bScore
    ? { background, text, primary: b, accent: a }
    : { background, text, primary: a, accent: b };
}

/** Text color to sit ON TOP of a given fill (e.g. white text on navy header) */
export const onColor = (hex: string) => (isDark(hex) ? '#FFFFFF' : '#000000');

/** Darken a color toward black until it clears WCAG AA text contrast (~4.5:1)
 *  against WHITE, preserving hue. This is the gold-on-cream fix generalized:
 *  contrast vs white is 1.05/(L+0.05), so ≥4.5 needs relative luminance ≤ ~0.18.
 *  A color already dark enough is returned unchanged. */
export function darkenForWhite(hex: string): string {
  const c = hex.replace('#', '');
  let r = parseInt(c.slice(0, 2), 16);
  let g = parseInt(c.slice(2, 4), 16);
  let b = parseInt(c.slice(4, 6), 16);
  const toHex = () =>
    '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  // Scale toward black in small steps; guard bounds the loop for pure white.
  let guard = 0;
  while (luminance(toHex()) > 0.18 && guard++ < 40) {
    r *= 0.88; g *= 0.88; b *= 0.88;
  }
  return toHex();
}

/** The brand accent, made safe as INK ON WHITE PAPER — the only brand color the
 *  tax-summary document uses. Picks the accent the way invoices do when a
 *  background is set; else the most-saturated brand pick; else a neutral warm
 *  charcoal when the user has no brand colors at all. Whatever it lands on is
 *  darkened so it's legible on white (gold, lime, sky would otherwise vanish). */
export function accentForWhite(brandColors: string[] | null | undefined, background: string | null): string {
  const colors = brandColors ?? [];
  let base: string | null = null;
  if (background && colors.length >= 2) {
    base = buildTheme(colors, background).accent;
  } else if (colors.length) {
    base = [...colors].sort((x, y) => saturation(y) - saturation(x))[0];
  }
  // No brand colors → neutral dark (Design Standard on-background warm charcoal).
  if (!base) return '#1f1b13';
  return darkenForWhite(base);
}
