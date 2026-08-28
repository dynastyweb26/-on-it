// Keys and helpers for the per-browser conversation store. Kept in one place so
// the chat screen (reader/writer) and the sign-out paths (which must clear it)
// can never disagree on where the data lives.
//
// Namespacing: every key is suffixed with a namespace — the signed-in user's id,
// or 'guest' for the pre-auth demo. Two accounts sharing one browser (or the
// same person signing out and a different one signing in) therefore never
// rehydrate each other's draft.

export const CHAT_STORE_BASE = 'onit_chat_current';
export const HISTORY_BASE = 'onit_chat_history';

/** 'guest' when there's no signed-in user. */
export const storageNamespace = (userId: string | null | undefined): string => userId ?? 'guest';

export const chatKey = (ns: string): string => `${CHAT_STORE_BASE}:${ns}`;
export const historyKey = (ns: string): string => `${HISTORY_BASE}:${ns}`;

/** Remove only this namespace's in-progress conversation, leaving the recent-5
 *  history intact. History is per-user namespaced and durable: signing back in
 *  (or a different account signing in) restores the correct list and never sees
 *  another account's. Called on logout and account switch. The current
 *  conversation is ephemeral, so it is the only thing cleared. */
export function clearChatStorage(userId: string | null | undefined): void {
  const ns = storageNamespace(userId);
  try {
    localStorage.removeItem(chatKey(ns));
  } catch {
    /* storage blocked — nothing to clear */
  }
}

/** Remove this namespace's conversation AND history — everything. Used only for
 *  account deletion, where nothing about the account should survive locally. */
export function clearAllChatStorage(userId: string | null | undefined): void {
  const ns = storageNamespace(userId);
  try {
    localStorage.removeItem(chatKey(ns));
    localStorage.removeItem(historyKey(ns));
  } catch {
    /* storage blocked — nothing to clear */
  }
}

/** Adopt a guest draft into a newly signed-in user's namespace.
 *
 *  A guest builds a conversation under the 'guest' slot, hits the sign-in wall
 *  at finalize, signs in, and returns to a namespace that has never been
 *  written — their work is stranded. Called once on mount after the session
 *  resolves and BEFORE the namespace is used for any read, so the normal
 *  restore path picks the adopted draft up with no special-casing.
 *
 *  Never clobbers: if the account already has a draft of its own, the guest
 *  slot is left alone. Version/TTL validation is deliberately not repeated
 *  here — loadStoredChat already rejects a stale or malformed payload on read.
 */
export function adoptGuestChat(userId: string | null | undefined): void {
  if (!userId) return; // no real account to adopt into
  const ns = storageNamespace(userId);
  if (ns === 'guest') return; // defensive; unreachable given the guard above
  try {
    if (localStorage.getItem(chatKey(ns))) return; // account has its own draft — leave both alone
    const guestDraft = localStorage.getItem(chatKey('guest'));
    if (!guestDraft) return;
    localStorage.setItem(chatKey(ns), guestDraft);
    localStorage.removeItem(chatKey('guest'));
  } catch {
    /* storage blocked — nothing to adopt */
  }
}

/** One-time cleanup of the pre-namespacing keys, so a draft written by an older
 *  build doesn't linger unreadable in localStorage forever. */
export function dropLegacyChatStorage(): void {
  try {
    localStorage.removeItem(CHAT_STORE_BASE);
    localStorage.removeItem(HISTORY_BASE);
  } catch {
    /* ignore */
  }
}
