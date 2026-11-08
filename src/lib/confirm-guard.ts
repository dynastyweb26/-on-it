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
