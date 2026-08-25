// One place for how a document (invoice or quote) is named and numbered, so the
// list, detail page, PDF templates, filename, and share sheet can never drift
// apart. `kind` is the invoices.kind column ('invoice' | 'quote').

export type DocumentKind = 'invoice' | 'quote';

const asKind = (k: string | null | undefined): DocumentKind => (k === 'quote' ? 'quote' : 'invoice');

/** Title-case noun: "Quote" / "Invoice". */
export function docNoun(kind: string | null | undefined): string {
  return asKind(kind) === 'quote' ? 'Quote' : 'Invoice';
}

/** Number prefix: quotes get 'Q-' (locked spec), invoices keep 'INV-'. */
export function docPrefix(kind: string | null | undefined): string {
  return asKind(kind) === 'quote' ? 'Q' : 'INV';
}

/** Full document number, zero-padded: "Q-0003" / "INV-0007". */
export function formatDocNumber(kind: string | null | undefined, n: number): string {
  return `${docPrefix(kind)}-${String(n).padStart(4, '0')}`;
}
