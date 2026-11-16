import type { ComponentType } from 'react';
import type { RedesignSlide } from '@/lib/recap/payload';
import type { SlideProps } from '@/components/recap/clock';
import Stage from '@/components/recap/design/Stage';
import { createElement } from 'react';
import DesignOpener from '@/components/recap/design/DesignOpener';

// The redesign's slides, one file each. 'glance' and 'quiet' (and a month's
// opener) keep their old components, so RecapStory never reads those entries.
const Unbuilt = (p: SlideProps) => createElement(Stage, { clock: p.clock, reduced: p.reduced });

export const DESIGN_SLIDES: Record<RedesignSlide, ComponentType<SlideProps>> = {
  opener: DesignOpener,
  glance: Unbuilt,
  in: Unbuilt,
  out: Unbuilt,
  kept: Unbuilt,
  inv: Unbuilt,
  client: Unbuilt,
  free: Unbuilt,
  aff: Unbuilt,
  quiet: Unbuilt,
};
