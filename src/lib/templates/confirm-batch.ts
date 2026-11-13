// ═══ confirm.batch · the state machine behind the card ═══
//
// RULES.md §6, item 6. A batch holds RECORDS only (payments, expenses, edits).
// A reminder inside a multi-step request is a row that drafts a message: it
// saves no record, and after Confirm the draft follows for the user to send.
//
// Undo all reverses the records that were saved and discards the unsent draft.
// It never claims to unsend a message — the app cannot know a text or an email
// left the phone, and `unsend: 'never'` says so in the type, not just the copy.
//
// Pure: no timers, no network. The component runs the confirm request and feeds
// the outcomes back; every headline and label the design computes follows from
// this state.

export type BatchRowKind = 'record' | 'draft';

export type BatchRow = {
  /** Stable id from the proposal the server recorded. */
  id: string;
  kind: BatchRowKind;
  /** The one-line description the card shows. */
  summary: string;
  /** A finished money string, or '' when the row moves no money. */
  amount: string;
};

export type BatchPhase = 'pending' | 'confirming' | 'done' | 'partial';

export type RowOutcome = 'saved' | 'failed';
export type RowStatus = 'pending' | RowOutcome;

export type BatchState = {
  phase: BatchPhase;
  rows: readonly BatchRow[];
  /** Only rows the server has answered for. A row with no entry is untouched. */
  outcomes: Readonly<Record<string, RowOutcome>>;
  /** Rows in flight. Empty except while confirming. */
  attempting: readonly string[];
  /** Reminder rows that produced a draft.message card, in row order. */
  draftRowIds: readonly string[];
};

export const MIN_ROWS = 2;
export const MAX_ROWS = 4;

/** A batch is 2 to 4 rows (RULES §2), with unique ids. */
export function startBatch(rows: readonly BatchRow[]): BatchState {
  if (rows.length < MIN_ROWS || rows.length > MAX_ROWS) {
    throw new Error(`confirm.batch holds ${MIN_ROWS}-${MAX_ROWS} rows, got ${rows.length}`);
  }
  const ids = new Set(rows.map((r) => r.id));
  if (ids.size !== rows.length) throw new Error('confirm.batch rows need unique ids');
  return { phase: 'pending', rows: [...rows], outcomes: {}, attempting: [], draftRowIds: [] };
}

/** Confirm all (or retry the failed ones): the rows the server is about to run. */
export function beginConfirm(state: BatchState): BatchState {
  if (state.phase !== 'pending' && state.phase !== 'partial') {
    throw new Error(`cannot confirm a batch in phase ${state.phase}`);
  }
  const attempting =
    state.phase === 'pending'
      ? state.rows.map((r) => r.id)
      : state.rows.filter((r) => state.outcomes[r.id] === 'failed').map((r) => r.id);
  if (attempting.length === 0) return state;
  return { ...state, phase: 'confirming', attempting };
}

/**
 * The server answered. Every answered row gets an outcome; a failed row stays in
 * the list for a retry, and a saved reminder produces a draft — exactly one per
 * reminder, never a record.
 */
export function settle(
  state: BatchState,
  results: readonly { id: string; outcome: RowOutcome }[],
): BatchState {
  if (state.phase !== 'confirming') throw new Error(`cannot settle a batch in phase ${state.phase}`);
  const outcomes: Record<string, RowOutcome> = { ...state.outcomes };
  for (const r of results) {
    if (!state.rows.some((row) => row.id === r.id)) continue;
    outcomes[r.id] = r.outcome;
  }
  const anyFailed = state.rows.some((row) => outcomes[row.id] === 'failed');
  const drafts = state.rows
    .filter((row) => row.kind === 'draft' && outcomes[row.id] === 'saved')
    .map((row) => row.id);
  return {
    ...state,
    phase: anyFailed ? 'partial' : 'done',
    outcomes,
    attempting: [],
    draftRowIds: drafts,
  };
}

/** Take one row out before confirming. Not offered once anything is in flight. */
export function removeRow(state: BatchState, id: string): BatchState {
  if (state.phase !== 'pending') throw new Error(`cannot remove a row in phase ${state.phase}`);
  const rows = state.rows.filter((row) => row.id !== id);
  const outcomes = { ...state.outcomes };
  delete outcomes[id];
  return { ...state, rows, outcomes };
}

export type UndoResult = {
  state: BatchState;
  /** Record ids whose saved write must be reversed, newest first. */
  reverse: readonly string[];
  /** True when an unsent draft card was on screen and is discarded. */
  discardDraft: boolean;
  /** The app never reports a sent message as unsent. Fixed by design. */
  unsend: 'never';
};

/**
 * Undo all: reverse saved records, discard the draft, and leave the batch empty
 * and pending. A saved reminder's draft was never sent, so discarding it is all
 * that happens; nothing about a message is claimed.
 */
export function undoAll(state: BatchState): UndoResult {
  const reverse = state.rows
    .filter((row) => row.kind === 'record' && state.outcomes[row.id] === 'saved')
    .map((row) => row.id)
    .reverse();
  return {
    state: {
      phase: 'pending',
      rows: state.rows,
      outcomes: {},
      attempting: [],
      draftRowIds: [],
    },
    reverse,
    discardDraft: state.draftRowIds.length > 0,
    unsend: 'never',
  };
}

/** What the design's footer renders. No copy beyond counted words. */
export function batchHeadline(state: BatchState): { head: string; sub: string } {
  const n = state.rows.length;
  const word = n === 1 ? 'change' : 'changes';
  switch (state.phase) {
    case 'pending':
      return { head: `Confirm ${n} ${word}?`, sub: "Nothing's saved until you confirm." };
    case 'confirming':
      return { head: `Saving ${n} ${word}…`, sub: 'Keep the app open.' };
    case 'done':
      return { head: `All ${n} saved.`, sub: 'Your books are up to date.' };
    case 'partial': {
      const saved = state.rows.filter((r) => state.outcomes[r.id] === 'saved').length;
      return { head: `${saved} saved, ${n - saved} didn't.`, sub: 'Retry the one that failed.' };
    }
  }
}

/**
 * The per-row status the card renders. A row with no server answer yet is
 * pending; once answered it is saved or failed. The component never derives
 * this from an index or from the phase.
 */
export function rowStatus(state: BatchState, id: string): RowStatus {
  return state.outcomes[id] ?? 'pending';
}

/** Every row's status, keyed by the action's stable id. */
export function rowStatuses(state: BatchState): Record<string, RowStatus> {
  return Object.fromEntries(state.rows.map((row) => [row.id, rowStatus(state, row.id)]));
}

/** Props-ready action rows: the server's status travels with each row. */
export function batchRows(state: BatchState): Array<BatchRow & { status: RowStatus }> {
  return state.rows.map((row) => ({ ...row, status: rowStatus(state, row.id) }));
}

/** How many rows a retry would run, for the design's "Retry 1" label. */
export function failedCount(state: BatchState): number {
  return state.rows.filter((row) => state.outcomes[row.id] === 'failed').length;
}
