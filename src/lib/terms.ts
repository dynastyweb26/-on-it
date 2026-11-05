// Terms and conditions: the owner's text lives on profiles.terms and is copied
// onto invoices.terms the moment a document is first sent, so editing Settings
// later never rewrites a document that already went out.
//
// The database migration (20261024100000) may not be applied yet on a shared
// database, so every read here degrades to "no terms" instead of throwing.

export const TERMS_MAX = 3000;

/** Cleaned terms, or null when empty / not a string / over the cap.
 *  Normalizes Unicode NFKC, strips format control characters (\p{Cf}),
 *  normalizes line breaks, and removes control characters before capping length (SECURITY.md layer 6). */
export function cleanTerms(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (!t.length) return null;
  return t.slice(0, TERMS_MAX);
}

/** The invoices UPDATE fragment for a first send: `terms` only when there is
 *  something to snapshot, so an empty profile never touches the column. */
export function termsSnapshot(v: unknown): { terms?: string } {
  const t = cleanTerms(v);
  return t ? { terms: t } : {};
}

type TermsReader = {
  from: (table: 'profiles') => {
    select: (cols: 'terms') => {
      eq: (col: 'id', val: string) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

/** The owner's current terms, read on its own so a missing column (migration
 *  not applied) cannot fail the send. Any error means no terms. */
export async function readProfileTerms(admin: unknown, userId: string): Promise<string | null> {
  try {
    const { data, error } = await (admin as TermsReader)
      .from('profiles')
      .select('terms')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    return cleanTerms((data as { terms?: unknown } | null)?.terms);
  } catch {
    return null;
  }
}
