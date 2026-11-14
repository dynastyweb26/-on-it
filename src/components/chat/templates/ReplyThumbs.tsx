'use client';
// Thumbs under one assistant reply, saving through POST /api/ask/feedback. Whether
// they show at all is thumbs.ts (inside FeedbackThumbs, given `reply`); a failed
// save rejects with the cause, so the card un-fills the vote and names it.
import FeedbackThumbs from './FeedbackThumbs';
import { sendThumb } from '@/lib/ask-feedback-client';
import type { ThumbReply } from '@/lib/templates/thumbs';

export default function ReplyThumbs({ messageId, reply }: { messageId: string; reply: ThumbReply }) {
  return (
    <FeedbackThumbs
      state="idle"
      reply={reply}
      onVote={async (vote, reasons, note) => {
        const out = await sendThumb({ messageId, thumb: vote, reasons: reasons ?? [], note: note ? note : null });
        if (out.kind !== 'ok') throw new Error(out.message);
      }}
    />
  );
}
