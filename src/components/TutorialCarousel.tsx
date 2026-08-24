'use client';
/* ═══ TutorialCarousel — the full-set walkthrough (interim) ═══
   Now a thin wrapper: it renders every shared slide through the presentational
   SlideCarousel. Content, mocks, and persistence live under
   src/components/tutorial/. This file is a transitional surface — the split
   into a 4-slide first-run carousel and a tabbed reference doc replaces it. */
import SlideCarousel from '@/components/tutorial/SlideCarousel';
import { SLIDES } from '@/components/tutorial/slides';

export default function TutorialCarousel({ onClose }: { onClose: () => void }) {
  return <SlideCarousel slides={SLIDES} onClose={onClose} />;
}
