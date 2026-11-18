import type { RedesignSlide } from '@/lib/recap/payload';

// Slide names (RECAP-SPEC §1 and the redesign's screen labels), for the
// screen-reader announcement on each slide change.
export const RECAP_SLIDE_NAMES: Record<RedesignSlide, string> = {
  opener: 'Overview', glance: 'Month at a glance', in: 'Money in', out: 'Money out', kept: 'What you kept',
  inv: 'Invoices and estimates', client: 'Top client', bank: 'Bank activity', waiting: 'Waiting for you',
  free: 'Free plan', aff: 'Affirmation', quiet: 'Nothing at all',
};
