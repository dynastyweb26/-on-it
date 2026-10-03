import type { ComponentType } from 'react';
import type { RecapSlide } from '@/lib/recap/payload';
import type { SlideProps } from '@/components/recap/clock';
import OpenerSlide from '@/components/recap/slides/OpenerSlide';
import MoneyInSlide from '@/components/recap/slides/MoneyInSlide';
import MoneyOutSlide from '@/components/recap/slides/MoneyOutSlide';
import KeptSlide from '@/components/recap/slides/KeptSlide';
import KeptInvestSlide from '@/components/recap/slides/KeptInvestSlide';
import OwedSlide from '@/components/recap/slides/OwedSlide';
import CaughtUpSlide from '@/components/recap/slides/CaughtUpSlide';
import MoneyInZeroSlide from '@/components/recap/slides/MoneyInZeroSlide';
import QuietSlide from '@/components/recap/slides/QuietSlide';
import GlanceSlide from '@/components/recap/slides/GlanceSlide';

// Slide key → component (RECAP-SPEC §1). Commits: opener 4, money in 5,
// money out 6, what you kept 7, still on the table / caught up 8, hard-week
// variants 9, month at a glance 12.
export const SLIDES: Record<RecapSlide, ComponentType<SlideProps>> = {
  opener: OpenerSlide,
  moneyIn: MoneyInSlide,
  moneyInZero: MoneyInZeroSlide,
  moneyOut: MoneyOutSlide,
  kept: KeptSlide,
  keptInvest: KeptInvestSlide,
  glance: GlanceSlide,
  owed: OwedSlide,
  caughtUp: CaughtUpSlide,
  quiet: QuietSlide,
};
