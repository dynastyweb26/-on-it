// Pure copy and decisions for the decision + permission round (Boards 2 and 4).
// No React, no DOM. Every string a popup shows here is built once, so the
// components and the tests read the same words. On screen the word is
// "estimate": numbers come from formatDocNumber(), never from a stored kind.
import { calculateInvoiceTotals, money } from '../financials';
import { formatDocNumber } from '../documents';

type DocKind = 'quote' | 'invoice';

const noun = (kind: DocKind) => (kind === 'quote' ? 'estimate' : 'invoice');

// ── C1 · P-01 change guard ───────────────────────────────────────────

type DraftLine = { description: string; qty: number; unit_price: number };
export type ChangeDraft = {
  client_name?: string | null;
  line_items?: DraftLine[] | null;
  tax_rate?: number | null;
};

export type ChangeRow = { k: string; from?: string; to: string };

/** "Car Wash", "Deck stain × 3", "Deck stain + 2 more". */
export function itemsSummary(items: DraftLine[] | null | undefined): string {
  const list = Array.isArray(items) ? items.filter((i) => i.description?.trim()) : [];
  if (list.length === 0) return 'No items';
  const first = list[0];
  const head = first.qty > 1 ? `${first.description.trim()} × ${first.qty}` : first.description.trim();
  return list.length === 1 ? head : `${head} + ${list.length - 1} more`;
}

function totalOf(draft: ChangeDraft): number {
  const items = Array.isArray(draft.line_items) ? draft.line_items : [];
  return calculateInvoiceTotals(items, draft.tax_rate ?? 0).total;
}

/** Only the fields that move: client, items, total. Nothing listed means the
 *  guard fired on something the rows cannot show, and the card shows none. */
export function changeGuardRows(current: ChangeDraft | null, next: ChangeDraft): ChangeRow[] {
  if (!current) return [];
  const rows: ChangeRow[] = [];
  const fromClient = current.client_name?.trim() || '';
  const toClient = next.client_name?.trim() || '';
  if (toClient && fromClient !== toClient) {
    rows.push({ k: 'Client', from: fromClient || undefined, to: toClient });
  }
  const fromItems = itemsSummary(current.line_items);
  const toItems = itemsSummary(next.line_items);
  if (fromItems !== toItems) rows.push({ k: 'Items', from: fromItems, to: toItems });
  const fromTotal = totalOf(current);
  const toTotal = totalOf(next);
  if (fromTotal !== toTotal) rows.push({ k: 'Total', from: money(fromTotal), to: money(toTotal) });
  return rows;
}

export function changeGuardCopy(kind: DocKind, no: number) {
  const number = formatDocNumber(kind, no);
  return {
    eyebrow: `This would change ${number}`,
    text: `This would change ${number}. Update it, or start a new ${noun(kind)}?`,
    updateLabel: `Update ${number}`,
    updateBusy: 'Updating…',
    newLabel: `Start a new ${noun(kind)}`,
    /** The failure line names what was NOT changed. */
    consequence: `${number} wasn't changed.`,
  };
}

// ── C2 · P-02 which client ───────────────────────────────────────────

export function clientChoiceCopy(typed: string) {
  return { text: 'Which client is this for?', newLabel: `New client “${typed}”`, consequence: 'Nothing was saved.' };
}

// ── C3 · P-03 replace an unfinished template ─────────────────────────

type TemplateLike = {
  kind: DocKind;
  client: { name: string } | null;
  items: { name: string; qty?: number | null; unit_price: number | null }[];
};

/** The figure card: who it is for, what is on it, what it comes to. */
export function unfinishedFigure(saved: TemplateLike) {
  const named = saved.items.filter((i) => i.name.trim());
  const total = saved.items.reduce((sum, i) => sum + (i.unit_price ?? 0) * (i.qty ?? 1), 0);
  const parts = [saved.client?.name, named[0]?.name.trim()].filter(Boolean) as string[];
  return {
    label: parts.length ? parts.join(' · ') : `Unfinished ${noun(saved.kind)}`,
    meta: `Unfinished ${noun(saved.kind)}`,
    amount: money(total),
  };
}

export function replaceTemplateCopy(requested: DocKind) {
  return {
    sub: `Starting a new ${noun(requested)} discards it.`,
    keepLabel: 'Keep editing',
    startLabel: 'Start new',
    startBusy: 'Discarding…',
    consequence: 'Your unfinished draft is still here.',
  };
}

// ── C5 · P-15 revise a sent invoice ──────────────────────────────────

export function reviseSheetCopy(kind: DocKind, no: number | null) {
  const number = no != null ? formatDocNumber(kind, no) : `this ${noun(kind)}`;
  return {
    title: `Revise ${number}?`,
    sub: kind === 'quote'
      ? 'Makes a new estimate you can edit. This one and its link stay as they are.'
      : 'Opens an editable copy as a new invoice. The original stays as it was.',
    actionLabel: 'Make an editable copy',
    busyLabel: 'Opening…',
    consequence: `${number === `this ${noun(kind)}` ? 'The original' : number} is unchanged.`,
  };
}

// ── M1 · P-47 microphone denied ──────────────────────────────────────

export function isMicPermissionError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError';
}

export type MicBlocked = {
  platform: 'ios' | 'browser';
  /** Verbatim wording the app already used. */
  text: string;
  steps: { k: string; to: string }[];
  /** Only a browser can be asked again; iOS sends you to Settings. */
  canRetry: boolean;
};

export function micBlockedCard(ios: boolean): MicBlocked {
  return ios
    ? {
        platform: 'ios',
        text: 'To use voice, turn on Microphone for On It in your iPhone Settings, or type instead.',
        steps: [{ k: 'Step 1', to: 'Settings › On It' }, { k: 'Step 2', to: 'Turn on Microphone' }],
        canRetry: false,
      }
    : {
        platform: 'browser',
        text: 'To use voice, allow the microphone for this site in your browser settings, or type instead.',
        steps: [{ k: 'Step 1', to: 'Tap the lock in the address bar' }, { k: 'Step 2', to: 'Microphone › Allow' }],
        canRetry: true,
      };
}

export const MIC_STILL_BLOCKED = {
  title: 'Still blocked',
  body: 'Your browser didn’t ask again. Use the steps above, or type instead.',
};

// ── M2 · P-49 camera blocked ─────────────────────────────────────────

/** The settings path under the camera-off copy. Only a denied camera has one. */
export function cameraStepsLine(failure: string, ios: boolean): string | null {
  if (failure !== 'denied') return null;
  return ios ? 'Settings › On It › Camera' : 'Lock icon in the address bar › Camera › Allow';
}

// ── M3 · P-52 push notifications ─────────────────────────────────────

export const ALERTS_SETTINGS_HREF = '/settings/notifications';
export const ALERTS_FAILED_TEXT = "Couldn't turn that on. You can switch payment alerts on any time in Settings.";

// ── M4 · P-53 clipboard blocked ──────────────────────────────────────

export const CLIPBOARD_BLOCKED_TEXT = 'Clipboard is blocked. Long-press the link to copy it.';
