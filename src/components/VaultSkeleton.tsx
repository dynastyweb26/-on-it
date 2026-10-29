import Skeleton from '@/components/Skeleton';

/** Vault loading state: the search row plus document rows at their real
 *  height (card rows are ~64px), so the list doesn't jump when data lands. */
export default function VaultSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading documents">
      <Skeleton className="mb-3 h-12 w-full rounded-input" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-card" />
      ))}
    </div>
  );
}
