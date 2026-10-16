// "What you've built" panel (CANCEL-FLOW-SPEC.md §2, D5) — the rules that
// turn raw lifetime numbers into tiles. Pure: the cancel-summary endpoint
// feeds it the counts, the tests pin the thresholds.

export type StatTileKey = 'sent' | 'collected' | 'daysToPaid' | 'clients';
export type StatTile = { key: StatTileKey; value: number };

export type RawStats = {
  invoicesSent: number;       // kind='invoice', first_sent_at set, not deleted
  collected: number;          // invoice_payments sum (the Books ledger query)
  daysToPaid: number[];       // per fully paid invoice: paid_at - first_sent_at, days
  clientsSaved: number;       // saved, not deleted
};

/** Below this many sent invoices the panel is hidden and the offer leads (D5). */
export const MIN_SENT_FOR_PANEL = 3;
/** The average-days tile needs at least this many paid invoices. */
export const MIN_PAID_FOR_AVERAGE = 3;
/** Fewer surviving tiles than this hides the panel. */
export const MIN_TILES = 2;

/** Mean days to get paid, 1 decimal, or null when there aren't enough
 *  paid invoices. Negative spans (paid before first sent) are ignored. */
export function averageDaysToPaid(days: number[]): number | null {
  const valid = days.filter((d) => Number.isFinite(d) && d >= 0);
  if (valid.length < MIN_PAID_FOR_AVERAGE) return null;
  return Math.round((valid.reduce((s, d) => s + d, 0) / valid.length) * 10) / 10;
}

/** The tiles to show, in order, or [] to hide the panel. A tile with 0 or
 *  no data is dropped, never shown as "0". */
export function statTiles(raw: RawStats): StatTile[] {
  if (raw.invoicesSent < MIN_SENT_FOR_PANEL) return [];
  const avg = averageDaysToPaid(raw.daysToPaid);
  const all: StatTile[] = [
    { key: 'sent', value: raw.invoicesSent },
    { key: 'collected', value: Math.round(raw.collected * 100) / 100 },
    ...(avg !== null ? [{ key: 'daysToPaid' as const, value: avg }] : []),
    { key: 'clients', value: raw.clientsSaved },
  ];
  const tiles = all.filter((t) => t.value > 0);
  return tiles.length >= MIN_TILES ? tiles : [];
}

export const DAY_MS = 24 * 60 * 60 * 1000;
