// Pure pieces of slides 07 (bank activity) and 08 (waiting for you), from the
// design's renderVals (RecapPlayer.dc.html): the dot row, the pending list and
// its lines. Counts and names only; nothing here adds money up.

/** The design's dot row: at most 36 dots, the bank's share gold, each popping
 *  1000 ms in plus its place across 1200 ms. */
export function bankDots(total: number, auto: number): { d: number; bank: boolean }[] {
  const N = Math.min(Math.max(0, total), 36);
  const nA = Math.round((auto / Math.max(1, total)) * N);
  return Array.from({ length: N }, (_, i) => ({ d: 1000 + Math.round(i * (1200 / N)), bank: i < nA }));
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 14" from the bank's posted day (yyyy-mm-dd). Formatting only. */
export function pendingDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return m >= 1 && m <= 12 && d ? `${MON[m - 1]} ${d}` : '';
}

/** The design's list: the newest three, each 180 ms after the last from 1100 ms. */
export const pendingRows = (items: { name: string; date: string }[], pending: number) =>
  items.slice(0, Math.min(3, pending)).map((it, i) => ({ name: it.name, date: pendingDate(it.date), d: 1100 + i * 180 }));

export const pendingLine = (n: number) => `${n === 1 ? 'bank transaction' : 'bank transactions'} waiting for you`;

/** "+N more" past the three listed, or null. */
export const pendingMore = (pending: number) => (pending > 3 ? `+${pending - 3} more` : null);

/** "was" / "were" for "N of these … picked up from your bank automatically." */
export const pickedVerb = (n: number) => (n === 1 ? 'was' : 'were');
