// The handler for a card's "Show all N", a row or a link: open the in-app path the
// server declared as `destination` on the /api/ask answer. None declared (or not an
// in-app path), nothing to open, so no handler.
export function openDestination(
  path: string | undefined,
  push: (path: string) => void,
): (() => void) | undefined {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return undefined;
  return () => push(path);
}
