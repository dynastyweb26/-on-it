import type { ComponentType } from 'react';
import type { RedesignSlide } from '@/lib/recap/payload';
import type { SlideProps } from '@/components/recap/clock';
import Stage from '@/components/recap/design/Stage';
import { createElement } from 'react';
import DesignOpener from '@/components/recap/design/DesignOpener';
import DesignIn from '@/components/recap/design/DesignIn';
import DesignOut from '@/components/recap/design/DesignOut';
import DesignKept from '@/components/recap/design/DesignKept';
import DesignInv from '@/components/recap/design/DesignInv';
import DesignClient from '@/components/recap/design/DesignClient';
import DesignBank from '@/components/recap/design/DesignBank';
import DesignWaiting from '@/components/recap/design/DesignWaiting';
import DesignFree from '@/components/recap/design/DesignFree';
import DesignAff from '@/components/recap/design/DesignAff';

// The redesign's slides, one file each. 'glance' and 'quiet' (and a month's
// opener) keep their old components, so RecapStory never reads those entries.
const Unbuilt = (p: SlideProps) => createElement(Stage, { clock: p.clock, reduced: p.reduced });

export const DESIGN_SLIDES: Record<RedesignSlide, ComponentType<SlideProps>> = {
  opener: DesignOpener,
  glance: Unbuilt,
  in: DesignIn,
  out: DesignOut,
  kept: DesignKept,
  inv: DesignInv,
  client: DesignClient,
  bank: DesignBank,
  waiting: DesignWaiting,
  free: DesignFree,
  aff: DesignAff,
  quiet: Unbuilt,
};
