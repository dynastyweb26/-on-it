// ═══ feedback.thumbs · writing the vote ═══
//
// One row per (user, message) in public.chat_feedback, written under the
// CALLER'S session: RLS proves the row is theirs and the message is theirs, and
// the unique (user_id, message_id) index makes "change the vote" an upsert onto
// the same row rather than a second one. Clearing deletes the row.
//
// The store never sees the service role. It validates before writing, so a bad
// reason or an over-long note is refused here instead of by the database.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FEEDBACK_NOTE_MAX,
  FeedbackReasonsSchema,
  type FeedbackReason,
} from './reasons';

export type FeedbackVote = {
  messageId: string;
  thumb: 'up' | 'down';
  reasons?: readonly FeedbackReason[];
  note?: string | null;
};

export interface FeedbackStore {
  /** Save or change the vote; exactly one row per message survives. */
  save(vote: FeedbackVote): Promise<void>;
  /** Remove the vote for a message. */
  clear(messageId: string): Promise<void>;
}

export function validateVote(vote: FeedbackVote): {
  messageId: string;
  thumb: 'up' | 'down';
  reasons: FeedbackReason[] | null;
  note: string | null;
} {
  if (!vote.messageId.trim()) throw new Error('feedback needs a message id');
  const reasons = FeedbackReasonsSchema.parse([...(vote.reasons ?? [])]);
  const note = (vote.note ?? '').trim();
  if (note.length > FEEDBACK_NOTE_MAX) {
    throw new Error(`feedback note is ${note.length} characters, max ${FEEDBACK_NOTE_MAX}`);
  }
  return {
    messageId: vote.messageId,
    thumb: vote.thumb,
    reasons: reasons.length ? reasons : null,
    note: note.length ? note : null,
  };
}

export function supabaseFeedbackStore(client: SupabaseClient, userId: string): FeedbackStore {
  if (!userId) throw new Error('feedback writes need the caller session');
  return {
    async save(vote) {
      const v = validateVote(vote);
      const { error } = await client.from('chat_feedback').upsert(
        {
          user_id: userId,
          message_id: v.messageId,
          thumb: v.thumb,
          reasons: v.reasons,
          note: v.note,
        },
        { onConflict: 'user_id,message_id' },
      );
      if (error) throw new Error(error.message);
    },

    async clear(messageId) {
      if (!messageId.trim()) throw new Error('feedback needs a message id');
      const { error } = await client
        .from('chat_feedback')
        .delete()
        .eq('user_id', userId)
        .eq('message_id', messageId);
      if (error) throw new Error(error.message);
    },
  };
}
