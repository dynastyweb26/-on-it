import type { ComponentType } from 'react';
import type { RecapSlide } from '@/lib/recap/payload';
import type { SlideProps } from '@/components/recap/clock';
import PlaceholderSlide from '@/components/recap/slides/PlaceholderSlide';

// Slide key → component. Every slide is a placeholder in the player-shell
// commit; each later commit swaps one in.
export const SLIDES: Record<RecapSlide, ComponentType<SlideProps>> = {
  opener: PlaceholderSlide,
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
