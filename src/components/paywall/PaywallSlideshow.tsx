'use client';
// The paywall's feature slideshow (upper half of the page).
import { PaywallSlide, SLIDE_H, SLIDE_W, type SlideId } from '@/components/paywall/PaywallSlides';

export default function PaywallSlideshow({ slides, start, scale }: {
  slides: SlideId[];
  start: SlideId;
  scale: number;
}) {
  const id = slides.includes(start) ? start : slides[0];
  return (
    <div className="flex justify-center overflow-hidden pb-[29px]" style={{ height: Math.round(SLIDE_H * scale) + 29 }}>
      <div className="shrink-0 origin-top" style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})` }}>
        <PaywallSlide id={id} />
      </div>
    </div>
  );
}
