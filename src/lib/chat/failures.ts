// One failed bubble per failed operation. Pure, so the "never stacked twice"
// rule is unit-tested. The bubble's own copy says "Tap send to try again", so a
// repeat tap on the main send button (no retryId) fails again; that failure
// must replace the existing bubble in place, not append a second one.

export type FailureOp = { op: 'send'; text: string } | { op: 'finalize' };

type WithFailure = { id: string; failed?: FailureOp };

function sameOp(a: FailureOp, b: FailureOp): boolean {
  return a.op === b.op && (a.op !== 'send' || (b.op === 'send' && a.text === b.text));
}

/**
 * Add a failed bubble, or refresh the one already standing for the same op
 * (same id and position, new copy). Messages without `failed` are untouched.
 */
export function upsertFailure<M extends WithFailure>(list: readonly M[], msg: M): M[] {
  const f = msg.failed;
  if (!f) return [...list, msg];
  const at = list.findIndex((m) => m.failed && sameOp(m.failed, f));
  if (at < 0) return [...list, msg];
  const next = list.slice();
  next[at] = { ...msg, id: list[at].id };
  return next;
}

/**
 * Drop stale failed bubbles of an op once that op succeeds. `exceptId` is the
 * bubble a retry is about to replace in place; it must survive until then.
 */
export function clearFailures<M extends WithFailure>(
  list: readonly M[],
  op: FailureOp['op'],
  exceptId?: string,
): M[] {
  return list.filter((m) => !(m.failed?.op === op && m.id !== exceptId));
}
