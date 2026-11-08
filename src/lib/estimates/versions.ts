// Owner estimate versions (4B-lite). Pure: the caller passes the rows it already
// read with the owner's session client (RLS: own rows only) and the business
// timezone. Nothing here touches Supabase or the network.

/** The version chip reads "v2". v1 is the version every client was sent, so it
 *  carries no badge; anything unusable carries none either. */
export function versionChipLabel(version: number | null | undefined): string | null {
  const v = Number(version ?? 0);
  if (!Number.isInteger(v) || v <= 1) return null;
  return `v${v}`;
}
