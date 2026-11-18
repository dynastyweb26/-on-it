// Sentry on the server (Node) and in middleware (Edge). Same options and
// scrubbing as the browser: lib/sentry/scrub.ts.
import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry/scrub';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));
  }
}

export const onRequestError = Sentry.captureRequestError;
