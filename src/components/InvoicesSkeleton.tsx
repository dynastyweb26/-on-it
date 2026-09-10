import Skeleton from '@/components/Skeleton';

export default function InvoicesSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading invoices">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <Skeleton className="h-7 w-40 max-w-[60%]" />
              <Skeleton className="h-6 w-32 max-w-[40%]" />
            </div>
            <Skeleton className="h-[32px] w-20 shrink-0 rounded-chip" />
          </div>
          <div className="flex items-end justify-between">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
