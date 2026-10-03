'use client';
// Books "Recaps" row (RECAP-SPEC §0b, commits 14b / 14e).
//   • paid: the latest recap as a card (swoosh with a gold ring while
//     unwatched) that plays it, and "See all" → the history list (/recaps);
//     before the first one, a quiet "first recap lands Monday" card;
//   • free / canceled: a locked card that opens the paywall (reports variant);
//   • RECAPS_LIVE off, signed out or still loading: nothing.
// Playing goes through useRecaps().open, which unlocks sound inside this tap.
import { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import PaywallModal from '@/components/PaywallModal';
import RecapMark from '@/components/recap/RecapMark';
import { useRecaps } from '@/components/recap/RecapProvider';
import { money } from '@/components/recap/copy';
import { announces, playable, readyTitle, rowLabel, type RecapRow } from '@/lib/recap/rows';

/** The card's title line: what tapping it does. */
export function rowTitle(r: RecapRow, watched: boolean): string {
  if (playable(r) && !announces(r)) return r.kind === 'week' ? 'Quiet week' : 'Quiet month';
  return watched ? 'Watch again' : readyTitle(r);
}

export default function RecapsCard() {
  const { access, rows, watched, open } = useRecaps();
  const [paywall, setPaywall] = useState(false);
  if (access === 'off' || access === 'loading') return null;

  if (access === 'locked') {
    return (
      <section aria-labelledby="books-recaps" className="space-y-2 pt-1">
        <h2 id="books-recaps" className="px-1 text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Recaps</h2>
        <button
          className="card flex w-full items-center gap-3 text-left transition-transform active:scale-[0.98]"
          onClick={() => setPaywall(true)}
        >
          <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-surface-container">
            <Icon name="lock" size={22} className="text-on-surface-variant" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-on-background">Weekly recaps</span>
            <span className="block text-sm text-on-surface-variant">Your week as a one-minute story, every Monday.</span>
          </span>
          <Icon name="chevron_right" size={22} className="shrink-0 text-on-surface-variant" />
        </button>
        {paywall && <PaywallModal variant="reports" returnTo="books" onClose={() => setPaywall(false)} />}
      </section>
    );
  }

  const latest = rows[0];
  return (
    <section aria-labelledby="books-recaps" className="space-y-2 pt-1">
      <div className="flex items-baseline justify-between px-1">
        <h2 id="books-recaps" className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Recaps</h2>
        {latest && <Link href="/recaps" className="min-h-touch content-center text-sm font-semibold text-primary">See all</Link>}
      </div>
      {latest ? (
        <LatestCard row={latest} watched={!!latest.seen_at || watched.has(latest.id)} onOpen={() => open(latest)} />
      ) : (
        <div className="card flex items-center gap-3">
          <RecapMark ring={false} />
          <span className="text-sm text-on-surface-variant">Your first recap lands Monday morning.</span>
        </div>
      )}
    </section>
  );
}

function LatestCard({ row, watched, onOpen }: { row: RecapRow; watched: boolean; onOpen: () => void }) {
  return (
    <button className="card flex w-full items-center gap-3 text-left transition-transform active:scale-[0.98]" onClick={onOpen}>
      <RecapMark ring={!watched && announces(row)} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{rowLabel(row)}</span>
        <span className="block truncate font-semibold text-on-background">{rowTitle(row, watched)}</span>
        <span className="block text-sm text-on-surface-variant tabular-nums">{money(row.income)} in · {money(row.expenses)} out</span>
      </span>
      <Icon name="play_arrow" size={24} filled className="shrink-0 text-on-surface-variant" />
    </button>
  );
}
