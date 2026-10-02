import type { RecapSlide } from '@/lib/recap/payload';

// Slide names (RECAP-SPEC §1), for the placeholder slides and the
// screen-reader announcement on each slide change.
export const RECAP_SLIDE_NAMES: Record<RecapSlide, string> = {
  opener: 'Opener', moneyIn: 'Money in', moneyInZero: 'Money in', moneyOut: 'Money out',
  kept: 'What you kept', keptInvest: 'What you kept', glance: 'Month at a glance',
  owed: 'Still on the table', caughtUp: 'All caught up', quiet: 'Nothing at all',
};
