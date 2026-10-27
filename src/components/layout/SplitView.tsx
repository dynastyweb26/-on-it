import type { ReactNode } from 'react';

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
  return (
    <div
      data-split-view=""
      className={`xl:grid xl:h-full xl:min-h-0 xl:grid-cols-[440px_minmax(0,1fr)] ${className}`.trim()}
    >
      {/* Pane paddings are the design's: 24 top, 24 left, 20 right, and a
          hairline on the seam. No bottom padding — the pane scrolls. */}
      <div
        data-split-list=""
        className="min-w-0 xl:flex xl:min-h-0 xl:flex-col xl:overflow-y-auto xl:border-r xl:border-outline-variant/35 xl:pl-6 xl:pr-5 xl:pt-6"
      >
        {list}
      </div>

      {/* Below xl the detail is a route, so this pane stays out of the layout. */}
      <div
        data-split-detail=""
        className="hidden min-w-0 xl:block xl:min-h-0 xl:overflow-y-auto xl:px-10 xl:pt-6"
      >
        <div className="xl:mx-auto xl:w-full xl:max-w-[720px]">{detail ?? emptyDetail}</div>
      </div>
    </div>
  );
}
