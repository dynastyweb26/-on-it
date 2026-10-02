/**
 * Launch switch for weekly / monthly recaps — the one shared RECAPS_LIVE flag.
 * Defaults to OFF. Only NEXT_PUBLIC_RECAPS_LIVE="true" turns recaps on, so a
 * missing or malformed env var keeps them hidden.
 *
 * Off: the cron builds no snapshots and sends no recap pushes, and no recap
 * UI appears (the in-app sheet now; the Books row, prompt and the paywall's
 * recap slide as they land). The temporary /dev/recap-preview page ignores it.
 * After feat/paywall-v2 merges, its PaywallModal's local RECAPS_LIVE constant
 * switches to this export.
 */
export const RECAPS_LIVE = process.env.NEXT_PUBLIC_RECAPS_LIVE === 'true'
