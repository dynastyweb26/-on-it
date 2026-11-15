// ═══ AI Smart · why did a turn run no tool? ═══
//
// When a turn ends without a tool run the user sees prose instead of an answer,
// and the server log showed only the model calls — the blind spot behind the
// "one call, 18 tokens, no tool" report. This composes ONE line to log on a
// preview: the stop reason and the model's own prose, cut to 200 characters.
//
// It carries no user text, and it never changes what the user hears.
import type { TurnResult } from './turn';

/** How many characters of the model's own prose a log line may carry. */
export const PROSE_LOG_MAX = 200;

export type NoToolLog = {
  /** Why the turn stopped without a tool. */
  reason: 'budget_exhausted' | 'model_said_nothing' | 'model_no_tool';
  /** The model's own words, cut to PROSE_LOG_MAX. Never the user's. */
  prose: string;
  /** Model calls this turn spent. */
  calls: number;
};

/**
 * The line to log, or null when a tool ran (or was proposed): those turns are
 * already visible in the reply and the tool log.
 */
export function noToolLog(
  result: Pick<TurnResult, 'toolRuns' | 'budgetExhausted' | 'calls' | 'replyText'>,
): NoToolLog | null {
  if (result.toolRuns.length > 0) return null;
  const prose = result.replyText.trim().slice(0, PROSE_LOG_MAX);
  return {
    reason: result.budgetExhausted
      ? 'budget_exhausted'
      : prose
        ? 'model_no_tool'
        : 'model_said_nothing',
    prose,
    calls: result.calls,
  };
}
