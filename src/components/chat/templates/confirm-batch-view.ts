// Builds the confirm.batch state machine's starting state from the card's props.
// Pure, no JSX, so it is unit-tested; every transition is lib/templates/confirm-batch.ts.
import { beginConfirm, settle, startBatch, type BatchRow, type BatchState } from '@/lib/templates/confirm-batch';
import type { ConfirmBatchProps } from '@/lib/templates/props';

export function rowsFromActions(actions: ConfirmBatchProps['actions']): BatchRow[] {
  // Props carry no kind or id: the index is the id and every row is a record.
  return actions.map((a, i) => ({ id: String(i), kind: 'record', summary: a.summary, amount: a.amount }));
}

/** The machine for a given `state` prop. `loading` has no phase of its own: it starts a pending batch the card does not draw. */
export function batchFromProps(
  state: ConfirmBatchProps['state'],
  failIndex: number | undefined,
  actions: ConfirmBatchProps['actions'],
): BatchState {
  const rows = rowsFromActions(actions);
  const start = startBatch(rows);
  if (state === 'confirming') return beginConfirm(start);
  if (state === 'done') {
    return settle(beginConfirm(start), rows.map((r) => ({ id: r.id, outcome: 'saved' as const })));
  }
  if (state === 'partial') {
    // A partial result with no failIndex fails the last row, so the state still reads as partial.
    const failed = failIndex ?? rows.length - 1;
    return settle(beginConfirm(start), rows.map((r, i) => ({ id: r.id, outcome: i === failed ? ('failed' as const) : ('saved' as const) })));
  }
  return start;
}
