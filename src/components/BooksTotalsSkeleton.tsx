// Loading placeholder for the Books totals (dashboard). Mirrors the real
// layout exactly so nothing shifts when data arrives: the dark Net card, then a
// 3-tile stat grid (card p-5). The Net card keeps its real static label (a
// cream card popping to dark would read as a flash, not a load); only the figure
// and subline skeleton in. Main's Skeleton renders a warm cream shimmer, so on
// the dark inverse-surface card its placeholders get an opacity override to read
// as faint marks rather than harsh cream blocks (no `onDark` prop on main's
// Skeleton). Sizes track the real elements: figure ~= numeric-xl, tiles mirror
// the Stat component.
import Skeleton from '@/components/Skeleton';

export default function BooksTotalsSkeleton() {
  return (
    <>
      <span className="sr-only">Loading your books</span>
      <div className="rounded-card bg-inverse-surface p-6 shadow-card-raised">
        <div className="text-label-lg font-semibold uppercase tracking-widest text-inverse-primary/80">
          Net (all time)
        </div>
        <Skeleton className="mt-1 h-12 w-44 opacity-20" />
        <Skeleton className="mt-2 h-4 w-24 opacity-20" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
    </>
  );
}
