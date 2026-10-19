// ═══ Continuation-page geometry (page 2+ of a multi-page PDF) ═══
// generate.ts rebuilds every continuation page by hand: a short running header,
// the remaining table rows, then this page's trailing blocks. Those rebuilt
// pages must sit in page 1's text column and paint page 1's canvas, or page 2
// reads as a different document. That geometry is kept here, pure and DOM-free,
// so it can be unit-tested in Node (generate.ts passes the real measurements in).
//
// Deliberately dependency-free apart from hexToRgb, like attachment-pages.ts.

import { hexToRgb } from '@/lib/pdf/attachment-pages';

/** The A4 page box every template renders at (794 × 1123 px @ 96 dpi). */
export const PAGE_W = 794;

export interface PageInset { top: number; right: number; bottom: number; left: number }

/** The only thing we read off a DOM node: its parent (or null). */
export interface BoxLike { parentElement: BoxLike | null }

/** The table's real inset from the page edge: the padding AND border of every
 *  ancestor between the table's parent and the page root add up.
 *  - Classic   pads the page root itself            → 56
 *  - Industrial pads a body wrapper, not the root    → 56 (36 top/bottom)
 *  - Ledger    pads the page root, columns unpadded  → 64
 *  - Friendly  wraps the table in a padded, bordered
 *              card inside the padded root           → 48 + 12 + 1.5 = 61.5
 *  Continuation pages pad by this so their rebuilt table is exactly as wide as
 *  page 1's (Ledger excepted by decision: its page-1 table is narrowed by the
 *  payment rail, but page 2+ deliberately uses the full content width). */
export function contentInset(
  table: BoxLike | null,
  root: BoxLike,
  boxOf: (node: BoxLike) => PageInset,
): PageInset {
  const inset: PageInset = { top: 0, right: 0, bottom: 0, left: 0 };
  for (let node: BoxLike | null = table?.parentElement ?? root; node; node = node.parentElement) {
    const box = boxOf(node);
    inset.top += box.top;
    inset.right += box.right;
    inset.bottom += box.bottom;
    inset.left += box.left;
    if (node === root) break;
  }
  return inset;
}

export interface ContinuationStyle {
  /** Padding for the continuation page box — page 1's real content inset. */
  padding: string;
  /** Width for the rebuilt table — page 1's table width. */
  tableWidth: number;
  /** Canvas colour — page 1's. */
  background: string;
}

/** Everything a continuation page inherits from page 1's geometry. */
export function continuationStyle(page1: { background: string; inset: PageInset }): ContinuationStyle {
  const { top, right, bottom, left } = page1.inset;
  return {
    padding: `${top}px ${right}px ${bottom}px ${left}px`,
    tableWidth: PAGE_W - left - right,
    background: page1.background,
  };
}
