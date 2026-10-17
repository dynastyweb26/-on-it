// Annual renewal reminder — pure logic and email content (no I/O).
//
// California's automatic-renewal law expects an annual reminder for a
// subscription that keeps renewing. On It has one plan ($/month, auto-renews),
// so the rule is: once a year, around the anniversary of the day the
// subscription started, email the subscriber what they pay, when the next
// charge is, and how to cancel. Counting from the Stripe subscription's
// start_date means the free trial counts toward the year (earlier, never later).
//
// LEGAL: the timing and wording are a draft for attorney review
// (see PUNCH-LIST "Yearly subscription reminder email").

export const RENEWAL_REMIND_WITHIN_DAYS = 14;
const DAY_MS = 24 * 3600e3;

/** The latest anniversary (1st, 2nd, ...) of the subscription start that falls
 *  on or before now + 14 days, or null while the subscription is under a year
 *  old. startUnix = Stripe subscription.start_date (seconds). */
export function latestAnniversary(startUnix: number, now: Date): Date | null {
  if (!Number.isFinite(startUnix) || startUnix <= 0) return null;
  const start = new Date(startUnix * 1000);
  const horizon = now.getTime() + RENEWAL_REMIND_WITHIN_DAYS * DAY_MS;
  let latest: Date | null = null;
  for (let y = 1; y <= 50; y++) {
    const a = new Date(start.getTime());
    a.setUTCFullYear(start.getUTCFullYear() + y);
    // Feb 29 start rolls to Mar 1 in non-leap years; fine for a reminder.
    if (a.getTime() > horizon) break;
    latest = a;
  }
  return latest;
}

/** Due when a year-or-more anniversary is within the window and we haven't
 *  already sent the reminder for that anniversary (sent before its window
 *  opened = last year's). */
export function renewalReminderDue(
  startUnix: number,
  lastSentISO: string | null,
  now: Date,
): { due: boolean; anniversary: Date | null } {
  const anniversary = latestAnniversary(startUnix, now);
  if (!anniversary) return { due: false, anniversary: null };
  if (!lastSentISO) return { due: true, anniversary };
  const sent = Date.parse(lastSentISO);
  const windowOpens = anniversary.getTime() - RENEWAL_REMIND_WITHIN_DAYS * DAY_MS;
  return { due: !Number.isFinite(sent) || sent < windowOpens, anniversary };
}

export interface RenewalReminderInput {
  businessName?: string | null;
  amount: string; // already formatted, e.g. "$9.99"
  nextChargeDate: string; // already formatted, e.g. "November 17, 2026"
  manageUrl: string; // absolute link to the billing screen
}

export interface RenewalEmailContent {
  subject: string;
  text: string;
  html: string;
}

export function renewalReminderEmail(input: RenewalReminderInput): RenewalEmailContent {
  const { businessName, amount, nextChargeDate, manageUrl } = input;
  const name = businessName?.trim();
  const greeting = name ? `Hi ${name},` : 'Hi there,';
  const subject = 'Your On It subscription renews every month';

  const text = [
    greeting,
    '',
    `A yearly reminder: your On It subscription renews automatically each month. The card on file is charged ${amount} on the same day every month, and your next charge is ${nextChargeDate}.`,
    '',
    `You don't need to do anything to keep going.`,
    '',
    `If you'd rather stop, you can cancel any time in the billing portal. You keep access through the end of the period you've already paid for:`,
    manageUrl,
    '',
    'Questions about your account? Reply to this email or reach us at brandon@dynastyweb.co.',
    '',
    'On It',
  ].join('\n');

  const e = esc;
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;">
    <p style="margin:0 0 16px;">${name ? `Hi ${e(name)},` : 'Hi there,'}</p>
    <p style="margin:0 0 16px;">A yearly reminder: your On It subscription renews automatically each month. The card on file is charged <strong>${e(amount)}</strong> on the same day every month, and your next charge is <strong>${e(nextChargeDate)}</strong>.</p>
    <p style="margin:0 0 16px;">You don&rsquo;t need to do anything to keep going.</p>
    <p style="margin:0 0 16px;">If you&rsquo;d rather stop, you can cancel any time in the billing portal. You keep access through the end of the period you&rsquo;ve already paid for:</p>
    <p style="margin:0 0 24px;"><a href="${e(manageUrl)}" style="color:#b45309;font-weight:600;">Manage or cancel your subscription</a></p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Questions about your account? Reply to this email or reach us at <a href="mailto:brandon@dynastyweb.co" style="color:#6b7280;">brandon@dynastyweb.co</a>.</p>
    <p style="margin:0;color:#6b7280;font-size:14px;">On It</p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
