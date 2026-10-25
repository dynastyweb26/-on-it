'use client';
// Last-resort boundary: a render crash shows this calm screen instead of the
// framework's raw "Application error: a client-side exception" text. The real
// error still goes to the console for debugging.
import { useEffect } from 'react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('app error boundary', error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-headline-lg text-on-background">Something went wrong</h1>
      <p className="max-w-sm text-body-md text-on-surface-variant">
        Sorry about that. Your work is safe. Try again, and if it keeps happening, reload the page.
      </p>
      <div className="flex gap-2">
        <button className="btn-primary px-5" onClick={() => reset()}>Try again</button>
        <button className="btn-outline px-5" onClick={() => window.location.reload()}>Reload</button>
      </div>
    </main>
  );
}
