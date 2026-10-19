// Brand marks: Simple Icons monochrome glyphs in public/brands/, recolored to
// the brand's own color. The SVG is a CSS mask (its shape only) and the brand
// color is the fill, so the glyph shape is never restyled. Shared by the
// Payouts screen and the invoice-detail Record payment sheet.
export default function BrandMark({
  src, color, className = 'h-11 w-11',
}: { src: string; color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`shrink-0 ${className}`}
      style={{
        display: 'inline-block',
        backgroundColor: color,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}
