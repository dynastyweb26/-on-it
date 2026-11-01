// ═══ Bank accounts (mock, phase 1) ═══
// The fixture and the pure rules behind Settings › Money › Bank accounts. No
// Plaid SDK, no API: connecting, tracking, the digest time and disconnecting
// only move this object. Like the rest of the bank surfaces it must never
// reach a database write (bank-tracking.test.ts scans this file too).
export type BankTier = 'free' | 'pro';

export type BankConnectionStatus = 'none' | 'syncing' | 'upToDate' | 'needsReconnect';

export type BankAccountOption = {
  id: string;
  name: string;
  mask: string;
  kind: 'checking' | 'savings' | 'credit';
};

export type BankConnection = {
  /** Plaid item UUID once a real link exists; null on the mock/fixture path. */
  itemId: string | null;
  status: BankConnectionStatus;
  institution: string | null;
  /** Every account the institution offers, once connected. */
  accounts: BankAccountOption[];
  /** The ones whose activity On It reads. */
  tracked: string[];
  /** 'HH:mm', 24h. The design's default is 7:00 PM. */
  digestTime: string;
};

export const BANK_DIGEST_DEFAULT = '19:00';
export const DISCONNECTED_TOAST = 'Bank disconnected. Your records are kept.';

// Three accounts is enough to show the choose-accounts step and the Settings
// count ("Bank accounts - 2") without pretending to be a real institution.
export const STARTER_ACCOUNTS: BankAccountOption[] = [
  { id: 'chk-4821', name: 'Business Checking', mask: '4821', kind: 'checking' },
  { id: 'sav-9930', name: 'Business Savings', mask: '9930', kind: 'savings' },
  { id: 'cc-5510', name: 'Ink Business Card', mask: '5510', kind: 'credit' },
];

export const emptyConnection = (digestTime = BANK_DIGEST_DEFAULT): BankConnection => ({
  itemId: null, status: 'none', institution: null, accounts: [], tracked: [], digestTime,
});

/** A connected fixture. `status` lets preview show syncing / reconnect states. */
export const linkedConnection = (
  status: BankConnectionStatus = 'upToDate',
  digestTime = BANK_DIGEST_DEFAULT,
): BankConnection => ({
  itemId: null, status, institution: 'Chase', accounts: STARTER_ACCOUNTS, tracked: ['chk-4821', 'cc-5510'], digestTime,
});

/**
 * ?bankTier=free is a PREVIEW fixture toggle so the Pro lock can be seen
 * without an account change. It only ever reads the URL; the bank UI itself is
 * already dark in production (bankTrackingForEnv).
 */
export function bankTierFromSearch(search: string, fallback: BankTier = 'pro'): BankTier {
  const value = new URLSearchParams(search).get('bankTier');
  if (value === 'free') return 'free';
  if (value === 'pro') return 'pro';
  return fallback;
}

export type BankPreviewState = 'reconnect' | 'syncing' | 'linked';

/**
 * The ONLY preview query that may show fixtures: ?bankState=reconnect|syncing|
 * linked. Anything else (including no query) is a real, empty account.
 */
export function bankPreviewState(search: string): BankPreviewState | null {
  const value = new URLSearchParams(search).get('bankState');
  return value === 'reconnect' || value === 'syncing' || value === 'linked' ? value : null;
}

/**
 * ?bankState=reconnect|syncing|linked jumps straight to a frozen state, the way
 * the design's B9–B11 frames sit beside the live flow. No param = the pitch.
 */
export function initialConnectionFromSearch(search: string): BankConnection {
  switch (bankPreviewState(search)) {
    case 'reconnect': return linkedConnection('needsReconnect');
    case 'syncing': return linkedConnection('syncing');
    case 'linked': return linkedConnection('upToDate');
    default: return emptyConnection();
  }
}

export const isLinked = (connection: BankConnection): boolean => connection.status !== 'none';

export const trackedAccounts = (connection: BankConnection): BankAccountOption[] =>
  connection.accounts.filter((account) => connection.tracked.includes(account.id));

export const trackedCount = (connection: BankConnection): number => trackedAccounts(connection).length;

/**
 * The Settings › Money row. Free users see the lock ("Pro"); once linked the
 * title carries the tracked count and a reconnect shows as the value — never a
 * red dot.
 */
export function bankRowTitle(connection: BankConnection, tier: BankTier): string {
  if (tier === 'free') return 'Connect bank';
  const count = trackedCount(connection);
  return isLinked(connection) && count > 0 ? `Bank accounts - ${count}` : 'Connect bank';
}

export function bankRowValue(connection: BankConnection, tier: BankTier): string | null {
  if (tier === 'free') return 'Pro';
  if (!isLinked(connection)) return null;
  return connection.status === 'needsReconnect' ? 'Reconnect' : null;
}

/** The bank card's status text. Gold, always — reconnect is never red. */
export const ACCOUNT_STATUS_COPY: Record<BankConnectionStatus, string> = {
  none: '',
  syncing: 'Syncing',
  upToDate: 'Up to date',
  needsReconnect: 'Needs reconnect',
};

/** '19:00' → '7:00 PM'. */
export function digestLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = ((Number(h) + 11) % 12) + 1;
  const suffix = Number(h) < 12 ? 'AM' : 'PM';
  return `${hour}:${String(Number.isFinite(m) ? m : 0).padStart(2, '0')} ${suffix}`;
}

/** The digest sheet's rows, default first in the design (7:00 PM). */
export const DIGEST_OPTIONS = ['08:00', '12:00', '18:00', '19:00', '20:00', '21:00'];

export const digestSentence = (hhmm: string): string => `Every day at ${digestLabel(hhmm)}.`;

// ── The real connection: GET /api/plaid/accounts ──
// The route's payload (allow-listed columns only) is mapped to the same
// BankConnection the fixture uses, so every screen rule above keeps working
// unchanged. Still pure: the fetch lives in the screen, these are the rules.

export type BankItemApi = {
  id: string;
  institution_name: string | null;
  status: string;
  last_synced_at: string | null;
  accounts: {
    id: string;
    name: string;
    mask: string | null;
    type: string | null;
    subtype: string | null;
    track: boolean;
  }[];
};

export type BankItemsResponse = { items: BankItemApi[] };

/** credit → 'credit', savings → 'savings', anything else (or unknown) → checking. */
export function bankKind(type: string | null | undefined, subtype: string | null | undefined): BankAccountOption['kind'] {
  const t = (type ?? '').toLowerCase();
  const s = (subtype ?? '').toLowerCase();
  if (t === 'credit' || s.includes('credit')) return 'credit';
  if (s === 'savings') return 'savings';
  return 'checking';
}

/** syncing → 'syncing', active → 'upToDate', needs_reconnect → 'needsReconnect'. */
export function bankConnectionStatus(status: string | null | undefined): BankConnectionStatus {
  if (status === 'active') return 'upToDate';
  if (status === 'needs_reconnect') return 'needsReconnect';
  // 'syncing' and anything unrecognised keep polling rather than claim success.
  return 'syncing';
}

/** One linked item → the connection every bank screen already renders. */
export function itemToConnection(
  item: BankItemApi,
  digestTime = BANK_DIGEST_DEFAULT,
): BankConnection {
  const accounts = item.accounts.map((account) => ({
    id: account.id,
    name: account.name.trim() || 'Account',
    mask: account.mask ?? '',
    kind: bankKind(account.type, account.subtype),
  }));
  return {
    itemId: item.id,
    status: bankConnectionStatus(item.status),
    institution: item.institution_name,
    accounts,
    tracked: item.accounts.filter((account) => account.track === true).map((account) => account.id),
    digestTime,
  };
}

/**
 * The API answers newest first. Multi-bank UI is parked, so the newest item is
 * the connection and every other item is ignored until that card exists.
 */
export function connectionFromItems(
  items: BankItemApi[],
  digestTime = BANK_DIGEST_DEFAULT,
): BankConnection | null {
  const [newest] = items;
  return newest ? itemToConnection(newest, digestTime) : null;
}
