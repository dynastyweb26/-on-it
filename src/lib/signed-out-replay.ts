// Signed-out chat, part two: remember the question, and answer it after sign-in.
//
// Pure decisions only. The storage and the screen live in ChatView; everything
// that DECIDES (what to remember, when to replay, when to clear, what to say
// when it fails) is here so it is tested.
//
//   remember  every guest question is written to sessionStorage (per tab); a
//             later one overwrites the earlier, so only the LAST is ever run
//   replay    once signed in with the profile loaded and Chat idle: run it, once
//   clear     it is removed from storage BEFORE it runs (a refresh, a second
//             render or a second tab can never run it again), and on every exit:
//             success, error, cancel (new chat), expiry
//   prompt    the "not signed in" message and its button go away at sign-in
import type { SignInState } from '@/lib/chat-signed-out';

export const PENDING_KEY = 'onit-signed-out-question';
/** A remembered question older than this is dropped, never replayed. */
export const PENDING_TTL_MS = 30 * 60e3;
export const MAX_QUESTION_CHARS = 2000;

export type AskSource = 'voice' | 'typed';
export interface PendingQuestion { text: string; source: AskSource; at: number }

/** What to remember for a guest's message: nothing for a blank one. */
export function rememberQuestion(text: string, source: AskSource, now: number): PendingQuestion | null {
  const t = text.trim().slice(0, MAX_QUESTION_CHARS);
  return t ? { text: t, source, at: now } : null;
}

/** Storage is untrusted: anything off the shape is no question at all. */
export function parsePending(raw: string | null): PendingQuestion | null {
  try {
    const v = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!v || typeof v !== 'object') return null;
    const text = typeof v.text === 'string' ? v.text.trim().slice(0, MAX_QUESTION_CHARS) : '';
    const at = typeof v.at === 'number' && Number.isFinite(v.at) ? v.at : NaN;
    if (!text || Number.isNaN(at)) return null;
    return { text, source: v.source === 'voice' ? 'voice' : 'typed', at };
  } catch {
    return null;
  }
}

export type ReplayDecision = 'none' | 'wait' | 'run' | 'clear';

/**
 * none   nothing remembered
 * clear  remembered but expired: drop it
 * wait   not signed in yet, the profile is still loading, or Chat is busy
 * run    signed in and idle: run it now (the caller removes it first)
 */
export function replayDecision(s: {
  pending: PendingQuestion | null;
  signedIn: boolean;
  profileReady: boolean;
  busy: boolean;
  now: number;
}): ReplayDecision {
  if (!s.pending) return 'none';
  if (s.now - s.pending.at > PENDING_TTL_MS || s.pending.at > s.now + 60_000) return 'clear';
  if (!s.signedIn || !s.profileReady || s.busy) return 'wait';
  return 'run';
}

interface ThreadMsg { id: string; role: 'user' | 'assistant'; content: string; signInLink?: true }

/**
 * The thread once the owner is signed in: every "not signed in" message and its
 * button are gone, and so is the echo of the question about to be re-sent (send()
 * echoes it again; keeping both would show it twice). Earlier unanswered
 * questions stay as the owner wrote them. Reference-stable when nothing changes.
 */
export function afterSignIn<T extends ThreadMsg>(messages: T[], replayText: string | null): T[] {
  const hasPrompt = messages.some((m) => m.signInLink);
  if (!hasPrompt && !replayText) return messages;
  const out = messages.filter((m) => !m.signInLink);
  if (replayText) {
    const t = replayText.trim();
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].role === 'user' && out[i].content.trim() === t) { out.splice(i, 1); break; }
    }
  }
  return out.length === messages.length ? messages : out;
}

export type SignInFailure = 'auth' | 'network' | 'server';

/** The real cause, in words. `offline` is navigator.onLine === false. */
export function classifySignInFailure(err: unknown, offline: boolean): SignInFailure {
  if (offline) return 'network';
  const e = err as { status?: unknown; name?: unknown; message?: unknown } | null;
  const status = typeof e?.status === 'number' ? e.status : null;
  if (status === 401 || status === 403) return 'auth';
  const msg = typeof e?.message === 'string' ? e.message.toLowerCase() : '';
  if (e?.name === 'TypeError' || /failed to fetch|network|load failed/.test(msg)) return 'network';
  return 'server';
}

export function signInFailureMessage(kind: SignInFailure): string {
  switch (kind) {
    case 'auth': return "Couldn't sign you in. Tap Sign in to try again.";
    case 'network': return "You're offline, so I couldn't finish signing you in. Your question is saved.";
    case 'server': return "Couldn't reach the server to finish signing you in. Your question is saved.";
  }
}

/** The button's state after the page was left and came back: nothing is pending. */
export const SIGN_IN_RESTING: SignInState = 'idle';
