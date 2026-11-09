// Pure rules for the owner's edit-in-place screen (alive layer 06). The screen
// only draws what these decide.

type Item = { description?: string | null; qty?: number | string | null; unit_price?: number | string | null; unit?: string | null; detail?: string | null };

/** How many things changed: the title (1) and every line that differs, was
 *  added or was removed. Drives "1 change" / "3 changes" in the save bar. */
export function changeCount(saved: Item[], draft: Item[], titleChanged: boolean): number {
  let n = titleChanged ? 1 : 0;
  const len = Math.max(saved.length, draft.length);
  for (let i = 0; i < len; i++) {
    if (JSON.stringify(saved[i] ?? null) !== JSON.stringify(draft[i] ?? null)) n++;
  }
  return n;
}

export function changeLabel(n: number): string {
  return `${n} ${n === 1 ? 'change' : 'changes'}`;
}

/** The version badge. A draft has none (drafts don't version). While there are
 *  unsaved edits the badge shows the version they will become. */
export function badgeVersion(sent: boolean, version: number, dirty: boolean): number | null {
  if (!sent) return null;
  const v = Number.isFinite(version) && version >= 1 ? Math.floor(version) : 1;
  return dirty ? v + 1 : v;
}

/** "Editing v2 · v1 sent Nov 7" while dirty. Null when there is nothing to say. */
export function editingLine(version: number, dirty: boolean, sentOn: string | null): string | null {
  if (!dirty) return null;
  const v = Number.isFinite(version) && version >= 1 ? Math.floor(version) : 1;
  return sentOn ? `Editing v${v + 1} · v${v} sent ${sentOn}` : `Editing v${v + 1}`;
}

/** The note under Copy link / Share. No pronouns: the app doesn't know how a
 *  client is addressed. */
export function sameLinkNote(clientFirst: string | null): { lead: string; rest: string } {
  const who = clientFirst?.trim() || 'Your client';
  return { lead: 'Same link, updated.', rest: `${who} sees the new version the next time they open it. No new estimate, no duplicate.` };
}

/** The line after a save. */
export function savedLine(version: number, clientFirst: string | null): string {
  const who = clientFirst?.trim();
  return who ? `Saved as v${version}. Same link. Want me to let ${who} know?` : `Saved as v${version}. Same link.`;
}
