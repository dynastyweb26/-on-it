// Pure helpers for draft.message. State and channel pairs are NOT mapped here:
// that is resolveDraftMessageState() in lib/templates/props.ts.

/** How long to wait for the device to hand over to Messages before calling it a failure. */
export const OPEN_WAIT_MS = 1500;

/**
 * The sms: link that opens the device's Messages app with the recipient and body
 * filled in. The body is encoded as given; nothing is added, formatted or
 * recomputed. null when the phone has no usable number (nothing to open).
 */
export function smsHref(phone: string, body: string): string | null {
  const to = phone.replace(/[^\d+]/g, '');
  if (to.replace(/\D/g, '').length < 7) return null;
  return `sms:${to}?&body=${encodeURIComponent(body)}`;
}
