'use client';

// The public estimate page body. The server page owns data loading and the
// fonts; this client shell owns everything a visitor can change: expanded
// items, the photo viewer, the sign/success sheets, attachment retries and the
// sticky bar. One payload state so a refreshed payload (content_changed, a
// stale state, an attachment retry) re-renders every card together.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PublicAttachment, PublicEstimateResult } from '@/lib/estimates/types';
import { money } from '@/lib/financials';
import AttachmentsCard from './AttachmentsCard';
import EstIcon from './EstIcon';
import ItemsCard from './ItemsCard';
import NotesCard from './NotesCard';
import PhotoViewer from './PhotoViewer';
import SignSheet, { type SignOutcome } from './SignSheet';
import SignatureCard from './SignatureCard';
import StickyBar from './StickyBar';
import SuccessSheet from './SuccessSheet';
import { Footer, UnavailableNotice } from './Notice';
import {
  estimateNumber,
  estimateTheme,
  initials,
  isPhoto,
  jobLine,
  totalSubline,
  validityText,
  statusChip,
} from './model';
import s from './estimate.module.css';

export default function EstimateView({
  initial,
  token,
  preview = false,
  previewId = null,
}: {
  initial: PublicEstimateResult;
  token: string;
  /** Owner preview: banner on, signing off. */
  preview?: boolean;
  /** Owner preview: the id the preview API re-reads on a retry. */
  previewId?: string | null;
}) {
  const [data, setData] = useState<PublicEstimateResult>(initial);
  const [sheet, setSheet] = useState<'sign' | 'success' | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const payload = data.state === 'unavailable' ? null : data;
  const theme = useMemo(() => (payload ? estimateTheme(payload) : null), [payload]);
  // The viewer's index and counter run over loadable photos only: a row whose
  // signed URL failed stays in the card as a failed tile, never in the stage.
  const photos = useMemo(
    () => (payload ? payload.attachments.filter((a) => isPhoto(a) && a.url !== null) : []),
    [payload],
  );

  // Re-read the payload. Used when the server says the page is out of date
  // (content_changed, already approved, expired, revoked) and by attachment
  // retry, which needs freshly minted signed URLs. In preview the public token
  // endpoint refuses a draft, so the owner's preview endpoint is re-read.
  const refresh = useCallback(async (): Promise<PublicAttachment[] | null> => {
    const url =
      preview && previewId
        ? `/api/estimates/${encodeURIComponent(previewId)}/preview`
        : `/api/public/estimates/${encodeURIComponent(token)}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const next = (await res.json()) as PublicEstimateResult;
      if (!next || typeof next.state !== 'string') return null;
      setData(next);
      return next.state === 'unavailable' ? null : next.attachments;
    } catch {
      return null;
    }
  }, [preview, previewId, token]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  function handleOutcome(outcome: SignOutcome) {
    if (!payload) return;
    if (outcome.kind === 'approved') {
      setData({ ...payload, state: 'approved', signature: outcome.signature });
      setSheet('success');
      return;
    }
    if (outcome.kind === 'content_changed') {
      // The content hash moved under the signer: re-read what they must review
      // and reset the sheet (closing it discards the signature and the checkbox).
      void refresh();
      setToast('This estimate was updated. Please review the changes and sign again.');
      setSheet(null);
      return;
    }
    // The page state changed underneath us: reload into whatever it is now.
    void refresh();
    setSheet(null);
  }

  function closeSuccess() {
    setSheet(null);
    document.getElementById('signature-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (!payload || !theme) return <UnavailableNotice />;

  const chip = statusChip(payload.state);
  const validity = validityText(payload);
  const viewerIndex = viewerId ? photos.findIndex((p) => p.id === viewerId) : -1;
  const sheetOpen = sheet !== null || viewerIndex >= 0;
  // The bar is the pending state's only persistent action: on screen from
  // first paint, out of the way while a sheet or the viewer is open.
  const signable = payload.state === 'pending';

  return (
    <div
      className={`${s.page} ${signable ? s.pageHasBar : ''}`}
      style={
        {
          '--accent': theme.accent,
          '--accent-text': theme.accentInk,
          '--accent-on': theme.onAccent,
        } as React.CSSProperties
      }
    >
      {preview && (
        <div className={s.previewBanner}>
          <EstIcon name="visibility" size={18} />
          Preview, this is what your client sees
        </div>
      )}

      <div className={s.column}>
        <header className={s.header}>
          {payload.business.logoUrl ? (
            <span className={s.logoTile}>
              {/* eslint-disable-next-line @next/next/no-img-element -- owner-provided logo URL */}
              <img
                className={s.logoImage}
                src={payload.business.logoUrl}
                alt={payload.business.name ?? 'Business logo'}
              />
            </span>
          ) : (
            <span className={s.initials} aria-hidden>
              {initials(payload.business.name)}
            </span>
          )}
          <h1 className={s.businessName}>{payload.business.name ?? 'Your estimate'}</h1>

          {(payload.business.phone || payload.business.email) && (
            <div className={s.contactRow}>
              {payload.business.phone && (
                <a className={s.contactLink} href={`tel:${payload.business.phone.replace(/[^\d+]/g, '')}`}>
                  {payload.business.phone}
                </a>
              )}
              {payload.business.phone && payload.business.email && (
                <span className={s.contactDot} aria-hidden>
                  ·
                </span>
              )}
              {payload.business.email && (
                <a className={s.contactLink} href={`mailto:${payload.business.email}`}>
                  {payload.business.email}
                </a>
              )}
            </div>
          )}

          <div className={s.docNumber}>Estimate {estimateNumber(payload.invoiceNumber)}</div>
        </header>

        <section className={s.card} aria-label="Estimate summary">
          <div className={s.heroTop}>
            {chip ? (
              <span
                className={`${s.chip} ${
                  chip.tone === 'approved' ? s.chipApproved : chip.tone === 'expired' ? s.chipExpired : s.chipPending
                }`}
              >
                <EstIcon name={chip.icon} size={16} />
                {chip.label}
              </span>
            ) : (
              <span />
            )}
            {validity && <span className={s.validity}>{validity}</span>}
          </div>

          <p className={s.preparedFor}>
            Prepared for <strong>{payload.clientName || 'you'}</strong>
          </p>
          {jobLine(payload) && <p className={s.jobLine}>{jobLine(payload)}</p>}

          <hr className={s.dashed} />

          <div className={s.totalLabel}>ESTIMATE TOTAL</div>
          <div className={s.total}>{money(payload.total)}</div>
          <div className={s.subline}>{totalSubline(payload)}</div>
        </section>

        <ItemsCard payload={payload} />

        {payload.attachments.length > 0 && (
          <AttachmentsCard
            attachments={payload.attachments}
            onRefresh={refresh}
            onOpenPhoto={(id) => setViewerId(id)}
          />
        )}

        {payload.notes && <NotesCard notes={payload.notes} />}

        <SignatureCard payload={payload} preview={preview} onSign={() => setSheet('sign')} />

        <Footer />
      </div>

      {signable && (
        <StickyBar
          total={payload.total}
          show={!sheetOpen}
          onSign={() => setSheet('sign')}
          disabled={preview}
        />
      )}

      {sheet === 'sign' && (
        <SignSheet
          payload={payload}
          token={token}
          preview={preview}
          onClose={() => setSheet(null)}
          onOutcome={handleOutcome}
        />
      )}

      {sheet === 'success' && (
        <SuccessSheet payload={payload} token={token} onView={closeSuccess} />
      )}

      {toast && (
        <div className={s.toast} role="status">
          {toast}
        </div>
      )}

      {viewerIndex >= 0 && (
        <PhotoViewer
          photos={photos}
          index={viewerIndex}
          onClose={() => setViewerId(null)}
          onIndex={(next) => setViewerId(photos[next]?.id ?? null)}
        />
      )}

    </div>
  );
}
