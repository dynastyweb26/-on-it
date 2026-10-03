'use client';
// Books "Recaps" row (release frames 5a; RECAP-SPEC §0b, commits 14b / 14e):
// one 50 px row at the top of Books, with the red unread dot that matches the
// Books tab dot (it pulses once).
//   • RECAPS_LIVE off: "Coming soon" (not tappable);
//   • free / canceled: "Unlock" → the paywall (reports variant);
//   • paid, before the first recap: "Lands Monday" (not tappable);
//   • paid with recaps: the row plays the latest one (sound unlocks inside this
//     tap, via useRecaps().open), its title says what that does, and the
//     chevron opens the history list (/recaps).
//   • signed out or still loading: nothing.
import { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import PaywallModal from '@/components/PaywallModal';
import { useRecaps } from '@/components/recap/RecapProvider';
import { announces, playable, readyTitle, type RecapRow } from '@/lib/recap/rows';

/** The row's status line: what tapping it does. */
export function rowTitle(r: RecapRow, watched: boolean): string {
  if (playable(r) && !announces(r)) return r.kind === 'week' ? 'Quiet week' : 'Quiet month';
  return watched ? 'Watch again' : readyTitle(r);
}

const ROW = 'flex h-[50px] w-full items-center gap-2.5 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest px-3.5 text-left';

function Lead({ dot }: { dot: boolean }) {
  return (
    <>
      <Icon name="auto_awesome" size={21} className="shrink-0 text-primary" />
      <span className="text-base font-semibold text-on-background">Recaps</span>
      {dot && (
        <>
          <span aria-hidden className="onit-dot-pulse relative h-2 w-2 shrink-0 rounded-full bg-[#c8452c]" />
          <span className="sr-only">, new recap</span>
        </>
      )}
    </>
  );
}

export default function RecapsCard() {
  const { access, rows, watched, open, unwatched } = useRecaps();
  const [paywall, setPaywall] = useState(false);
  if (access === 'loading') return null;

  if (access === 'off') {
    return (
      <div className={ROW} aria-label="Recaps, coming soon">
        <Lead dot={false} />
        <span className="flex-1" />
        <span className="text-[13px] font-medium text-on-surface-variant">Coming soon</span>
      </div>
    );
  }

  if (access === 'locked') {
    return (
      <>
        <button className={`${ROW} transition-transform active:scale-[0.98]`} onClick={() => setPaywall(true)}
          aria-label="Recaps: your week as a one-minute story, every Monday. Unlock">
          <Lead dot={false} />
          <span className="flex-1" />
          <Icon name="lock" size={16} className="text-on-surface-variant" />
          <span className="text-[13px] font-medium text-on-surface-variant">Unlock</span>
          <Icon name="chevron_right" size={20} className="text-outline" />
        </button>
        {paywall && <PaywallModal variant="reports" returnTo="books" onClose={() => setPaywall(false)} />}
      </>
    );
  }

  const latest = rows[0];
  if (!latest) {
    return (
      <div className={ROW}>
        <Lead dot={false} />
        <span className="flex-1" />
        <span className="text-[13px] font-medium text-on-surface-variant">First one lands Monday</span>
      </div>
    );
  }
  const seen = !!latest.seen_at || watched.has(latest.id);
  return (
    <div className={`${ROW} pr-1`}>
      <button className="flex min-w-0 flex-1 items-center gap-2.5 self-stretch text-left active:opacity-70" onClick={() => open(latest)}>
        <Lead dot={unwatched} />
        <span className="min-w-0 flex-1 truncate text-right text-[13px] font-medium text-on-surface-variant">{rowTitle(latest, seen)}</span>
        <Icon name="play_arrow" size={20} filled className="shrink-0 text-on-surface-variant" />
      </button>
      <Link href="/recaps" aria-label="All recaps" className="grid h-11 w-9 shrink-0 place-items-center text-outline">
        <Icon name="chevron_right" size={20} />
      </Link>
    </div>
  );
}
