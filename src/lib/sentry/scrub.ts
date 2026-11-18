// ═══ What leaves the app for Sentry ═══
// Errors only carry what is needed to fix them. Never sent: cookies, request
// bodies, IPs, headers, the user's email or name (sendDefaultPii is off), and
// the secret part of public links (/pay/<token>, /e/<token>, /i/<token>,
// their /api/ twins), which would let anyone reading an error open a client's
// invoice or estimate. Query strings are dropped for the same reason.
import type { ErrorEvent, Breadcrumb } from '@sentry/nextjs';

const TOKEN_PATH = /(\/(?:api\/)?(?:pay|e|i)\/)[^/?#\s]+/g;

/** A URL or path with link tokens and the query string removed. */
export function scrubUrl(url: string): string {
  const noQuery = url.replace(/[?#].*$/, '');
  return noQuery.replace(TOKEN_PATH, '$1[token]');
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.headers;
    delete event.request.query_string;
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  // Keep only the account id, so an error can be tied to a user without
  // sending who they are.
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : {};
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null);
  return event;
}

/** Console breadcrumbs can hold invoice data the app logged: drop them. URLs
 *  in fetch / navigation breadcrumbs lose their tokens and query. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === 'console') return null;
  const data = crumb.data;
  if (data) {
    for (const key of ['url', 'from', 'to']) {
      if (typeof data[key] === 'string') data[key] = scrubUrl(data[key] as string);
    }
  }
  return crumb;
}

/** Shared by the browser, server and edge set-ups. Off without a DSN, so
 *  local builds and tests never send anything. */
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    sendDefaultPii: false,
    // A small sample of performance traces; every error is still sent.
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
