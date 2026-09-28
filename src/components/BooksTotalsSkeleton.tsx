// Loading placeholder for the Books totals (dashboard). Mirrors the real
// layout exactly so nothing shifts when data arrives: the dark Net hero (figure,
// then its "Net · all time" label and invoice count), then ONE row of three
// equal tiles (figure, then dot + label). The hero keeps its real static label
// (a cream card popping to dark would read as a flash, not a load); only the
// figure and count skeleton in. Main's Skeleton renders a warm cream shimmer, so
// on the dark inverse-surface card its placeholders get an opacity override to
// read as faint marks rather than harsh cream blocks (no `onDark` prop on main's
// Skeleton). Sizes track the real elements: figure ~= numeric-xl, tiles mirror
// the dashboard's Tile component.
import Skeleton from '@/components/Skeleton';

export default function BooksTotalsSkeleton() {
  return (
    <>
      <span className="sr-only">Loading your books</span>
      <div className="rounded-card bg-inverse-surface p-6 shadow-card-raised">
        <Skeleton className="h-12 w-44 opacity-20" />
        <div className="mt-1 text-label-lg font-semibold text-inverse-on-surface/70">Net · all time</div>
        <Skeleton className="mt-1 h-3 w-20 opacity-20" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card flex min-h-touch flex-col justify-center gap-1 p-3">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    </>
  );
}
