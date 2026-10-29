'use client';
// The calm screen for a client-side render crash. Shared by the route-level
// error.tsx and the AppErrorBoundary class, so the copy lives in one place.
export default function AppErrorView({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-headline-lg text-on-background">Something went wrong</h1>
      <p className="max-w-sm text-body-md text-on-surface-variant">
        Sorry about that. Your work is safe. Try again, and if it keeps happening, reload the page.
      </p>
      <div className="flex gap-2">
        <button className="btn-primary px-5" onClick={onRetry}>Try again</button>
        <button className="btn-outline px-5" onClick={() => window.location.reload()}>Reload</button>
      </div>
    </main>
  );
}
