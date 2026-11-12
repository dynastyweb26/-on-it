// ═══ AI Smart · the production-database guard ═══
//
// The AI feature flag is a build-time public flag, and Vercel previews are one
// env var away from pointing at the production database. That combination is a
// preview build writing real rows to real clients' books — the exact accident
// CLAUDE.md warns about. So: if the AI flag is on, this deployment is a Vercel
// PREVIEW, and NEXT_PUBLIC_SUPABASE_URL is the production project, every AI
// route refuses, with one clear server log naming what to fix.
//
// Pure on purpose: the caller passes the env values, so the rule is unit-tested
// without a deployment. Fails closed to "refuse" only for that exact triple;
// production and local development are covered by the feature flag itself.

/** The production Supabase project ref. Never a secret; it appears in the docs. */
export const PRODUCTION_SUPABASE_REF = 'bitfmmffnigxjjyxoxfr';

/** The project ref a Supabase URL points at, or null when it is not a Supabase URL. */
export function supabaseProjectRef(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const match = /^([a-z0-9]{20})\.supabase\.(?:co|in)$/.exec(host);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export type EnvGuardInput = {
  flagOn: boolean;
  vercelEnv: string | undefined;
  supabaseUrl: string | undefined;
};

/**
 * The refusal reason, or null when this deployment may serve AI routes.
 */
export function aiEnvRefusal(input: EnvGuardInput): string | null {
  if (!input.flagOn) return null;
  if (input.vercelEnv !== 'preview') return null;
  if (supabaseProjectRef(input.supabaseUrl) !== PRODUCTION_SUPABASE_REF) return null;
  return 'ai_preview_points_at_production';
}

/** The one server log line, so an operator knows exactly what to change. */
export function logEnvRefusal(reason: string, route: string): void {
  if (reason !== 'ai_preview_points_at_production') return;
  console.error(
    `[${route}] refusing AI: NEXT_PUBLIC_AI_TOOLS is on, this is a Vercel preview, ` +
    `and NEXT_PUBLIC_SUPABASE_URL points at the production project ` +
    `(${PRODUCTION_SUPABASE_REF}). Point the preview environment at the test ` +
    `project, or turn NEXT_PUBLIC_AI_TOOLS off for this deployment.`,
  );
}
