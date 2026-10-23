'use client';
// The large pill segmented control (MOTION-SPEC §13): the gold thumb slides
// between options by transform. Extracted from ClientsView so the Invoices tab
// can share it. Not the small h-9 SegmentedControl used by expenses/recurring.
export default function PillTabs<T extends string>({ options, value, onChange, label }: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Accessible name, e.g. "Clients or products". */
  label: string;
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="tablist" aria-label={label}
      className="relative grid h-14 rounded-full bg-surface-container p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span aria-hidden
        className="absolute bottom-1 left-1 top-1 rounded-full bg-primary-container shadow-card"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(${i * 100}%)`,
          transition: 'transform var(--motion-fast) var(--ease-standard)',
        }} />
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value}
          onClick={() => { if (o.value !== value) onChange(o.value); }}
          className={`relative z-[1] rounded-full px-2 text-sm leading-tight transition-colors active:scale-95
            ${o.value === value ? 'font-bold text-on-background' : 'font-semibold text-on-surface-variant'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
