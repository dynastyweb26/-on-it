import Skeleton from '@/components/Skeleton';

/**
 * Books summary loading state (#2, row 5): the period trigger, the two export
 * buttons, the hero and the breakdown blocks at their real heights, so the page
 * does not jump when the figures land. Only rendered after the 300ms delay
 * (lib/use-delayed-show).
 */
export default function SummarySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading summary">
      <Skeleton className="h-[52px] w-full rounded-input" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-[52px] rounded-button" />
        <Skeleton className="h-[52px] rounded-button" />
      </div>
      <Skeleton className="h-[214px] w-full rounded-card" />
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2.5 rounded-card border border-outline-variant/30 p-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      ))}
    </div>
  );
}
