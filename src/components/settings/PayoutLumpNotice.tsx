'use client';
// One-time, confirm-only notice on the payout surfaces ("Card payments pay out
// to your bank in one lump…"). It has one button: Got it. The dismissal is a
// localStorage flag read in an effect:
//   · SSR and the first paint render nothing, so there is no hydration mismatch;
//   · a throwing localStorage (private mode, blocked storage) is swallowed and
//     the notice still renders — it just cannot remember the dismissal;
//   · no profile column: this is a one-device acknowledgement.
import { useEffect, useState } from 'react';
import { LUMP_NOTICE_COPY, showLumpNotice } from '@/lib/payout-lump-notice';

const DISMISSED_KEY = 'onit_payout_lump_notice';
// The popup is remembered separately: the inline note is the durable one, the
// popup is the first-time hello and never comes back.
const POPUP_KEY = 'onit_payout_lump_popup';

export default function PayoutLumpNotice({
  stripeAccountId,
  bankLast4,
  variant = 'inline',
}: {
  stripeAccountId: string | null | undefined;
  bankLast4: string | null | undefined;
  /** inline = the note under the rows; popup = the one-time hello. */
  variant?: 'inline' | 'popup';
}) {
  const storageKey = variant === 'popup' ? POPUP_KEY : DISMISSED_KEY;
  // Hidden until the effect says otherwise: the default must not paint on the
  // server or on a device that already dismissed it.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!showLumpNotice(stripeAccountId, bankLast4)) {
      setVisible(false);
      return;
    }
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(storageKey) === '1';
    } catch {
      // No storage: show it. Better a repeat than silence on the first run.
      dismissed = false;
    }
    if (dismissed) { setVisible(false); return; }
    if (variant !== 'popup') { setVisible(true); return; }
    // Never over a voice recording, text entry, sheet or builder: wait for a
    // clear screen instead of stacking on top of one.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        timer = setTimeout(attempt, 1200);
        return;
      }
      setVisible(true);
    };
    attempt();
    return () => { if (timer) clearTimeout(timer); };
  }, [stripeAccountId, bankLast4, storageKey, variant]);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      // Nothing to remember; it will show again on this device.
    }
  }

  const card = (
    <div className="card flex items-start gap-3" role="status">
      <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-primary-soft">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>info</span>
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-body text-sm text-on-surface-variant">{LUMP_NOTICE_COPY}</p>
        <button type="button" onClick={dismiss} className="btn-outline px-4 py-2 text-sm">
          Got it
        </button>
      </div>
    </div>
  );
  if (variant === 'inline') return card;
  return (
    <div
      role="dialog"
      aria-label="Card payouts arrive as one bank deposit"
      className="bank-fade fixed inset-x-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-[70] mx-auto max-w-md rounded-[18px] border border-outline-variant bg-surface-container-lowest p-1 shadow-card-raised"
    >
      {card}
    </div>
  );
}
