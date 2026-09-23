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
      // Fixed square box: if the ligature name ever renders as text (font
      // late or failed — see the icons-ready script in app/layout.tsx), it is
      // clipped to the glyph's footprint instead of reflowing the layout.
      style={{ fontSize: size, width: size, height: size, overflow: 'hidden' }}
    >
      {name}
    </span>
  );
}
