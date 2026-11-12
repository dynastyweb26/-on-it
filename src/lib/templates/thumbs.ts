// ═══ feedback.thumbs · when the thumbs exist ═══
//
// RULES.md §6, items 1-3, as one pure decision. The component draws what this
// returns; it never decides visibility itself, so there is one answer to "may I
// vote on this reply?" in the whole app.
//
// Show: under the latest assistant reply only, after its text has finished
// appearing, one set per reply even when it includes a card, and never for:
// a confirm card waiting for an answer, an event or recap card the app posted,
// the signed-out reply, an error reply, a cant.do reply, or the last message of
// a reopened past chat.
//
// Vote: up or down, changeable while the reply is still the latest; the log
// keeps the final vote. Down opens the follow-up; closing, skipping or sending
// it keeps the vote.

export type ReplyKind =
  | 'answer'
  | 'confirm_pending'
  | 'event'
  | 'recap'
  | 'signed_out'
  | 'error'
  | 'cant_do';

export type ThumbVote = 'up' | 'down';

export type ThumbReply = {
  kind: ReplyKind;
  /** True only for the newest assistant reply in the thread. */
  isLatestAssistantReply: boolean;
  /** The reply's text has finished appearing (no partial answer). */
  textDone: boolean;
  /** This is the last message of a chat reopened from history. */
  reopenedPastChatLast: boolean;
};

export type ThumbReplyState = ThumbReply & {
  /** The vote currently stored for this reply, if any. */
  vote?: ThumbVote | null;
  /** The thumbs-down follow-up is open. */
  followUpOpen?: boolean;
};

export type ThumbDecision =
  | { show: true; vote: ThumbVote | null; followUpOpen: boolean }
  | {
      show: false;
      reason: 'not_latest' | 'text_unfinished' | 'reopened_past_chat' | ReplyKind;
    };

const NEVER_SHOWN: ReadonlySet<ReplyKind> = new Set<ReplyKind>([
  'confirm_pending',
  'event',
  'recap',
  'signed_out',
  'error',
  'cant_do',
]);

/**
 * One decision per reply. Order matters only for the reported reason: the
 * latest-reply and finished-text checks come first because they are true of
 * every reply that is not the candidate.
 */
export function thumbDecision(reply: ThumbReplyState): ThumbDecision {
  if (!reply.isLatestAssistantReply) return { show: false, reason: 'not_latest' };
  if (!reply.textDone) return { show: false, reason: 'text_unfinished' };
  if (reply.reopenedPastChatLast) return { show: false, reason: 'reopened_past_chat' };
  if (NEVER_SHOWN.has(reply.kind)) return { show: false, reason: reply.kind };
  return {
    show: true,
    vote: reply.vote ?? null,
    followUpOpen: (reply.vote ?? null) === 'down' && reply.followUpOpen === true,
  };
}

/**
 * The vote to log. A new reply makes the previous set irrelevant (the UI only
 * shows the latest), so the caller passes the votes recorded for THIS reply in
 * order; the last one wins, and an explicit clear (null) counts as a vote.
 */
export function finalVote(votes: readonly (ThumbVote | null)[]): ThumbVote | null {
  return votes.length ? votes[votes.length - 1] : null;
}

/**
 * A tap. Tapping the same thumb again clears it; the other thumb switches and
 * opens or closes the follow-up. There is never a third state.
 */
export function afterVote(
  current: ThumbVote | null,
  tapped: ThumbVote,
): { vote: ThumbVote | null; followUpOpen: boolean } {
  if (current === tapped) return { vote: null, followUpOpen: false };
  return { vote: tapped, followUpOpen: tapped === 'down' };
}
