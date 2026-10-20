// Loading placeholder for the Books totals (dashboard). Mirrors design 1b
// exactly so nothing shifts when data arrives: the dark Net hero (figure, then
// "Net · all time" + invoice count), then the Owed / Collected half-width
// tiles and the full-width Spent row. Main's Skeleton renders a warm cream
// shimmer, so on the dark inverse-surface card its placeholders get an opacity
// override to read as faint marks rather than harsh cream blocks (no `onDark`
// prop on main's Skeleton). Sizes track the real elements.
import Skeleton from '@/components/Skeleton';

export default function BooksTotalsSkeleton() {
  return (
    <>
      <span className="sr-only">Loading your books</span>
      <div className="grid grid-cols-1 gap-3 lg:gap-5 lg:grid-cols-3">
        <div className="lg:col-span-1 flex items-center justify-between gap-3 rounded-[22px] bg-inverse-surface p-5 md:p-8 shadow-card-raised">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-10 w-44 opacity-20" />
            <div className="mt-1.5 flex items-center gap-1 text-label-lg font-semibold text-inverse-on-surface/70">
              Net · all time
              <span className="text-inverse-on-surface/50">·</span>
              <Skeleton className="h-3 w-20 opacity-20" />
            </div>
          </div>
          <Skeleton className="h-6 w-6 shrink-0 opacity-20" />
        </div>
        <div className="lg:col-span-2 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2.5 md:gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex min-h-touch flex-col gap-2 rounded-[18px] border border-outline-variant/60 bg-surface-container-lowest p-3.5 shadow-[0_1px_2px_rgba(34,30,24,.05)]">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-3.5 w-16" />
                  <span className="flex-1" />
                  <Skeleton className="h-[18px] w-[18px]" />
                </div>
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
          <div className="flex min-h-touch items-center gap-2.5 rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest px-3.5 py-3">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-3.5 w-12" />
            <span className="flex-1" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-[18px] w-[18px]" />
          </div>
        </div>
      </div>
    </>
  );
}
