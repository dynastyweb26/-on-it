// The Invoices list header for the Open filter. A draft has not been sent, so
// it is not "open money": it never counts toward N or $X (the Books "Still
// owed" invariant). It is named separately so the header never contradicts the
// rows underneath it.

export type OpenRow = { status: string; owed: number };

export function openSummary(rows: readonly OpenRow[], format: (n: number) => string): string {
  const owing = rows.filter((r) => r.status === 'sent' || r.status === 'overdue');
  const drafts = rows.filter((r) => r.status === 'draft').length;
  const total = owing.reduce((s, r) => s + r.owed, 0);
  const draftText = `${drafts} ${drafts === 1 ? 'draft' : 'drafts'}`;
  if (owing.length === 0) return drafts > 0 ? draftText : `0 open · ${format(0)}`;
  const open = `${owing.length} open · ${format(total)}`;
  return drafts > 0 ? `${open} · ${draftText}` : open;
}
