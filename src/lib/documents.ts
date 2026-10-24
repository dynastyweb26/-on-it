// One place for how a document (invoice or estimate) is named and numbered, so the
// list, detail page, PDF templates, filename, and share sheet can never drift
// apart. `kind` is the invoices.kind column ('invoice' | 'quote').

export type DocumentKind = 'invoice' | 'quote';

const asKind = (k: string | null | undefined): DocumentKind => (k === 'quote' ? 'quote' : 'invoice');

/** Title-case noun: "Estimate" / "Invoice". `quote` is the stored value. */
export function docNoun(kind: string | null | undefined): string {
  return asKind(kind) === 'quote' ? 'Estimate' : 'Invoice';
}

/** Number prefix: estimates get 'E-', invoices keep 'INV-'. No "Q-" is
 *  ever shown to anyone (ESTIMATES-DESIGN-SPEC §5). */
export function docPrefix(kind: string | null | undefined): string {
  return asKind(kind) === 'quote' ? 'E' : 'INV';
}

/** Full document number, zero-padded: "E-0003" / "INV-0007". */
export function formatDocNumber(kind: string | null | undefined, n: number): string {
  return `${docPrefix(kind)}-${String(n).padStart(4, '0')}`;
}
