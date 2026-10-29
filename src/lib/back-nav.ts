// Where "Back" goes.
//
// Inside the app, the previous history entry is the screen the reader came from,
// and it is the one that still carries the state they left (the invoice list on
// Estimates, its `?filter=`, and therefore its saved scroll bucket). Pushing the
// parent route instead mints a NEW entry with the query dropped — that is why
// coming back from an estimate reset the list to Invoices and to the top.
//
// A cold start (a deep link, a fresh tab) has nothing to return to, so the parent
// route is the fallback.
export function goBackOr(fallback: () => void, historyLength: number, back: () => void): void {
  if (historyLength > 1) back();
  else fallback();
}
