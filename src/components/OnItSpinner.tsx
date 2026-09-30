// On It's loading mark (MOTION-SPEC.md §2): a circular redraw of the logo as
// two swoosh arms. Each arm orbits the center on its own curve, so they drift
// apart and lock back into the mark every half turn. Drawn as CSS masks filled
// with currentColor, so it takes the color of the text it sits beside.
// Reduced motion: the global rule stops the animation; the static mark remains.
export default function OnItSpinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`onit-spinner ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="onit-spinner-arm onit-spinner-a" />
      <span className="onit-spinner-arm onit-spinner-b" />
    </span>
  );
}
