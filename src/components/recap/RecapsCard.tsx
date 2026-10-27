'use client';
// Books "Recaps" row (release frames 5a; RECAP-SPEC §0b, commits 14b / 14e):
// one 50 px row, with the red unread dot that matches the Books tab dot (it
// pulses once). Below xl that row is unchanged.
//   • RECAPS_LIVE off: "Coming soon" (not tappable);
//   • free / canceled: "Unlock" → the paywall (reports variant);
//   • paid, before the first recap: "Lands Monday" (not tappable);
//   • paid with recaps: the row plays the latest one (sound unlocks inside this
//     tap, via useRecaps().open), its title says what that does, and the
//     chevron opens the history list (/recaps).
//   • signed out or still loading: nothing.
//
// Laptop (design/laptop tutorial + MAPPING §12b): the row becomes the tall card
// the design draws in the right column, beside View expenses + Recurring —
// sparkle + "Recaps" header with the chevron, and the "Watch again" pill under
// it. Same actions: the header taps through to the recap, the chevron opens the
// history, the pill plays. Only the structure changes, and only from xl: the
// width is resolved on the client (after mount) because the two arrangements are
// different DOM, and the card renders nothing until access resolves, so the
// server HTML is never mismatched.
import { useEffect, useState } from 'react';
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

// The design's laptop card: 18px padding, 20px radius, a header row and the
// action pill under it, stretched to the height of the card beside it.
const CARD = 'flex h-full w-full flex-col items-stretch gap-3.5 rounded-card border-[1.5px] border-outline-variant/70 bg-surface-container-lowest p-[18px] text-left';
const CARD_HEAD = 'flex items-center gap-2.5';
const CARD_PILL = 'inline-flex h-9 w-fit items-center gap-1 rounded-full bg-surface-container pl-2.5 pr-3.5 text-sm font-semibold leading-none text-on-background transition-transform active:scale-[0.98]';

function Lead({ dot, wide = false }: { dot: boolean; wide?: boolean }) {
  return (
    <>
      <Icon name="auto_awesome" size={wide ? 24 : 21} className="shrink-0 text-primary" />
      <span className={`${wide ? 'text-[17px] leading-none' : 'text-base'} font-semibold text-on-background`}>Recaps</span>
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
  // xl only (the design's laptop breakpoint). Read after mount: the phone row
  // renders first, so the effect is the earliest safe point to swap structure.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  if (access === 'loading') return null;

  if (access === 'off') {
    return wide ? (
      <div className={CARD} aria-label="Recaps, coming soon">
        <div className={CARD_HEAD}><Lead dot={false} wide /><span className="flex-1" /></div>
        <span className="text-[13px] font-medium text-on-surface-variant">Coming soon</span>
      </div>
    ) : (
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
        {wide ? (
          <div className={CARD}>
            <div className={CARD_HEAD}><Lead dot={false} wide /><span className="flex-1" /></div>
            <button className={CARD_PILL} onClick={() => setPaywall(true)}
              aria-label="Recaps: your week as a one-minute story, every Monday. Unlock">
              <Icon name="lock" size={16} className="shrink-0 text-on-surface-variant" /> Unlock
            </button>
          </div>
        ) : (
          <button className={`${ROW} transition-transform active:scale-[0.98]`} onClick={() => setPaywall(true)}
            aria-label="Recaps: your week as a one-minute story, every Monday. Unlock">
            <Lead dot={false} />
            <span className="flex-1" />
            <Icon name="lock" size={16} className="text-on-surface-variant" />
            <span className="text-[13px] font-medium text-on-surface-variant">Unlock</span>
            <Icon name="chevron_right" size={20} className="text-outline" />
          </button>
        )}
        {paywall && <PaywallModal variant="reports" returnTo="books" onClose={() => setPaywall(false)} />}
      </>
    );
  }

  const latest = rows[0];
  if (!latest) {
    return wide ? (
      <div className={CARD}>
        <div className={CARD_HEAD}><Lead dot={false} wide /><span className="flex-1" /></div>
        <span className="text-[13px] font-medium text-on-surface-variant">First one lands Monday</span>
      </div>
    ) : (
      <div className={ROW}>
        <Lead dot={false} />
        <span className="flex-1" />
        <span className="text-[13px] font-medium text-on-surface-variant">First one lands Monday</span>
      </div>
    );
  }
  const seen = !!latest.seen_at || watched.has(latest.id);
  if (wide) {
    return (
      <div className={CARD}>
        <div className={CARD_HEAD}>
          <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left active:opacity-70" onClick={() => open(latest)}>
            <Lead dot={unwatched} wide />
            <span className="flex-1" />
          </button>
          <Link href="/recaps" aria-label="All recaps" className="-mr-1.5 grid h-6 w-6 shrink-0 place-items-center text-on-surface-variant">
            <Icon name="chevron_right" size={20} />
          </Link>
        </div>
        <button className={CARD_PILL} onClick={() => open(latest)}>
          <Icon name="play_arrow" size={22} filled className="-ml-0.5 shrink-0" />
          {rowTitle(latest, seen)}
        </button>
      </div>
    );
  }
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
