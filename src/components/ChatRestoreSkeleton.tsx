// Shown while the conversation restores from localStorage (pre-hydration),
// instead of flashing the greeting bubble before a saved chat swaps in. The
// message area scrolls and the composer is separate, so bubble heights need
// only approximate real ones — no page reflow either way.
import Skeleton from '@/components/Skeleton';

export default function ChatRestoreSkeleton() {
  return (
    <div className="space-y-3">
      <span className="sr-only">Restoring your conversation</span>
      <div className="flex justify-start"><Skeleton className="h-16 w-3/4 rounded-card rounded-bl-md" /></div>
      <div className="flex justify-end"><Skeleton className="h-10 w-1/2 rounded-card rounded-br-md" /></div>
      <div className="flex justify-start"><Skeleton className="h-12 w-2/3 rounded-card rounded-bl-md" /></div>
    </div>
  );
}
