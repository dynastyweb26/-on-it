// Sentry in the browser: errors and a 10% trace sample. No Session Replay
// (screens show client names and amounts). Scrubbing: lib/sentry/scrub.ts.
import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry/scrub';

Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
