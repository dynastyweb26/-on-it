'use client';

// Success sheet (design spec §2.4): replaces the sign sheet after approval.
// Closing it — grab handle, scrim, close button or the primary button — always
// lands on the signed signature card.
import { useEffect, useState } from 'react';
import type { PublicEstimate } from '@/lib/estimates/types';
import { money } from '@/lib/financials';
import EstIcon from './EstIcon';
import { estimateNumber, jobLine, signedDateText } from './model';
import s from './estimate.module.css';

export default function SuccessSheet({
  payload,
  token,
  onView,
}: {
  payload: PublicEstimate;
  token: string;
  onView: () => void;
}) {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLink(`${window.location.origin}/e/${token}`);
  }, [token]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(timer);
  }, [copied]);

  const signature = payload.signature;
  const business = payload.business.name ?? 'The business';

  async function copy() {
    const value = link || `${window.location.origin}/e/${token}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={s.scrim} role="presentation" onClick={onView}>
      <div
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.grabHandle} aria-hidden />

        <div className={s.successIcon}>
          <EstIcon name="check_circle" size={64} />
        </div>
        <h2 className={s.successTitle} id="success-sheet-title">
          Estimate approved.
        </h2>
        <p className={s.successBody}>{business} has been notified.</p>

        <div className={s.summary}>
          <div className={s.summaryHead}>
            <span className={s.summaryNumber}>Estimate {estimateNumber(payload.invoiceNumber)}</span>
            <span className={s.pill}>
              <EstIcon name="verified" size={14} />
              Approved
            </span>
          </div>
          {jobLine(payload) && <p className={s.summaryJob}>{jobLine(payload)}</p>}

          {signature && (
            <div className={s.sigBox}>
              {signature.type === 'draw' ? (
                // eslint-disable-next-line @next/next/no-img-element -- stored PNG data URL
                <img className={s.sigDrawn} src={signature.data} alt="Your signature" />
              ) : (
                <span className={s.sigTyped}>{signature.data}</span>
              )}
            </div>
          )}

          <div className={s.sigRows}>
            <div className={s.sigRow}>
              <span className={s.sigLabel}>Signed by</span>
              <span className={s.sigValue}>{signature?.signerName ?? ''}</span>
            </div>
            <div className={s.sigRow}>
              <span className={s.sigLabel}>Date</span>
              <span className={s.sigValue}>{signedDateText(payload)}</span>
            </div>
            <div className={s.sigRow}>
              <span className={s.sigLabel}>Total</span>
              <span className={s.sigValue}>{money(payload.total)}</span>
            </div>
          </div>
        </div>

        <div className={s.saveBox}>
          <EstIcon name="bookmark" size={20} />
          <div>
            <div>Save this link. It&rsquo;s your copy of the signed estimate.</div>
            <div className={s.linkText}>{link || `…/e/${token}`}</div>
            <button type="button" className={s.copyButton} onClick={copy}>
              <EstIcon name={copied ? 'check' : 'content_copy'} size={16} />
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>

        <button type="button" className={s.primaryButton} onClick={onView}>
          View signed estimate
        </button>
      </div>
    </div>
  );
}
