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

/** Remove this namespace's current conversation and history. Called on logout
 *  and account deletion so nothing survives into the next session. */
export function clearChatStorage(userId: string | null | undefined): void {
  const ns = storageNamespace(userId);
  try {
    localStorage.removeItem(chatKey(ns));
    localStorage.removeItem(historyKey(ns));
  } catch {
    /* storage blocked — nothing to clear */
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
