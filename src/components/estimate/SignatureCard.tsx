'use client';

// Signature card by state (design spec §2.2). Pending opens the sign sheet;
// approved is a permanent record; expired offers Call/Text. Owner preview keeps
// the card but turns signing off.
import type { PublicEstimate } from '@/lib/estimates/types';
import EstIcon from './EstIcon';
import {
  drawnSignature,
  estimateNumber,
  signedDateText,
  shortDate,
  smsHref,
  telHref,
  typedSignature,
} from './model';
import s from './estimate.module.css';

export default function SignatureCard({
  payload,
  preview,
  onSign,
}: {
  payload: PublicEstimate;
  preview: boolean;
  onSign: () => void;
}) {
  const business = payload.business.name ?? 'The business';
  const phone = payload.business.phone;

  if (payload.state === 'approved') {
    const signature = payload.signature;
    return (
      <section className={s.card} id="signature-card" aria-label="Signature">
        <div className={s.approvedHead}>
          <EstIcon name="verified" size={22} />
          Signed &amp; approved
        </div>

        {signature && (
          <div className={s.sigBox}>
            {drawnSignature(signature) ? (
              // eslint-disable-next-line @next/next/no-img-element -- stored PNG data URL
              <img className={s.sigDrawn} src={signature.data} alt={`Signature of ${signature.signerName}`} />
            ) : (
              <span className={s.sigTyped}>{typedSignature(signature)}</span>
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
            <span className={s.sigLabel}>Method</span>
            <span className={s.sigValue}>E-signed on this page</span>
          </div>
        </div>
      </section>
    );
  }

  if (payload.state === 'expired') {
    const expiredOn = shortDate(payload.validUntil);
    return (
      <section className={s.card} id="signature-card" aria-label="Signature">
        <h2 className={s.signTitle}>
          This estimate expired{expiredOn ? ` ${expiredOn}` : ''}.
        </h2>
        <p className={s.signBody}>
          Contact {business} if you&rsquo;d still like to go ahead. They can send you an updated estimate.
        </p>
        {phone && (
          <>
            <a className={s.primaryButton} href={telHref(phone)}>
              <EstIcon name="call" size={20} />
              Call
            </a>
            <a className={s.secondaryButton} href={smsHref(phone)}>
              <EstIcon name="sms" size={20} />
              Text
            </a>
          </>
        )}
      </section>
    );
  }

  return (
    <section className={s.card} id="signature-card" aria-label="Signature">
      <h2 className={s.signTitle}>Ready to go ahead?</h2>
      <p className={s.signBody}>
        Sign to approve this estimate. {business} is notified right away.
      </p>
      <button type="button" className={s.primaryButton} onClick={onSign} disabled={preview}>
        <EstIcon name="draw" size={20} />
        Review &amp; sign
      </button>
      <p className={s.signNote}>
        {preview ? 'Signing is turned off in preview.' : 'No account needed. Takes about a minute.'}
      </p>
      <span className={s.srOnly}>Estimate {estimateNumber(payload.invoiceNumber)}</span>
    </section>
  );
}
