// P-66 copy, in one place: the S1 sheet and the S1b card. Every figure comes
// from the moment of failure, so nothing here needs a round trip.
// Numbers arrive already formatted through formatDocNumber(); "estimate" never
// "quote".
import { shortDate } from '@/lib/estimates/owner-view';
import { money } from '@/lib/financials';
import { formatDocNumber } from '@/lib/documents';

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
  // Board 6 reads "Due Nov 12", the same short month the estimate and payment
  // screens use — never the 11/12/2026 that formatDate() prints on documents.
  const due = u.dueDate ? shortDate(u.dueDate) : null;
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

// ── S1b, remembered ────────────────────────────────────────────────────────
// S1b is the one popup whose job outlives the screen it appeared on: the client
// already has the PDF, so the only thing left is marking the row sent — and that
// can happen after the user leaves /chat. The row stays the authority (number,
// client, total, due date, still a draft?); the key holds only what the row
// cannot say: when the sheet closed, and whether the browser was offline at the
// failure that opened it.
//
// Nothing here touches a browser global unless it is asked to. Every function
// takes the storage it should use, so the rules are testable in node, and a
// private-mode browser (where storage throws) simply has no memory — it still
// gets the live card, it just doesn't survive the screen.

export type UnsentShareMemory = { sharedAt: string; offline: boolean };

/** The invoice fields a restore needs. */
export type UnsentShareRow = {
  id: string;
  status?: string | null;
  kind?: string | null;
  invoice_number?: number | null;
  client_name?: string | null;
  total?: number | string | null;
  due_date?: string | null;
};

export type UnsentShareStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function unsentShareKey(id: string): string {
  return `onit.unsentShare.${id}`;
}

/** localStorage, or null when even reading it is refused (private mode, storage
 *  disabled). Null means "no memory", never an error the UI must handle. */
export function browserUnsentShareStorage(): UnsentShareStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    const s = window.localStorage;
    const probe = '__onit_unsent_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function rememberUnsentShare(
  id: string,
  memory: UnsentShareMemory,
  storage: UnsentShareStorage | null = browserUnsentShareStorage(),
): void {
  if (!storage || !id) return;
  try {
    storage.setItem(unsentShareKey(id), JSON.stringify({ sharedAt: memory.sharedAt, offline: memory.offline }));
  } catch { /* quota or blocked: the card just doesn't survive the screen */ }
}

export function forgetUnsentShare(
  id: string,
  storage: UnsentShareStorage | null = browserUnsentShareStorage(),
): void {
  if (!storage || !id) return;
  try { storage.removeItem(unsentShareKey(id)); } catch { /* nothing to do */ }
}

export function readUnsentShare(
  id: string,
  storage: UnsentShareStorage | null = browserUnsentShareStorage(),
): UnsentShareMemory | null {
  if (!storage || !id) return null;
  try {
    const raw = storage.getItem(unsentShareKey(id));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<UnsentShareMemory> | null;
    if (!value || typeof value.sharedAt !== 'string' || typeof value.offline !== 'boolean') return null;
    return { sharedAt: value.sharedAt, offline: value.offline };
  } catch { return null; }
}

/**
 * The card to restore, or null. The row decides everything except sharedAt and
 * offline; a row that is gone — or has left 'draft' — clears the record, because
 * a card must never outlive the state it describes.
 */
export function restoreUnsentShare(
  id: string | null | undefined,
  row: UnsentShareRow | null | undefined,
  storage: UnsentShareStorage | null = browserUnsentShareStorage(),
): UnsentShare | null {
  if (!id) return null;
  const memory = readUnsentShare(id, storage);
  if (!memory) return null;
  if (!row || row.id !== id || row.status !== 'draft') {
    forgetUnsentShare(id, storage);
    return null;
  }
  const kind: UnsentShare['kind'] = row.kind === 'quote' ? row.kind : 'invoice';
  return {
    id,
    kind,
    number: formatDocNumber(kind, Number(row.invoice_number ?? 0)),
    client: row.client_name ?? null,
    total: Number(row.total ?? 0),
    dueDate: row.due_date ?? null,
    sharedAt: memory.sharedAt,
    offline: memory.offline,
  };
}
