// ═══ Books alerts: money the owner hasn't decided about ═══
// Spent and Collected say when bank items are waiting in To review, and the
// Books tab badge carries the total. Counts come from To review only — Ignored
// is a decision, so it never appears here (CHANGES.md · item 2).
//
// Colour rule: #c8412e is the alert red (badge, ring); #a3341f is the only red
// that may carry small text. The row border is #efc9c1, never a fill.
export const ALERT_RED = '#c8412e';
export const ALERT_INK = '#a3341f';
export const ALERT_BORDER = '#efc9c1';

export const depositCue = (count: number): string =>
  `${count} ${count === 1 ? 'deposit' : 'deposits'} to review`;

export const chargeCue = (count: number): string =>
  `${count} ${count === 1 ? 'charge' : 'charges'} to review`;

/** "Collected, $998.00. 3 bank deposits to review. Open Income." */
export function collectedAria(money: string, count: number): string {
  const base = `Collected, ${money}.`;
  return count > 0 ? `${base} ${count} bank deposits to review. Open Income.` : `${base} Open Income.`;
}

/** "Spent, $807.41. 1 bank charge to review. Open Expenses." */
export function spentAria(money: string, count: number): string {
  const base = `Spent, ${money}.`;
  return count > 0 ? `${base} ${count} bank ${count === 1 ? 'charge' : 'charges'} to review. Open Expenses.` : `${base} Open Expenses.`;
}

/** What the Books tab badge shows: expenses + deposits waiting, at 0 hidden. */
export const booksBadgeTotal = (spent: number, deposits: number): number =>
  Math.max(0, spent) + Math.max(0, deposits);
