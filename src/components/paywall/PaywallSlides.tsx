// The paywall slideshow's slides: a Montserrat headline over a feature graphic,
// drawn on the design's fixed 393×300 canvas (frames 1a–1e) and scaled as a
// whole by the slideshow.
export const SLIDE_W = 393;
export const SLIDE_H = 300;

export type SlideId = 'invoice' | 'paid' | 'expense' | 'reports' | 'recap';

export const SLIDE_TITLE: Record<SlideId, [string, string]> = {
  invoice: ['Say it.', 'It’s invoiced.'],
  paid: ['Get paid', 'your way.'],
  expense: ['Snap a receipt.', 'It’s logged.'],
  reports: ['Your books,', 'one tap.'],
  recap: ['Your week', 'at a glance.'],
};

export function PaywallSlide({ id }: { id: SlideId }) {
  const [a, b] = SLIDE_TITLE[id];
  return (
    <div className="relative overflow-hidden bg-background" style={{ width: SLIDE_W, height: SLIDE_H }}>
      <h2 className="absolute inset-x-0 top-2 text-center font-display text-[30px] font-extrabold leading-[1.12] tracking-[-0.025em] text-on-background">
        {a}<br />{b}
      </h2>
    </div>
  );
}
