// Owner outcomes are local assistant cards (RULES): never events, never
// toasts, and never a server write. A screen that finishes an owner action
// hands the card to the chat through here.
//
// Two deliveries, one path: the event wakes a mounted chat immediately, and a
// small queue carries it across the navigation (the estimate screen pushes to
// the new invoice, so the chat is usually unmounted at that moment). The chat
// drains the queue when it receives the event, so a live chat can never show
// the card twice.

export const OWNER_CARD_EVENT = 'onit-owner-card';
export const OWNER_CARD_KEY = 'onit_pending_owner_cards';

export interface OwnerCard {
  /** "INV-0042 is ready" — the assistant's line. */
  title: string;
  invoiceId: string;
  at?: number;
}

const MAX_PENDING = 5;

/** Post an owner card. Safe with no chat mounted, and with no storage. */
export function postOwnerCard(card: { title: string; invoiceId: string }): void {
  const stamped: OwnerCard = { ...card, at: Date.now() };
  try {
    localStorage.setItem(OWNER_CARD_KEY, JSON.stringify([...readPending(), stamped].slice(-MAX_PENDING)));
  } catch { /* storage blocked: the live event below still reaches a mounted chat */ }
  try {
    window.dispatchEvent(new CustomEvent(OWNER_CARD_EVENT, { detail: stamped }));
  } catch { /* no window (server render) — nothing to wake */ }
}

/** Take everything waiting, oldest first, and clear it. */
export function drainOwnerCards(): OwnerCard[] {
  try {
    const pending = readPending();
    if (pending.length === 0) return [];
    localStorage.removeItem(OWNER_CARD_KEY);
    return pending;
  } catch {
    return [];
  }
}

function readPending(): OwnerCard[] {
  try {
    const raw = localStorage.getItem(OWNER_CARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is OwnerCard =>
      !!c && typeof (c as OwnerCard).title === 'string' && typeof (c as OwnerCard).invoiceId === 'string');
  } catch {
    return [];
  }
}
