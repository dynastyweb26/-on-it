/**
 * Launch switch for weekly / monthly recaps — the one shared RECAPS_LIVE flag.
 * Defaults to OFF. Only NEXT_PUBLIC_RECAPS_LIVE="true" turns recaps on, so a
 * missing or malformed env var keeps them hidden.
 *
 * Off: the cron builds no snapshots and sends no recap pushes, and no recap
 * UI appears (the Watch/Later sheet, Books card + tab dot, history list, and
 * the paywall's recap slide + "What's included" recaps row in PaywallModal).
 */
export const RECAPS_LIVE = process.env.NEXT_PUBLIC_RECAPS_LIVE === 'true'
