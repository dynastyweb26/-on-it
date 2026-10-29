'use client';
// Route-level boundary: a render crash in a route segment shows this calm
// screen instead of the framework's raw "Application error: a client-side
// exception" text. The real error still goes to the console.
//
// The component stack is logged by AppErrorBoundary (components/AppErrorBoundary
// .tsx), which wraps the app shell — this route boundary only ever receives the
// error and a digest, so the boundary that has the stack does the detailed log.
import { useEffect } from 'react';
import AppErrorView from '@/components/AppErrorView';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('app error boundary', error);
  }, [error]);

  return <AppErrorView onRetry={() => reset()} />;
}
