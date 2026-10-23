// Material Symbols Rounded — the public estimate page's icon set.
// Separate from components/Icon.tsx on purpose: the app's Outlined subset has
// none of the Rounded glyphs, and the design keeps the public page's icon font
// on /e/[token] only (src/app/e/[token]/fonts.ts).
import type { EstIconName } from './estimate-icon-names';
import s from './estimate.module.css';

export default function EstIcon({
  name,
  size = 24,
  className = '',
}: {
  name: EstIconName;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`${s.icon} ${className}`}
      style={{ fontSize: size, width: size, height: size, overflow: 'hidden' }}
    >
      {name}
    </span>
  );
}
