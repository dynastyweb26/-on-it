// Cancellation confirmation email (CANCEL-FLOW-SPEC.md §4) — content only
// (pure function, no I/O). Same voice and layout as trial-reminder.ts: plain,
// factual, no emojis, no guilt copy (spec rule 5). Says what matters: the
// plan is canceled, when access ends, that nothing is deleted, that no more
// charges happen, and how to resume.
import type { EmailContent } from './trial-reminder';

export interface CancellationInput {
  businessName?: string | null; // greet by business name when we have one
  endsOn: string | null;        // already-formatted, e.g. "Nov 16, 2026"; null when unknown
  freePlan: string;             // e.g. "the free plan (3 invoices and 5 expenses)"
  manageUrl: string;            // absolute link to the Plan screen
}

export function cancellationEmail(input: CancellationInput): EmailContent {
  const { businessName, endsOn, freePlan, manageUrl } = input;
  const greetingName = businessName?.trim();
  const greeting = greetingName ? `Hi ${greetingName},` : 'Hi there,';
  const when = endsOn ? `on ${endsOn}` : 'at the end of your current period';

  const subject = endsOn ? `Your On It plan ends ${endsOn}` : 'Your On It plan is canceled';

  // Plain-text version — the canonical copy. The HTML mirrors it exactly.
  const lines = {
    l1: `Your On It subscription is canceled. You won't be charged again.`,
    l2: `You keep your plan until it ends ${when}. After that you're on ${freePlan}. Your invoices, clients and history stay; nothing is deleted.`,
    l3: `Changed your mind? You can resume any time before then from the Plan screen:`,
  };
  const text = [
    greeting, '',
    lines.l1, '',
    lines.l2, '',
    lines.l3,
    manageUrl, '',
    'Questions about your account? Reply to this email or reach us at brandon@dynastyweb.co.', '',
    'On It',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;">
    <p style="margin:0 0 16px;">${greetingName ? `Hi ${esc(greetingName)},` : 'Hi there,'}</p>
    <p style="margin:0 0 16px;">${esc(lines.l1)}</p>
    <p style="margin:0 0 16px;">${esc(lines.l2)}</p>
    <p style="margin:0 0 16px;">${esc(lines.l3)}</p>
    <p style="margin:0 0 24px;"><a href="${esc(manageUrl)}" style="color:#735c00;font-weight:600;">Resume your subscription</a></p>
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
