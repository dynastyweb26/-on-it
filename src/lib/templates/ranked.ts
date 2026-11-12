// ═══ list.ranked · the cap, the count and the destination ═══
//
// RULES.md §6, item 5: at most 5 rows, the rest behind "Show all N", and the
// "Show all" tap opens the matching app screen. The screen is not guessed here:
// it is declared with the tool (`destination` on its definition), so every tool
// that uses list.ranked says where its full list lives.
import type { RankedListProps } from './props';

export const RANKED_ROW_CAP = 5;

export type RankedDestination = {
  /** What the screen is, for the card's accessibility label. */
  screen: string;
  /** An in-app path. Never an external URL. */
  path: string;
};

export type RankedSource = {
  eyebrow: string;
  title: string;
  rows: readonly RankedListProps['rows'][number][];
  /** How many rows exist in total, not how many are shown. */
  totalCount: number;
  /** The server-composed total line (money is already a finished string). */
  total: RankedListProps['total'];
  destination: RankedDestination;
};

export type RankedView = {
  props: RankedListProps;
  /** Rows beyond the cap exist, so the "Show all N" link shows. */
  hasMore: boolean;
  /** The design's exact label, e.g. "Show all 18"; null when everything fits. */
  moreLabel: string | null;
  destination: RankedDestination | null;
};

/**
 * Shape one list.rows card: the first five rows, and a link only when the full
 * list is longer. A total smaller than the rows is a caller bug, not something
 * to paper over, so it is refused.
 */
export function rankedView(source: RankedSource): RankedView {
  if (source.totalCount < source.rows.length) {
    throw new Error(
      `list.ranked totalCount ${source.totalCount} is smaller than ${source.rows.length} rows`,
    );
  }
  const hasMore = source.totalCount > RANKED_ROW_CAP;
  return {
    props: {
      state: 'filled',
      eyebrow: source.eyebrow,
      title: source.title,
      totalCount: source.totalCount,
      rows: source.rows.slice(0, RANKED_ROW_CAP),
      total: source.total,
      hideTotal: false,
    },
    hasMore,
    moreLabel: hasMore ? `Show all ${source.totalCount}` : null,
    destination: hasMore ? source.destination : null,
  };
}
