// Material Symbols Outlined — the app's only icon system (Design Standard §4).
// Default wght 400 FILL 0; pass filled for active/selected states (FILL 1).
// The font is a subset (see icon-names.ts): only IconName glyphs exist in it.
import type { IconName } from '@/components/icon-names';

export default function Icon({
  name,
  filled = false,
  size = 24,
  className = '',
}: {
  name: IconName;
  filled?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`material-symbols-outlined select-none ${filled ? 'icon-fill' : ''} ${className}`}
      style={{ fontSize: size }}
    >
      {name}
    </span>
  );
}
