import Skeleton from '@/components/Skeleton';

export default function InvoiceDetailSkeleton() {
  return (
    <div className="px-4 py-4" aria-label="Loading invoice details">
      {/* Card 1: receipt header, summary and actions */}
      <div className="card mb-4">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-7 w-28 rounded-chip" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="mt-3 h-7 w-40 max-w-[70%]" />
        <Skeleton className="mt-2 h-4 w-32 max-w-[50%]" />
        <div className="my-3.5">
          <Skeleton className="h-4 w-full rounded-none" />
        </div>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-2 h-10 w-32" />
        <Skeleton className="mt-4 h-touch w-full rounded-input" />
        <div className="mt-3 grid grid-cols-4 gap-2">
          <Skeleton className="h-16 rounded-[14px]" />
          <Skeleton className="h-16 rounded-[14px]" />
          <Skeleton className="h-16 rounded-[14px]" />
          <Skeleton className="h-16 rounded-[14px]" />
        </div>
      </div>

      {/* Card 2: line items */}
      <div className="card mb-4 space-y-3">
        <Skeleton className="h-4 w-24" />
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

      {/* Card 3: PDF preview container */}
      <div className="overflow-hidden rounded-card border border-outline-variant">
        <Skeleton className="h-[617px] w-full rounded-none" />
      </div>
    </div>
  );
}
