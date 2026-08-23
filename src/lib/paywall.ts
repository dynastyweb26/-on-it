/**
 * Global paywall kill switch.
 * Defaults to ENABLED. Only NEXT_PUBLIC_PAYWALL_ENABLED="false" disables it,
 * so a missing or malformed env var fails closed.
 */
export const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_PAYWALL_ENABLED !== 'false'
