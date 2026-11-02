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

export default function PayoutLumpNotice({
  stripeAccountId,
  bankLast4,
}: {
  stripeAccountId: string | null | undefined;
  bankLast4: string | null | undefined;
}) {
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
      dismissed = localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      // No storage: show it. Better a repeat than silence on the first run.
      dismissed = false;
    }
    setVisible(!dismissed);
  }, [stripeAccountId, bankLast4]);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Nothing to remember; it will show again on this device.
    }
  }

  return (
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
}
