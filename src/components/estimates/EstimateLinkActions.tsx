'use client';
// Copy link / Share for a sent estimate, used by the chat confirmation and the
// locked chat card. Same two actions (and the same helpers) as the estimate
// detail screen, so the link behaves identically wherever it is shown.
import { useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { estimateShareText, shareEstimateLink } from '@/lib/estimates/owner-actions';

export default function EstimateLinkActions({
  url,
  title,
  businessName,
}: {
  url: string;
  title: string;
  businessName?: string | null;
}) {
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  function flash(text: string) {
    setNote(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 2200);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      flash('Link copied');
    } catch {
      flash('Clipboard is blocked. Long-press the link to copy it.');
    }
  }

  async function share() {
    const result = await shareEstimateLink({ url, title, text: estimateShareText(businessName) });
    if (result === 'copied') flash('Link copied');
    if (result === 'failed') flash('Clipboard is blocked. Long-press the link to copy it.');
  }

  const tile =
    'flex min-h-touch flex-1 items-center justify-center gap-1.5 rounded-input border border-outline-variant bg-surface-container-lowest px-3 text-label-lg font-semibold text-primary transition active:scale-95';

  return (
    <div>
      <p className="break-all text-xs text-on-surface-variant">{url}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className={tile} onClick={() => void copy()}>
          <Icon name="link" size={18} /> Copy link
        </button>
        <button type="button" className={tile} onClick={() => void share()}>
          <Icon name="share" size={18} /> Share
        </button>
      </div>
      {note && (
        <p role="status" className="mt-1.5 text-center text-xs text-on-surface-variant">
          {note}
        </p>
      )}
    </div>
  );
}
