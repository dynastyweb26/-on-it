import Skeleton from '@/components/Skeleton';

export default function SettingsSkeleton() {
  return (
    <div className="space-y-4 px-4 py-4" aria-label="Loading settings">
      {/* Business Section */}
      <div className="card space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-[56px] w-full rounded-input" />
        <Skeleton className="h-[56px] w-full rounded-input" />
        <Skeleton className="h-[56px] w-full rounded-input" />
      </div>

      {/* Logo Section */}
      <div className="card space-y-3">
        <Skeleton className="h-4 w-16" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
          <Skeleton className="h-5 flex-1 max-w-[70%]" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-[56px] w-28 rounded-chip" />
        </div>
      </div>

      {/* Stripe Section */}
      <div className="card space-y-3" style={{ background: '#fff8f0' }}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-9 w-28 rounded-button" />
        </div>
      </div>

      {/* Payment Handles Section */}
      <div className="card space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
            <Skeleton className="h-[56px] w-full rounded-input" />
          </div>
        ))}
        <Skeleton className="h-[56px] w-full rounded-button" />
      </div>

      {/* Zelle Section */}
      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-[56px] flex-1 rounded-input" />
          <Skeleton className="h-[56px] w-20 rounded-button" />
        </div>
      </div>
    </div>
  );
}
