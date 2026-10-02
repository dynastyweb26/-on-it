// Payment-method marks for the paywall's "Get paid your way." slide, rendered
// from the simple-icons package as inline SVG paths in each brand's own color.
// Only these five icons are imported (named imports from an ESM module marked
// sideEffects:false, so the rest of the package is tree-shaken out of the
// bundle). Never recolor, tint, stretch or redraw a mark: the path, the hex and
// the aspect ratio come straight from the package.
import { siCashapp, siPaypal, siStripe, siVenmo, siZelle, type SimpleIcon } from 'simple-icons';

export type PaymentBrand = 'stripe' | 'paypal' | 'cashapp' | 'venmo' | 'zelle';

export const PAYMENT_BRANDS: { id: PaymentBrand; icon: SimpleIcon; wordmark?: boolean }[] = [
  { id: 'stripe', icon: siStripe },
  { id: 'paypal', icon: siPaypal },
  { id: 'cashapp', icon: siCashapp },
  // Venmo's simple-icon is its wordmark (24 × 4.55 inside the 24 × 24 box), so
  // it is shown on its own, without a label, cropped to the mark's own bounds.
  { id: 'venmo', icon: siVenmo, wordmark: true },
  { id: 'zelle', icon: siZelle },
];

const VENMO_BOX = { y: 9.73, h: 4.55 };

/** The brand's mark at `size` px (square marks) or `size` px wide (wordmark). */
export function PaymentLogo({ icon, wordmark = false, size }: { icon: SimpleIcon; wordmark?: boolean; size: number }) {
  const viewBox = wordmark ? `0 ${VENMO_BOX.y} 24 ${VENMO_BOX.h}` : '0 0 24 24';
  const height = wordmark ? (size * VENMO_BOX.h) / 24 : size;
  return (
    <svg role="img" aria-label={icon.title} width={size} height={height} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', flex: 'none' }}>
      <path d={icon.path} fill={`#${icon.hex}`} />
    </svg>
  );
}
