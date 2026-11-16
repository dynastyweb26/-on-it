// Production accepts only production events; every other deployment (preview,
// local) accepts only sandbox events. The wrong kind is acknowledged with 200
// and skipped — a 4xx would make RevenueCat retry it forever, and a sandbox
// purchase must never touch the production database.
export type EnvironmentVerdict = 'accept' | 'skip';

export function environmentVerdict(
  vercelEnv: string | undefined,
  eventEnvironment: string | null | undefined,
): EnvironmentVerdict {
  const eventEnv = String(eventEnvironment ?? '').toUpperCase();
  const production = vercelEnv === 'production';
  return production ? (eventEnv === 'PRODUCTION' ? 'accept' : 'skip') : eventEnv === 'SANDBOX' ? 'accept' : 'skip';
}
