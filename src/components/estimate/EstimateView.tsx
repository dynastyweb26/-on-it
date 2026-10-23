'use client';

// The public estimate page body. The server page owns data loading and the
// fonts; this client shell owns everything a visitor can change: expanded
// items, the photo viewer, the sign/success sheets, attachment retries and the
// sticky bar. One payload state so a refreshed payload (content_changed, a
// stale state, an attachment retry) re-renders every card together.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicEstimateResult } from '@/lib/estimates/types';
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
}: {
  initial: PublicEstimateResult;
  token: string;
}) {
  const preview = false;
  const [data, setData] = useState<PublicEstimateResult>(initial);
  const [sheet, setSheet] = useState<'sign' | 'success' | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [sticky, setSticky] = useState(false);
  const heroRef = useRef<HTMLElement | null>(null);

  const payload = data.state === 'unavailable' ? null : data;
  const theme = useMemo(() => (payload ? estimateTheme(payload) : null), [payload]);
  const photos = useMemo(
    () => (payload ? payload.attachments.filter(isPhoto) : []),
    [payload],
  );

  // Sticky bar: appears once the hero card has scrolled off the top.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setSticky(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [payload?.invoiceNumber]);

  function handleOutcome(outcome: SignOutcome) {
    if (!payload) return;
    setData({ ...payload, state: 'approved', signature: outcome.signature });
    setSheet('success');
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

  return (
    <div
      className={s.page}
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

        <section className={s.card} ref={heroRef} aria-label="Estimate summary">
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
          <AttachmentsCard attachments={payload.attachments} onOpenPhoto={(id) => setViewerId(id)} />
        )}

        {payload.notes && <NotesCard notes={payload.notes} />}

        <SignatureCard payload={payload} preview={preview} onSign={() => setSheet('sign')} />

        <Footer />
      </div>

      {payload.state === 'pending' && (
        <StickyBar
          total={payload.total}
          show={sticky && !sheetOpen}
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
