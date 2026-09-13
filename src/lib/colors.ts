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
  primary: string;   // KEPT for back-compat
  accent: string;    // KEPT — fills, rules, emphasis
  heading: string;   // business name, headings — TEXT role
  surface: string;   // table header bar, payment cards — FILL role
  muted: string;     // slogan, URL, footer, secondary text
  rule: string;      // hairline separators
  accentInk: string; // accent made safe AS TEXT on `background`
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

/** WCAG contrast ratio between two hex colors (1:1 to 21:1) */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

/** Mix two colors together. Weight (0..1) is the proportion of color2. */
export function mixColors(hex1: string, hex2: string, weight: number): string {
  const c1 = hex1.replace('#', '');
  const c2 = hex2.replace('#', '');
  const r1 = parseInt(c1.slice(0, 2), 16), g1 = parseInt(c1.slice(2, 4), 16), b1 = parseInt(c1.slice(4, 6), 16);
  const r2 = parseInt(c2.slice(0, 2), 16), g2 = parseInt(c2.slice(2, 4), 16), b2 = parseInt(c2.slice(4, 6), 16);
  const r = Math.round(r1 + (r2 - r1) * weight);
  const g = Math.round(g1 + (g2 - g1) * weight);
  const b = Math.round(b1 + (b2 - b1) * weight);
  return '#' + [r, g, b].map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0')).join('');
}

/** Adjust accent color so it passes WCAG AA contrast (4.5:1) as text on background */
export function adjustAccentForContrast(accent: string, background: string): string {
  if (contrastRatio(accent, background) >= 4.5) return accent;
  const c = accent.replace('#', '');
  let r = parseInt(c.slice(0, 2), 16);
  let g = parseInt(c.slice(2, 4), 16);
  let b = parseInt(c.slice(4, 6), 16);
  const toHex = () =>
    '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  let guard = 0;
  if (isDark(background)) {
    while (contrastRatio(toHex(), background) < 4.5 && guard++ < 40) {
      r = Math.min(255, r + (255 - r) * 0.12);
      g = Math.min(255, g + (255 - g) * 0.12);
      b = Math.min(255, b + (255 - b) * 0.12);
    }
  } else {
    while (contrastRatio(toHex(), background) < 4.5 && guard++ < 40) {
      r *= 0.88; g *= 0.88; b *= 0.88;
    }
  }
  return toHex();
}

/** Saturation proxy for "brightest" pick → accent role */
function saturation(hex: string): number {
  const c = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const max = Math.max(...rgb), min = Math.min(...rgb);
  return max === 0 ? 0 : (max - min) / max;
}

export function buildTheme(selected: string[], background: string): BrandTheme {
  const text = onColor(background);
  const rest = selected.filter((c) => c.toLowerCase() !== background.toLowerCase());

  let primary: string;
  let accent: string;

  if (rest.length === 0) {
    primary = text;
    accent = '#D4A017';
  } else if (rest.length === 1) {
    primary = rest[0];
    accent = rest[0];
  } else {
    const [a, b] = rest;
    const aScore = saturation(a) + luminance(a) * 0.5;
    const bScore = saturation(b) + luminance(b) * 0.5;
    if (aScore >= bScore) {
      primary = b;
      accent = a;
    } else {
      primary = a;
      accent = b;
    }
  }

  // Derived tokens:
  const heading = contrastRatio(primary, background) >= 4.5 ? primary : text;
  const surface = mixColors(background, text, 0.12);
  const muted = mixColors(background, text, 0.62);
  const rule = mixColors(background, text, 0.22);
  const accentInk = adjustAccentForContrast(accent, background);

  const theme: BrandTheme = {
    background,
    text,
    primary,
    accent,
    heading,
    surface,
    muted,
    rule,
    accentInk,
  };

  if (process.env.NODE_ENV !== 'production') {
    assertThemeContrast(theme);
  }

  return theme;
}

/** Dev-only contrast assertions per PDF-SPEC section 2.5 */
export function assertThemeContrast(theme: BrandTheme): void {
  const c1 = contrastRatio(theme.heading, theme.background);
  const c2 = contrastRatio(theme.text, theme.background);
  const c3 = contrastRatio(theme.muted, theme.background);
  const c4 = contrastRatio(onColor(theme.surface), theme.surface);
  const c5 = contrastRatio(onColor(theme.accent), theme.accent);

  if (c1 < 4.5) console.warn(`Contrast assertion failed: heading vs background = ${c1.toFixed(2)} (< 4.5)`);
  if (c2 < 4.5) console.warn(`Contrast assertion failed: text vs background = ${c2.toFixed(2)} (< 4.5)`);
  if (c3 < 3.0) console.warn(`Contrast assertion failed: muted vs background = ${c3.toFixed(2)} (< 3.0)`);
  if (c4 < 4.5) console.warn(`Contrast assertion failed: onColor(surface) vs surface = ${c4.toFixed(2)} (< 4.5)`);
  if (c5 < 4.5) console.warn(`Contrast assertion failed: onColor(accent) vs accent = ${c5.toFixed(2)} (< 4.5)`);
}

/** Text color to sit ON TOP of a given fill (e.g. white text on navy header).
 *  Picks whichever of #FFFFFF or #000000 gives higher contrast. */
export function onColor(hex: string): string {
  const cWhite = contrastRatio('#FFFFFF', hex);
  const cBlack = contrastRatio('#000000', hex);
  return cWhite >= cBlack ? '#FFFFFF' : '#000000';
}

/** Darken a color toward black until it clears WCAG AA text contrast (~4.5:1)
 *  against WHITE, preserving hue. */
export function darkenForWhite(hex: string): string {
  const c = hex.replace('#', '');
  let r = parseInt(c.slice(0, 2), 16);
  let g = parseInt(c.slice(2, 4), 16);
  let b = parseInt(c.slice(4, 6), 16);
  const toHex = () =>
    '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  let guard = 0;
  while (luminance(toHex()) > 0.18 && guard++ < 40) {
    r *= 0.88; g *= 0.88; b *= 0.88;
  }
  return toHex();
}

/** The brand accent, made safe as INK ON WHITE PAPER */
export function accentForWhite(brandColors: string[] | null | undefined, background: string | null): string {
  const colors = brandColors ?? [];
  let base: string | null = null;
  if (background && colors.length >= 2) {
    base = buildTheme(colors, background).accent;
  } else if (colors.length) {
    base = [...colors].sort((x, y) => saturation(y) - saturation(x))[0];
  }
  if (!base) return '#1f1b13';
  return darkenForWhite(base);
}
