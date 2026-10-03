'use client';
// A small segmented control (release frames: the unit / frequency segments):
// a white thumb slides between options by transform (motion inventory "Unit /
// frequency segment", --motion-fast); Reduce Motion lands it instantly.
export default function SegmentedControl<T extends string>({ options, value, onChange, label }: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Accessible name, e.g. "Group expenses by". */
  label: string;
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="radiogroup" aria-label={label}
      className="relative inline-grid h-9 shrink-0 rounded-[10px] bg-surface-container-high p-0.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span aria-hidden
        className="absolute bottom-0.5 left-0.5 top-0.5 rounded-lg bg-surface-container-lowest shadow-[0_1px_3px_rgba(0,0,0,.12)]"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${i * 100}%)`, transition: 'transform var(--motion-fast) var(--ease-spring)' }} />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value}
          onClick={() => { if (o.value !== value) { try { navigator.vibrate?.(5); } catch { /* unsupported */ } onChange(o.value); } }}
          className={`relative z-[1] min-w-[64px] rounded-lg px-3 text-sm transition-colors
            ${o.value === value ? 'font-bold text-on-background' : 'font-medium text-on-surface-variant'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
