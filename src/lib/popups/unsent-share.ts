// P-66 copy, in one place: the S1 sheet and the S1b card. Every figure comes
// from the moment of failure, so nothing here needs a round trip.
// Numbers arrive already formatted through formatDocNumber(); "estimate" never
// "quote".
import { formatDate } from '@/lib/dates';
import { money } from '@/lib/financials';

export type UnsentShare = {
  id: string;
  kind: 'invoice' | 'quote';
  /** formatDocNumber() output, e.g. INV-0007. */
  number: string;
  client: string | null;
  total: number;
  dueDate?: string | null;
  /** When the share sheet closed (ISO). */
  sharedAt: string;
  /** navigator.onLine was false at the failure — picks the cause line. */
  offline: boolean;
};

export type UnsentShareCopy = {
  eyebrow: string;
  title: string;
  sub: string;
  /** The retry frame's wording: a second failure says when it ends. */
  retryFailure: { title: string; body: string };
  truths: Array<{ ok: boolean; title: string; body: string }>;
  note: string;
  cardTitle: string;
  cardText: string;
  done: string;
};

export function unsentShareCopy(
  u: UnsentShare,
  opts: { retryLabel?: string } = {},
): UnsentShareCopy {
  const retry = opts.retryLabel ?? 'Retry the share';
  const who = (u.client ?? '').trim();
  const first = who ? who.split(/\s+/)[0] : 'Your client';
  const at = new Date(u.sharedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const due = u.dueDate ? formatDate(u.dueDate) : null;
  const canSee = due
    ? `They can see ${money(u.total)} due ${due}.`
    : `They can see ${money(u.total)}.`;

  return {
    eyebrow: `${u.number} · ${who || 'Your client'} · ${money(u.total)}`,
    title: 'Shared, but not marked sent',
    sub: u.offline
      ? 'You went offline right after the share sheet closed.'
      : 'Something broke on our end right after the share.',
    // Board 6: the retry frame is about the wait, not the cause again.
    retryFailure: {
      title: 'Still offline',
      body: `${u.number} stays a draft until you’re back. ${first}’s PDF is unaffected.`,
    },
    truths: [
      { ok: true, title: `${first} has the PDF`, body: `Shared ${at}. ${canSee}` },
      {
        ok: false,
        title: `${u.number} is still a draft in On It`,
        body: 'No pay link, no payment reminders, and it isn’t in your sent totals yet.',
      },
    ],
    note: `Mark as sent saves it as sent (the client already has it). ${retry} opens the share sheet again, then marks it sent.`,
    cardTitle: `${u.number} is still a draft`,
    cardText: `${first} has the PDF, but it isn’t marked sent, so there’s no pay link yet.`,
    done: `${u.number} marked sent. Pay link is live.`,
  };
}
