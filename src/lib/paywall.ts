/**
 * Global paywall kill switch.
 * Defaults to ENABLED. Only NEXT_PUBLIC_PAYWALL_ENABLED="false" disables it,
 * so a missing or malformed env var fails closed.
 */
export const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_PAYWALL_ENABLED !== 'false'

/**
 * Tiers with paid access (the same set hasAccess() treats as unlimited:
 * founder codes, trials, live and past-due subscriptions). Free and canceled
 * users are everything else. Shared by server and client code.
 */
export const PAID_TIERS: ReadonlySet<string> = new Set(['founder', 'trialing', 'active', 'past_due']);
export const isPaidTier = (tier: string | null | undefined): boolean => PAID_TIERS.has(tier ?? 'free');
