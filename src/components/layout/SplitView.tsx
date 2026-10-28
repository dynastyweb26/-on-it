'use client';
// The laptop master/detail split (design/laptop/MAPPING.md §4, LAPTOP-SPEC
// "split view"): a fixed list pane and a flexible detail pane, each with its own
// scroll, from xl (1280) up. Below xl it renders the list alone — a tap still
// opens the full detail route, exactly as today.
//
// Widths come from the design's measured master column (440 at every xl size;
// its 24 left + 20 right padding leaves the 396px card the design draws), not
// from the content area: this round is viewport-breakpoint driven.
//
// Do NOT wrap this in a container query: a `container-type` element becomes the
// containing block for fixed children, which would break the sheets inside the
// panes (IMPLEMENTATION.md §3).
//
// The bottom inset: the invoice detail's fixed action bars (Record payment,
// Convert to invoice) are portaled to <body> and pinned to the bottom of the
// viewport, spanning the whole content area — so they sit over the bottom of
// BOTH panes. While one is mounted, the panes reserve its height, so the last
// list row and the end of the detail can scroll clear of it. With no bar
// mounted the classes below are byte-identical to before (no inset, no padding).
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export default function SplitView({
  list,
  detail,
  emptyDetail,
  className = '',
}: {
  /** The list pane. Owns its own scroll at xl. */
  list: ReactNode;
  /** The selected record's body, rendered from data already on the page at xl. */
  detail?: ReactNode;
  /** Shown in the detail pane when nothing is selected. */
  emptyDetail?: ReactNode;
  className?: string;
}) {
  const [barH, setBarH] = useState(0);

  useEffect(() => {
    // Only the two action bars are both a DIRECT child of <body> (they portal
    // there) and marked data-kb-hide: the tab bar and the install banner are
    // data-kb-hide too but live inside the shell, and the sheets/modal portal a
    // data-kb-fit layer without that mark.
    const measure = () => {
      let h = 0;
      for (const el of Array.from(document.body.children)) {
        if (!(el instanceof HTMLElement) || !el.hasAttribute('data-kb-hide')) continue;
        if (getComputedStyle(el).position !== 'fixed') continue;
        h = Math.max(h, el.getBoundingClientRect().height);
      }
      setBarH(Math.round(h));
    };
    measure();
    // The bar mounts when a document is selected and unmounts when it isn't.
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(measure) : null;
    mo?.observe(document.body, { childList: true });
    window.addEventListener('resize', measure);
    return () => { mo?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const inset = barH > 0 ? ' xl:pb-[var(--split-bar)]' : '';

  return (
    <div
      data-split-view=""
      className={`xl:grid xl:h-full xl:min-h-0 xl:grid-cols-[440px_minmax(0,1fr)] ${className}`.trim()}
      style={{ '--split-bar': `${barH}px` } as CSSProperties}
    >
      {/* Pane paddings are the design's: 24 top, 24 left, 20 right, and a
          hairline on the seam. The bottom inset is the action bar's height, and
          only while that bar is mounted (see the note above). */}
      <div
        data-split-list=""
        className={`min-w-0 xl:flex xl:min-h-0 xl:flex-col xl:overflow-y-auto xl:border-r xl:border-outline-variant/35 xl:pl-6 xl:pr-5 xl:pt-6${inset}`}
      >
        {list}
      </div>

      {/* Below xl the detail is a route, so this pane stays out of the layout. */}
      <div
        data-split-detail=""
        className={`hidden min-w-0 xl:block xl:min-h-0 xl:overflow-y-auto xl:px-10 xl:pt-6${inset}`}
      >
        <div className="xl:mx-auto xl:w-full xl:max-w-[720px]">{detail ?? emptyDetail}</div>
      </div>
    </div>
  );
}
