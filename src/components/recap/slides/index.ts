import type { ComponentType } from 'react';
import type { RecapSlide } from '@/lib/recap/payload';
import type { SlideProps } from '@/components/recap/clock';
import PlaceholderSlide from '@/components/recap/slides/PlaceholderSlide';
import OpenerSlide from '@/components/recap/slides/OpenerSlide';

// Slide key → component. Slides not built yet are placeholders; each slide's
// commit swaps its real component in (opener: commit 4).
export const SLIDES: Record<RecapSlide, ComponentType<SlideProps>> = {
  opener: OpenerSlide,
  moneyIn: PlaceholderSlide,
  moneyInZero: PlaceholderSlide,
  moneyOut: PlaceholderSlide,
  kept: PlaceholderSlide,
  keptInvest: PlaceholderSlide,
  glance: PlaceholderSlide,
  owed: PlaceholderSlide,
  caughtUp: PlaceholderSlide,
  quiet: PlaceholderSlide,
};
