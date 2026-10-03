// Payment-method marks for the Money In slide (RECAP-SPEC §0, §5 moneyIn).
// Zelle and Cash App are their simple-icons marks in each brand's own hex
// (never recoloured; same approach as the paywall's PaymentLogos). Methods
// without a brand mark show a Material Symbol in a neutral chip, with a data
// colour so their bar segment stays distinct.
import { siCashapp, siZelle, type SimpleIcon } from 'simple-icons';
import type { IconName } from '@/components/icon-names';

export type PayMark =
  | { kind: 'brand'; icon: SimpleIcon; color: string }
  | { kind: 'neutral'; icon: IconName; color: string };

const BRANDS: Record<string, SimpleIcon> = { zelle: siZelle, cashapp: siCashapp };
const NEUTRAL: Record<string, { icon: IconName; color: string }> = {
  card: { icon: 'credit_card', color: '#5b77a8' },   // --onit-data-4
  cash: { icon: 'payments', color: '#2f8a83' },      // --onit-data-2
  check: { icon: 'checkbook', color: '#c0693f' },    // --onit-data-3
  other: { icon: 'more_horiz', color: '#a39a86' },   // --onit-muted-dot
};

export function payMark(method: string): PayMark {
  const b = BRANDS[method];
  if (b) return { kind: 'brand', icon: b, color: `#${b.hex}` };
  const n = NEUTRAL[method] ?? NEUTRAL.other;
  return { kind: 'neutral', icon: n.icon, color: n.color };
}

/** Ink on light segment colours, cream on dark ones (WCAG relative luminance). */
export function segmentInk(hex: string): 'ink' | 'cream' {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? 'ink' : 'cream';
}
