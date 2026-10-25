// One nudge per send.
//
// Chat has four tip cards that all want the same moment — right after a
// document goes out: "Add your terms" (lib/terms-prompt.ts), the payouts nudge
// (no payment processor connected), the payment-alerts ask (push), and the
// "Got a minute?" feedback card (lib/feedback.ts). Each keeps its own
// eligibility rule; this module only decides which single one gets the moment.
//
// Priority, highest first:
//   terms    — a one-minute setup that makes every later document better
//   payouts  — no processor means the client literally can't pay online
//   alerts   — the 2-day unpaid nudge / paid-online notification
//   feedback — nice to have, never urgent
//
// Pure and dependency-free so the full matrix is unit-testable and the caller
// can't accidentally show two cards for one send.

export const TIP_PRIORITY = ['terms', 'payouts', 'alerts', 'feedback'] as const;

export type Tip = (typeof TIP_PRIORITY)[number];

/** Which tips are eligible for this send. A missing or false key is not eligible. */
export type TipEligibility = Partial<Record<Tip, boolean>>;

/** The one tip to show, or null. Never more than one. */
export function pickTip(eligible: TipEligibility | null | undefined): Tip | null {
  if (!eligible) return null;
  for (const tip of TIP_PRIORITY) {
    if (eligible[tip] === true) return tip;
  }
  return null;
}
