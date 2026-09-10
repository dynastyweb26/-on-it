import Skeleton from '@/components/Skeleton';

export default function InvoiceDetailSkeleton() {
  return (
    <div className="px-4 py-4" aria-label="Loading invoice details">
      {/* Card 1: Header & Actions */}
      <div className="card mb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-40 max-w-[60%]" />
            <Skeleton className="h-4 w-28 max-w-[40%]" />
          </div>
          <Skeleton className="h-7 w-24" />
        </div>
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-[56px] w-28 rounded-chip" />
          <Skeleton className="h-[56px] w-28 rounded-chip" />
          <Skeleton className="h-[56px] w-28 rounded-chip" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-10 flex-1 rounded-input" />
        </div>
      </div>

      {/* Card 2: Line Items */}
      <div className="card mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-2 py-1">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-48 max-w-[60%]" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="space-y-2 py-1">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-36 max-w-[50%]" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      {/* Card 3: PDF Preview Container */}
      <div className="overflow-hidden rounded-card border border-outline-variant">
        <Skeleton className="h-[617px] w-full rounded-none" />
      </div>
    </div>
  );
}
