// Which assistant reply may carry thumbs, as data for lib/templates/thumbs.ts. No
// messageId means no thumbs: a control that cannot save is never shown.
import type { ReplyKind, ThumbReply } from '@/lib/templates/thumbs';

/** The parts of a thread message the decision reads (ChatView's Msg satisfies it). */
export type ThumbMsg = {
  messageId?: string;
  template?: { id: string };
  signInLink?: true;
  failed?: unknown;
  recapCard?: unknown;
  ownerCard?: unknown;
  commandCard?: true;
  payCard?: unknown;
  sentCard?: unknown;
  logged?: unknown;
  payoutsNudge?: true;
};

export function replyKindOf(m: ThumbMsg): ReplyKind {
  if (m.signInLink) return 'signed_out';
  if (m.failed) return 'error';
  if (m.template?.id === 'cant.do') return 'cant_do';
  if (m.recapCard) return 'recap';
  if (m.ownerCard || m.commandCard || m.payCard || m.sentCard || m.logged || m.payoutsNudge) return 'event';
  return 'answer';
}

/** null when this message can never carry thumbs (no messageId to save against). */
export function thumbReplyFor(
  m: ThumbMsg,
  ctx: { isLatestAssistantReply: boolean; textDone: boolean; reopenedPastChatLast: boolean },
): ThumbReply | null {
  if (!m.messageId) return null;
  return { kind: replyKindOf(m), ...ctx };
}
