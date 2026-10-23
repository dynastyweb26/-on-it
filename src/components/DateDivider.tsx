// Shared group header (release frames 4a/4b): a soft-gold pill with the period
// label ("OCTOBER 2026"). It scrolls with the list (in-flow, not sticky). With
// a subtotal, the amount sits on the right of the row, outside the pill
// (Expenses); without one, the pill stands alone (Invoices).
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function DateDivider({ label, subtotal, flush = false }: {
  label: string; subtotal?: number | null;
  /** First divider in the Invoices list: sit closer to the summary row. */
  flush?: boolean;
}) {
  const pill = (
    <span className="inline-flex h-7 items-center rounded-full bg-primary-soft px-3.5 text-[12.5px] font-bold uppercase tracking-[.06em] text-primary-on-container">
      {label}
    </span>
  );
  const top = flush ? 'mt-1.5' : 'mt-4';
  if (subtotal == null) return <div className={`mb-1 flex ${top}`}>{pill}</div>;
  return (
    <div className={`mb-2 flex items-center justify-between gap-2 ${top}`}>
      {pill}
      <span className="font-display text-[15px] font-bold tabular-nums text-on-surface-variant">{money(subtotal)}</span>
    </div>
  );
}
