// Browser side of POST /api/route. Fetch and the clock are injected so the
// outcomes (answer, feature off, bad body, timeout, no network) are unit-tested
// with a fake. Sends the message and the turn id, and nothing else: no history,
// no draft. The turn id is how this call and /api/ask share ONE model-call
// budget (lib/tools/budget); without it each request is capped on its own.
import type { BypassReason, RouterRoute } from './decide';

export interface RouteAnswer {
  route: RouterRoute;
  /** Composed server-side from the shared copy helpers; only 'unsupported' has one. */
  reply: string | null;
  bypass: BypassReason | null;
}

/** Slightly over the server's 2s ceiling, so its fallback usually wins the race. */
export const ROUTER_CLIENT_TIMEOUT_MS = 2500;

const BYPASSES: BypassReason[] = ['image', 'clarification', 'voice-followup'];

/**
 * One classifier per app. A second call while one is in flight shares that ONE
 * request, so a rage-tap cannot spend two model calls or land two answers.
 */
export function createRouterClient(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = ROUTER_CLIENT_TIMEOUT_MS,
) {
  let inFlight: Promise<RouteAnswer | null> | null = null;

  return function classifyTurn(message: string, turnId?: string | null): Promise<RouteAnswer | null> {
    if (inFlight) return inFlight;

    inFlight = (async (): Promise<RouteAnswer | null> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl('/api/route', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(turnId ? { 'x-turn-id': turnId } : {}),
          },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });
        // 404 (feature off), 401, 429 and 5xx all mean the same thing here: the
        // old path decides. The caller never sees a partial answer.
        if (!res.ok) return null;
        const data = (await res.json().catch(() => null)) as Partial<RouteAnswer> | null;
        const route = data?.route;
        if (route !== 'ask' && route !== 'build' && route !== 'unsupported') return null;
        return {
          route,
          reply: typeof data?.reply === 'string' && data.reply.trim() ? data.reply : null,
          bypass: BYPASSES.find((b) => b === data?.bypass) ?? null,
        };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    })().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}

/** The app's classifier. Module-scoped so the in-flight guard is shared. */
export const classifyTurn = createRouterClient();
