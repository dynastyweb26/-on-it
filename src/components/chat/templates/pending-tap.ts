// The pending/repeat-tap rule for a tap that cannot finish instantly, as a pure
// function so it is unit-tested: pending is set synchronously on the first tap, a
// repeat tap while it runs does nothing, and pending clears on every exit (resolve,
// reject or a synchronous throw).
export function guardedTap(
  fn: () => unknown,
  setPending: (pending: boolean) => void,
): () => void {
  let busy = false; // synchronous guard, not React state
  return () => {
    if (busy) return;
    busy = true;
    setPending(true);
    let out: unknown;
    try {
      out = fn();
    } catch {
      out = undefined;
    }
    void Promise.resolve(out)
      .catch(() => {})
      .finally(() => {
        busy = false;
        setPending(false);
      });
  };
}
