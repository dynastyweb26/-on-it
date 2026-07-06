// Material Symbols Outlined — the app's only icon system (Design Standard §4).
// Default wght 400 FILL 0; pass filled for active/selected states (FILL 1).
export default function Icon({
  name,
  filled = false,
  size = 24,
  className = '',
}: {
  name: string;
  filled?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`material-symbols-outlined select-none ${filled ? 'icon-fill' : ''} ${className}`}
      style={{ fontSize: size }}
    >
      {name}
    </span>
  );
}
