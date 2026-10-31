// ═══ Plaid Link — pure rules ═══
// The request bodies for /link/token/create and the duplicate-link rule the
// exchange route enforces. No env reads, no network: the routes pass values in
// and the tests drive them.

export type LinkTokenInput = {
  userId: string;
  webhookUrl: string;
  /** Set for update mode (re-login); absent for a fresh link. */
  accessToken?: string;
  clientName?: string;
};

/**
 * Plaid rejects a create-mode token without products/country codes, and rejects
 * an update-mode token that carries them. products = transactions only: money
 * out needs posted transactions, nothing else.
 */
export function linkTokenRequest(input: LinkTokenInput): Record<string, unknown> {
  const base: Record<string, unknown> = {
    user: { client_user_id: input.userId },
    client_name: input.clientName ?? 'On It',
    language: 'en',
    webhook: input.webhookUrl,
  };
  if (input.accessToken) {
    return { ...base, access_token: input.accessToken };
  }
  return {
    ...base,
    products: ['transactions'],
    country_codes: ['US'],
  };
}

export type LinkedBank = {
  institutionId: string | null;
  /** Account masks as the bank prints them (last four). */
  masks: (string | null | undefined)[];
};

const cleanMasks = (masks: LinkedBank['masks']): string[] =>
  masks
    .map((m) => (m ?? '').trim())
    .filter((m) => m.length > 0);

/**
 * The same bank linked twice: same institution id and at least one shared
 * account mask. Masks alone are not enough (every bank has a ••0000), and an
 * institution with entirely different accounts is a second login, not a
 * duplicate. An unknown institution id can never match.
 */
export function isDuplicateLink(incoming: LinkedBank, existing: LinkedBank[]): boolean {
  const institution = (incoming.institutionId ?? '').trim();
  if (!institution) return false;
  const masks = new Set(cleanMasks(incoming.masks));
  if (masks.size === 0) return false;
  return existing.some((item) => {
    if ((item.institutionId ?? '').trim() !== institution) return false;
    return cleanMasks(item.masks).some((mask) => masks.has(mask));
  });
}

/** The copy shown when a duplicate is refused. No account numbers. */
export const DUPLICATE_LINK_MESSAGE =
  'This bank is already linked. Disconnect it first, then connect it again.';

/**
 * tracking is opt-in: the flag and tracked_at move together (the schema has a
 * CHECK for exactly this), and updated_at follows.
 */
export function trackPatch(track: boolean, now: string): {
  track: boolean;
  tracked_at: string | null;
  updated_at: string;
} {
  return { track, tracked_at: track ? now : null, updated_at: now };
}
