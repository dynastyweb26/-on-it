import Skeleton from '@/components/Skeleton';

export default function ExpensesSkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading expenses">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card flex items-center gap-3">
          <Skeleton className="h-14 w-14 shrink-0 rounded-input" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-5 w-36 max-w-[70%]" />
            <Skeleton className="h-4 w-28 max-w-[50%]" />
          </div>
          <div className="flex shrink-0 flex-col items-end space-y-1.5">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
