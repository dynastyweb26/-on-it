// Pure decisions behind two of the confirmations: is there unsent work on the
// template, and what the "shared but not marked sent" banner says. Kept here so
// both are unit-tested (CLAUDE.md rule 6) instead of buried in a component.

/** The slice of a template draft the close guard looks at. */
export type TemplateWork = {
  client_name?: string | null;
  line_items?: Array<{ name?: string | null; unit_price?: number | null }> | null;
};

/**
 * Would closing the template lose something? A client, a named item, or a price
 * counts. An empty builder (or one opened by mistake) closes without asking.
 */
export function templateHasWork(draft: TemplateWork | null | undefined): boolean {
  if (!draft) return false;
  if ((draft.client_name ?? '').trim() !== '') return true;
  return (draft.line_items ?? []).some(
    (l) => (l?.name ?? '').trim() !== '' || Number(l?.unit_price ?? 0) > 0,
  );
}

/**
 * The banner after a share succeeded but POST /send failed: the client has the
 * file, the row is still a draft. `noun` is already the on-screen word
 * ("invoice" / "estimate").
 */
export function unsentShareCopy(noun: string, client?: string | null): { title: string; body: string } {
  const who = (client ?? '').trim() || 'Your client';
  return {
    title: `Your ${noun} went out, but it's still a draft`,
    body: `${who} already has the ${noun} you shared. On It couldn't mark it as sent, so it is still a draft in your list.`,
  };
}
