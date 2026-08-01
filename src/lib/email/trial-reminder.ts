// Trial-ending reminder email — content only (pure function, no I/O).
// Voice: plain and factual, matching the app's own subscription copy on the
// Settings screen ("You're on your 30-day free trial — $9.99/month, first charge
// {date}. Cancel or update your card in the billing portal."). No emojis, no
// marketing tone, no guilt — per ONIT-SPEC: never make not using it feel bad.
//
// Says the four required things: when the trial ends, that the card is charged,
// that it renews monthly, and how to cancel — with a direct link to manage
// billing.

export interface TrialReminderInput {
  businessName?: string | null; // greet by business name when we have one
  chargeDate: string; // already-formatted, e.g. "August 3, 2026"
  amount: string; // already-formatted, e.g. "$9.99"
  manageUrl: string; // absolute link to the billing management screen
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export function trialReminderEmail(input: TrialReminderInput): EmailContent {
  const { businessName, chargeDate, amount, manageUrl } = input;
  const greetingName = businessName?.trim();
  const greeting = greetingName ? `Hi ${greetingName},` : 'Hi there,';

  const subject = `Your On It free trial ends ${chargeDate}`;

  // Plain-text version — the canonical copy. The HTML mirrors it exactly.
  const text = [
    greeting,
    '',
    `Your 30-day On It free trial ends on ${chargeDate}. On that day, the card on file will be charged ${amount}, and your subscription will renew for ${amount} each month after that.`,
    '',
    `If you want to keep using On It, you don't need to do anything — the charge happens automatically.`,
    '',
    `If you'd rather not continue, cancel before ${chargeDate} and you won't be charged. You can cancel or update your card in the billing portal:`,
    manageUrl,
    '',
    'Questions about your account? Reply to this email or reach us at brandon@dynastyweb.co.',
    '',
    'On It',
  ].join('\n');

  // Minimal, readable HTML — no images, no tracking, system font. Escaping is
  // applied to every interpolated value (business name is user-entered).
  const bn = esc(greetingName ?? '');
  const cd = esc(chargeDate);
  const amt = esc(amount);
  const url = esc(manageUrl);
  const greetingHtml = greetingName ? `Hi ${bn},` : 'Hi there,';

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;">
    <p style="margin:0 0 16px;">${greetingHtml}</p>
    <p style="margin:0 0 16px;">Your 30-day On It free trial ends on <strong>${cd}</strong>. On that day, the card on file will be charged <strong>${amt}</strong>, and your subscription will renew for ${amt} each month after that.</p>
    <p style="margin:0 0 16px;">If you want to keep using On It, you don&rsquo;t need to do anything &mdash; the charge happens automatically.</p>
    <p style="margin:0 0 16px;">If you&rsquo;d rather not continue, cancel before ${cd} and you won&rsquo;t be charged. You can cancel or update your card in the billing portal:</p>
    <p style="margin:0 0 24px;"><a href="${url}" style="color:#b45309;font-weight:600;">Manage or cancel your subscription</a></p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Questions about your account? Reply to this email or reach us at <a href="mailto:brandon@dynastyweb.co" style="color:#6b7280;">brandon@dynastyweb.co</a>.</p>
    <p style="margin:0;color:#6b7280;font-size:14px;">On It</p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

// Escape the few characters that matter in an HTML text/attribute context.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
