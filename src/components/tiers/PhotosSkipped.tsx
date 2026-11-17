'use client';
// 05 Photos skipped — design/tiers/Tiers_2_Locks_Plan_Cancel.dc.html §05.
// The toast says it once (light cream, down from the header, 8s dwell because
// it has an action). The inline note sits on the NEW document where its photos
// would have been, and stays there (it reads what convert stored). Neither is
// ever shown to a Plus user, and never on the original.
import { useEffect, useRef, useState } from 'react';
import { photosSkippedCopy, PHOTOS_TOAST_DWELL_MS, type SkippedPhotos } from '@/lib/plan-lock-view';
import './tiers.css';

const EXIT_MS = 220;

/** Keep a document number ("E-0051") on one line: never broken at its hyphen. */
function Unbroken({ text, token }: { text: string; token: string | null }) {
  if (!token || !text.includes(token)) return <>{text}</>;
  const [before, ...rest] = text.split(token);
  return <>{before}<span style={{ whiteSpace: 'nowrap' }}>{token}</span>{rest.join(token)}</>;
}

export function PhotosSkippedToast({
  skipped, plusName, onSeePlus, onDone, dwellMs = PHOTOS_TOAST_DWELL_MS,
}: {
  skipped: SkippedPhotos;
  plusName: string;
  onSeePlus: () => void;
  onDone: () => void;
  /** null keeps it up (the /dev fixture). */
  dwellMs?: number | null;
}) {
  const copy = photosSkippedCopy(skipped, plusName);
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const leave = () => {
    setLeaving(true);
    window.setTimeout(() => doneRef.current(), EXIT_MS);
  };
  useEffect(() => {
    if (dwellMs == null) return;
    const t = window.setTimeout(leave, dwellMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dwellMs]);

  return (
    <div className={`tp-toast${leaving ? ' is-leaving' : ''}`} role="status" aria-live="polite" data-photos-toast="">
      <span className="tp-icon" aria-hidden><span className="material-symbols-outlined">hide_image</span></span>
      <div className="tp-text">
        <span className="tp-title">{copy.toastTitle}</span>
        <span className="tp-body"><Unbroken text={copy.toastBody} token={skipped.sourceDocNumber} /></span>
      </div>
      <button type="button" className="tp-link" onClick={() => { onSeePlus(); leave(); }}>{copy.link}</button>
    </div>
  );
}

export function PhotosSkippedNote({
  skipped, plusName, onSeePlus,
}: {
  skipped: SkippedPhotos;
  plusName: string;
  onSeePlus: () => void;
}) {
  const copy = photosSkippedCopy(skipped, plusName);
  return (
    <div data-photos-note="">
      <div className="tp-label">PHOTOS</div>
      <div className="tp-note" style={{ marginTop: 12 }}>
        <span className="material-symbols-outlined" aria-hidden>hide_image</span>
        <div className="tp-note-text">
          <span><Unbroken text={copy.inline} token={skipped.sourceDocNumber} /></span>
          <button type="button" className="tp-link" onClick={onSeePlus}>{copy.link}</button>
        </div>
      </div>
    </div>
  );
}
