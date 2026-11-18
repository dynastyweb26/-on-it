// ═══ What leaves the app for PostHog ═══
// Product analytics only: which screens were opened and named events the app
// sends on purpose. Never: autocaptured clicks (their element text can hold a
// client's name or an amount), console logs, session replay, query strings,
// or the secret part of public links (/pay/<token>, /e/<token>, /i/<token>).
// The person is the account id only, never an email or name.
// Matches the Privacy Policy's "Analytics and crash reporting" section.

const TOKEN_PATH = /(\/(?:api\/)?(?:pay|e|i)\/)[^/?#\s]+/g;

/** A URL or path with link tokens and the query string / hash removed. */
export function scrubUrl(url: string): string {
  return url.replace(/[?#].*$/, '').replace(TOKEN_PATH, '$1[token]');
}

/** Public pages a client's customer opens: never tracked (not our users). */
export function isPublicPath(pathname: string): boolean {
  return /^\/(pay|e|i)\//.test(pathname);
}

const URL_PROPS = ['$current_url', '$pathname', '$referrer', '$initial_current_url', '$initial_pathname', '$initial_referrer', '$prev_pageview_pathname'] as const;

type CaptureLike = { event: string; properties?: Record<string, unknown>; $set?: Record<string, unknown>; $set_once?: Record<string, unknown> } | null;

/** before_send: drop anything from public pages, autocapture and exceptions;
 *  clean every URL property. */
export function scrubCapture<T extends CaptureLike>(cap: T): T | null {
  if (!cap) return cap;
  if (cap.event === '$autocapture' || cap.event === '$exception' || cap.event === '$rageclick' || cap.event === '$dead_click') return null;
  const props = cap.properties ?? {};
  const path = typeof props.$pathname === 'string' ? props.$pathname : '';
  if (path && isPublicPath(path)) return null;
  for (const bag of [cap.properties, cap.$set, cap.$set_once]) {
    if (!bag) continue;
    for (const key of URL_PROPS) {
      if (typeof bag[key] === 'string') bag[key] = scrubUrl(bag[key] as string);
    }
  }
  return cap;
}

/** The init options, shared and tested. Off without a key. */
export function posthogOptions() {
  return {
    // Our own origin, rewritten to PostHog in next.config.mjs.
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    defaults: '2025-05-24' as const,
    capture_pageview: 'history_change' as const,
    capture_pageleave: true,
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    disable_session_recording: true,
    disable_surveys: true,
    enable_heatmaps: false,
    capture_exceptions: false,
    person_profiles: 'identified_only' as const,
    // No extra scripts from PostHog's servers (recorder, surveys, toolbar):
    // script-src in the CSP stays as it is.
    disable_external_dependency_loading: true,
    before_send: scrubCapture,
  };
}
