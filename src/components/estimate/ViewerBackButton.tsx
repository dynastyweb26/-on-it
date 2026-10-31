'use client';
// The full-screen viewer's only exit control (design spec §2.5): a back arrow
// at the top-left, 44px target, clear of the notch.
//
// Drawn as an inline SVG rather than a Material Symbols glyph on purpose: the
// Rounded subset (`--font-est-symbols`) is loaded by /e/[token] only, so on the
// owner's estimate card a font icon would render as its literal ligature text.
// An arrow that draws itself works on both surfaces.
//
// Lives in its own module, free of the estimate CSS module, so the markup can be
// rendered in a unit test (photo-viewer.test.ts).
import type { CSSProperties } from 'react';

const BUTTON: CSSProperties = {
  flex: 'none',
  width: 44,
  height: 44,
  display: 'grid',
  placeItems: 'center',
  border: 0,
  borderRadius: 999,
  background: 'transparent',
  color: '#FDF8F0',
  cursor: 'pointer',
  // Clear of the notch: the bar's own 12px padding plus the inset.
  marginLeft: 'env(safe-area-inset-left)',
  WebkitTapHighlightColor: 'transparent',
};

export default function ViewerBackButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Back" style={BUTTON}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 12H5" />
        <path d="M11 6l-6 6 6 6" />
      </svg>
    </button>
  );
}
