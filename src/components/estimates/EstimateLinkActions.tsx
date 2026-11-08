'use client';
// Copy link / Share for a sent estimate, used by the locked chat card.
//
// Alive layer §02: the buttons confirm IN PLACE — the label flips, a gold check
// pops in, and the link you just copied shows underneath in mono. No toast, no
// sheet. Share has no system confirmation of its own, so a completed share is
// also confirmed by the assistant in chat (the `onShared` callback); a user
// cancel is silent, exactly as before.
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { estimateShareText, shareEstimateLink } from '@/lib/estimates/owner-actions';

type Confirmed = 'copy' | 'share' | null;

/** 1.6s of confirmation, then the button flips back (spec §02 · revert). */
const CONFIRM_MS = 1600;

/** The line under the buttons: host + path, no scheme, so it reads like a link. */
function displayLink(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

export default function EstimateLinkActions({
  url,
  title,
  businessName,
  onShared,
}: {
  url: string;
  title: string;
  businessName?: string | null;
  /** Chat only: posted once, after the share sheet reports a completed share. */
  onShared?: () => void;
}) {
  const [confirmed, setConfirmed] = useState<Confirmed>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const sharedOnce = useRef(false);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function hold(next: Exclude<Confirmed, null>) {
    setConfirmed(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setConfirmed(null), CONFIRM_MS);
  }

  async function copy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(url);
      hold('copy');
    } catch {
      setError('Clipboard is blocked. Long-press the link to copy it.');
    }
  }

  async function share() {
    if (sharing) return;
    setError(null);
    setSharing(true);
    const result = await shareEstimateLink({ url, title, text: estimateShareText(businessName) });
    setSharing(false);
    if (result === 'shared') {
      hold('share');
      if (!sharedOnce.current) {
        sharedOnce.current = true;
        onShared?.();
      }
    } else if (result === 'copied') {
      // No share sheet on this platform: the helper copied the link instead.
      hold('copy');
    } else if (result === 'failed') {
      setError('Clipboard is blocked. Long-press the link to copy it.');
    }
    // 'cancelled' — the sheet came back without a share. Nothing changes.
  }

  const shown = displayLink(url);
  const tile =
    'flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-[14px] transition duration-[90ms] ease-out active:scale-[.97] disabled:opacity-55';
  const idle = 'border-outline-variant bg-surface-container-lowest font-semibold text-on-background';
  const done = 'border-primary-container bg-primary-soft font-bold text-on-background onit-confirm-ring';

  return (
    <div>
      {/* The raw link stays available until a confirmation takes its place. */}
      {confirmed === 'copy' ? (
        <p key="copied-link" className="onit-confirm-in flex items-center gap-1.5 font-mono text-[12px] text-on-surface-variant">
          <Icon name="check" size={14} className="shrink-0 text-primary" />
          <span className="min-w-0 break-all">{shown} copied</span>
        </p>
      ) : (
        <p className="break-all text-xs text-on-surface-variant">{url}</p>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`${tile} ${confirmed === 'copy' ? done : idle}`}
          onClick={() => void copy()}
          aria-label="Copy the estimate link"
        >
          {confirmed === 'copy' ? (
            <>
              <span className="onit-confirm-pop grid h-[22px] w-[22px] place-items-center rounded-full bg-primary-container">
                <Icon name="check" size={15} className="text-on-background" />
              </span>
              <span className="onit-confirm-in">Copied</span>
            </>
          ) : (
            <>
              <Icon name="link" size={20} />
              <span>Copy link</span>
            </>
          )}
        </button>

        <button
          type="button"
          className={`${tile} ${confirmed === 'share' ? done : idle}`}
          onClick={() => void share()}
          disabled={sharing}
          aria-label="Share the estimate link"
        >
          {confirmed === 'share' ? (
            <>
              <span className="onit-confirm-pop grid h-[22px] w-[22px] place-items-center rounded-full bg-primary-container">
                <Icon name="check" size={15} className="text-on-background" />
              </span>
              <span className="onit-confirm-in">Shared</span>
            </>
          ) : (
            <>
              <Icon name="share" size={20} />
              <span>Share</span>
            </>
          )}
        </button>
      </div>

      {/* Spoken confirmation (spec §02 · a11y). The visible flip is the sighted
          half; this is the only announcement, and it holds no layout space. */}
      <span role="status" aria-live="polite" className="sr-only">
        {confirmed === 'copy' ? 'Link copied' : confirmed === 'share' ? 'Link shared' : ''}
      </span>

      {error && (
        <p role="status" className="mt-1.5 text-center text-xs text-on-surface-variant">
          {error}
        </p>
      )}
    </div>
  );
}
