// ═══ The review state machine, server-side ═══
// What a decision is allowed to do to a row, as a pure table the route asks
// before it writes anything. Exhaustively tested: every action × every state.
//
//   ignore   new | needs_review            → ignored   (restorable)
//   restore  ignored                       → new
//   already  new | needs_review | ignored  → already
//   add      any open row, unless removed  → added     (decided rows replay)
//
// A row that already holds an expense (added / already) refuses every decision
// but the idempotent add replay, and a charge the bank pulled can never become
// an expense. Both answer 409, never a silent write.

export const REVIEW_ACTIONS = ['add', 'already', 'ignore', 'restore'] as const;
export type ReviewActionName = (typeof REVIEW_ACTIONS)[number];

/** The states a non-add decision may start from. */
export const ALLOWED_FROM: Record<Exclude<ReviewActionName, 'add'>, readonly string[]> = {
  already: ['new', 'needs_review', 'ignored'],
  ignore: ['new', 'needs_review'],
  restore: ['ignored'],
};

/** Where each decision lands. */
export const NEXT_STATE = {
  add: 'added',
  already: 'already',
  ignore: 'ignored',
  restore: 'new',
} as const;

export type Transition =
  | { kind: 'ok'; next: (typeof NEXT_STATE)[ReviewActionName] }
  /** The row already counts through an expense: answer it, write nothing. */
  | { kind: 'replay' }
  | { kind: 'bad_state' };

export type ReviewTransitionInput = {
  action: ReviewActionName;
  reviewState: string;
  bankState?: string | null;
  removedAt?: string | null;
  expenseId?: string | null;
};

export function transition(input: ReviewTransitionInput): Transition {
  const { action, reviewState } = input;
  const removed = input.bankState === 'removed' || Boolean(input.removedAt);

  if (action === 'add') {
    // A charge the bank pulled can never become (or stay) an expense.
    if (removed) return { kind: 'bad_state' };
    if (reviewState === 'added' || reviewState === 'already') {
      // Decided: the second tap answers the expense it already made.
      return input.expenseId ? { kind: 'replay' } : { kind: 'bad_state' };
    }
    return { kind: 'ok', next: NEXT_STATE.add };
  }

  // Only an undecided row can be linked or passed on.
  if (input.expenseId) return { kind: 'bad_state' };
  if (!ALLOWED_FROM[action].includes(reviewState)) return { kind: 'bad_state' };
  return { kind: 'ok', next: NEXT_STATE[action] };
}
