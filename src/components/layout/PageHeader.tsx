import type { ReactNode } from 'react';
import BackButton from '@/components/BackButton';

// The laptop page header (design/laptop/MAPPING.md §2): ONE 40px row of
// [back] [title] [slot: tabs + search] ......... [actions] at xl (>= 1280).
//
// Presentation only: nothing below xl changes. Each screen passes its current
// header markup as `legacy`, which renders exactly as it does today under 1280
// (phones and iPad), and is hidden at xl in favour of the single row. Screens
// that only ever had a title (no tabs, no actions) can pass `legacy` too, so no
// screen loses its phone header.
export default function PageHeader({
  title,
  back,
  slot,
  actions,
  legacy,
  className = '',
}: {
  /** Screen title — the same string the screen renders today. */
  title: string;
  /** Nested pages only: the back arrow, 40px ghost box (-ml-2 per the design). */
  back?: { href: string; label?: string };
  /** Middle slot: PillTabs, search field, or a segmented control. */
  slot?: ReactNode;
  /** Right cluster (`ml-auto`, gap 10). */
  actions?: ReactNode;
  /** The screen's existing header, rendered unchanged below xl. */
  legacy?: ReactNode;
  className?: string;
}) {
  return (
    <>
      {legacy ? <div className="xl:hidden">{legacy}</div> : null}
      <div
        data-page-header=""
        className={`hidden xl:mb-4 xl:flex xl:h-10 xl:min-w-0 xl:items-center xl:gap-4 ${className}`.trim()}
      >
        {back ? (
          <div className="-ml-2 shrink-0">
            <BackButton parentHref={back.href} label={back.label} className="!h-10 !w-10" />
          </div>
        ) : null}
        <h1 className="shrink-0 whitespace-nowrap font-display text-2xl font-bold leading-none text-on-background">
          {title}
        </h1>
        {slot ? <div className="flex min-w-0 items-center gap-4">{slot}</div> : null}
        {actions ? <div className="ml-auto flex shrink-0 items-center gap-2.5">{actions}</div> : null}
      </div>
    </>
  );
}
