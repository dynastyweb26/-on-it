// Shared date-divider pill — a small gold capsule chip (never a section header),
// matching the "Similar invoice sent recently" badge style. It scrolls with the
// list (in-flow, not sticky). Label on the left; when a subtotal is passed it
// sits on the right inside the same capsule. Books passes a subtotal; Invoices
// omits it (a bare label chip).
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function DateDivider({ label, subtotal }: { label: string; subtotal?: number | null }) {
  const base =
    'mt-4 mb-1 rounded-full bg-primary-container/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary';
  if (subtotal == null) {
    // Bare label — a small chip that shrinks to its content, on its own line.
    return <div className={`${base} flex w-fit`}>{label}</div>;
  }
  return (
    <div className={`${base} flex items-center justify-between gap-2`}>
      <span>{label}</span>
      <span className="tabular-nums">{money(subtotal)}</span>
    </div>
  );
}
