// ═══ feedback.thumbs · the six stored reasons ═══
//
// RULES / the Feedback design: the follow-up shows six chips. What is stored is
// the fixed list the migration's check constraint accepts, never the label the
// user read. One map, so the two cannot drift.
import { z } from 'zod';

export const FEEDBACK_REASONS = [
  'wrong_number',
  'wrong_record',
  'didnt_understand',
  'couldnt_do_it',
  'too_slow',
  'other',
] as const;

export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export const FeedbackReasonSchema = z.enum(FEEDBACK_REASONS);

/** The design's chip labels, in the order the file lists them. */
export const FEEDBACK_CHIPS = [
  { label: 'Wrong number', reason: 'wrong_number' },
  { label: 'Wrong person or record', reason: 'wrong_record' },
  { label: "Didn't understand", reason: 'didnt_understand' },
  { label: "Couldn't do it", reason: 'couldnt_do_it' },
  { label: 'Too slow', reason: 'too_slow' },
  { label: 'Other', reason: 'other' },
] as const;

const BY_LABEL = new Map<string, FeedbackReason>(
  FEEDBACK_CHIPS.map((c) => [c.label, c.reason]),
);

/** The stored value for a chip label, or null when the label is not a chip. */
export function reasonForChip(label: string): FeedbackReason | null {
  return BY_LABEL.get(label) ?? null;
}

/**
 * Chip labels to stored values: unknown labels are refused (a typo must not
 * silently drop a reason), duplicates collapse, and more than six is impossible
 * because there are only six chips.
 */
export function reasonsForChips(labels: readonly string[]): FeedbackReason[] {
  const out: FeedbackReason[] = [];
  for (const label of labels) {
    const reason = reasonForChip(label);
    if (!reason) throw new Error(`unknown feedback chip: ${label}`);
    if (!out.includes(reason)) out.push(reason);
  }
  return out;
}

export const FEEDBACK_NOTE_MAX = 1000;

/** What the store may write: at most six reasons from the fixed list. */
export const FeedbackReasonsSchema = z
  .array(FeedbackReasonSchema)
  .max(6)
  .refine((v) => new Set(v).size === v.length, 'reasons must be unique');
