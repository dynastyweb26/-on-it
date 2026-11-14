// Builds the confirm.batch state machine's starting state from the card's props.
// Pure, no JSX, so it is unit-tested; every transition is lib/templates/confirm-batch.ts.
import { beginConfirm, cancelConfirm, settle, startBatch, type BatchRow, type BatchState } from '@/lib/templates/confirm-batch';
import type { ConfirmBatchProps } from '@/lib/templates/props';
import type { ConfirmBatchResult } from '@/lib/templates/callbacks';

export type RowStatus = 'saved' | 'failed';

export function rowsFromActions(actions: ConfirmBatchProps['actions']): BatchRow[] {
  // Props carry no kind or id: the index is the id and every row is a record.
  return actions.map((a, i) => ({ id: String(i), kind: 'record', summary: a.summary, amount: a.amount }));
}

/**
 * The machine for a given `state` prop. `loading` has no phase of its own: it starts a
 * pending batch the card does not draw. Row statuses are given, never guessed:
 * `statuses[i]` is what the server reported for action i, and a row with none is untouched.
 */
export function batchFromProps(
  state: ConfirmBatchProps['state'],
  statuses: readonly (RowStatus | undefined)[] | undefined,
  actions: ConfirmBatchProps['actions'],
): BatchState {
  const rows = rowsFromActions(actions);
  const start = startBatch(rows);
  if (state === 'confirming') return beginConfirm(start);
  if (state === 'done') {
    return settle(beginConfirm(start), rows.map((r) => ({ id: r.id, outcome: 'saved' as const })));
  }
  if (state === 'partial') {
    const results = rows.flatMap((r, i) => {
      const outcome = statuses?.[i];
      return outcome ? [{ id: r.id, outcome }] : [];
    });
    return settle(beginConfirm(start), results);
  }
  return start;
}

/**
 * The card's state after the host's confirm request ends. A settled answer paints
 * the server's own row statuses; anything else puts the card back where the tap
 * found it. A row the server did not answer for is never marked saved.
 */
export function applyConfirmResult(
  prev: BatchState,
  before: 'pending' | 'partial',
  actions: ConfirmBatchProps['actions'],
  out: ConfirmBatchResult | void,
): BatchState {
  if (!out) return cancelConfirm(prev, before);
  if (out.kind === 'error') {
    if (!out.done) return cancelConfirm(prev, before);
    // The server said it is already done: that is its statement, not a guess.
    return settle(prev, prev.attempting.map((id) => ({ id, outcome: 'saved' as const })));
  }
  const results = out.rows.flatMap((r) => {
    const i = actions.findIndex((a) => a.id === r.actionId);
    return i < 0 ? [] : [{ id: String(i), outcome: r.outcome }];
  });
  if (prev.attempting.some((id) => !results.some((r) => r.id === id))) return cancelConfirm(prev, before);
  return settle(prev, results);
}

/** The server's sentence for each refused row, keyed by the card's row id. */
export function problemsOf(actions: ConfirmBatchProps['actions'], out: ConfirmBatchResult | void): Record<string, string> {
  if (!out || out.kind !== 'settled') return {};
  const found: Record<string, string> = {};
  for (const r of out.rows) {
    const i = actions.findIndex((a) => a.id === r.actionId);
    if (i >= 0 && r.outcome === 'failed' && r.problem) found[String(i)] = r.problem;
  }
  return found;
}

/**
 * The partial card's strip. The design's line names a dropped connection; the real
 * cause is the server's own sentence, so it replaces that clause when there is one.
 */
export function partialLine(summary: string, problem: string | undefined, othersSaved: boolean): string {
  const others = othersSaved ? ' The others are saved.' : '';
  return `"${summary}" didn't save. ${problem ?? 'The connection dropped.'}${others}`;
}

export type ConfirmView = 'live' | 'done' | 'expired' | 'cancelled';

/**
 * Which face a confirm card wears. A card is live only while its token is still in
 * memory (this session, this page); a reopened chat has none, so it shows done when
 * the server settled it, and expired otherwise. Never a confirm button without a token.
 */
export function confirmViewFor(m: { confirmToken?: string; confirmed?: 'done'; cancelled?: true }): ConfirmView {
  if (m.confirmed === 'done') return 'done';
  if (m.cancelled) return 'cancelled'; // never Confirm again, in this session or after a restore
  return m.confirmToken ? 'live' : 'expired';
}
