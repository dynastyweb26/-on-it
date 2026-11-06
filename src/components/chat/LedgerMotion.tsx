'use client';
// ═══ Ledger motion provider (docs/design/onit-chat · Prototype 1a/1b) ═══
// Framer Motion, loaded lazily: `m` components only (never `motion.*`), with the
// domAnimation feature set — the card morph needs layout projection, not
// gestures, drag or SVG path work. Strict mode makes a stray `motion.div` throw
// in development instead of silently pulling the full bundle in.
//
// Reduced motion is handled twice, on purpose:
//   • MotionConfig reducedMotion="user" disables transform/layout animation in
//     Framer itself when the OS asks for it, leaving opacity.
//   • Card components also read usePrefersReducedMotion() where they must skip a
//     whole sequence (the estimate link stagger), because a crossfade there
//     would still read as motion.
import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';
import type { ReactNode } from 'react';

/** Design tokens (docs/design/onit-chat · Tokens): settle 260ms, hero 600ms. */
export const SETTLE = { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] as const };
export const HERO = { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] as const };

export default function LedgerMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={SETTLE}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
