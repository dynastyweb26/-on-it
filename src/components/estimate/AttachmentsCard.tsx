'use client';

// Attachments card (design spec §2.1.5): photo grid + document rows, first four
// with View all. Signing is never blocked by an attachment that failed to load.
import { useState } from 'react';
import type { PublicAttachment } from '@/lib/estimates/types';
import EstIcon from './EstIcon';
import { fileSize, isPhoto } from './model';
import s from './estimate.module.css';

export default function AttachmentsCard({
  attachments,
  onOpenPhoto,
}: {
  attachments: PublicAttachment[];
  onOpenPhoto: (attachmentId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const total = attachments.length;
  const visible = showAll ? attachments : attachments.slice(0, 4);
  const photos = visible.filter(isPhoto);
  const documents = visible.filter((a) => !isPhoto(a));

  function markFailed(id: string) {
    setFailed((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }

  function photoTile(photo: PublicAttachment) {
    const isFailed = failed.has(photo.id);
    return (
      <button
        key={photo.id}
        type="button"
        className={s.photoTile}
        onClick={() => (isFailed ? undefined : onOpenPhoto(photo.id))}
        aria-label={photo.caption ? `Open photo: ${photo.caption}` : 'Open photo'}
      >
        <span className={s.photoFrame}>
          {isFailed ? (
            <span className={s.photoFail}>Couldn&rsquo;t load photo</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL, unknown dimensions
            <img
              key={photo.url}
              className={s.photoImage}
              src={photo.url}
              alt={photo.caption ?? ''}
              loading="lazy"
              onError={() => markFailed(photo.id)}
            />
          )}
        </span>
        {photo.caption && <span className={s.photoCaption}>{photo.caption}</span>}
      </button>
    );
  }

  function documentRow(doc: PublicAttachment) {
    return (
      <div key={doc.id} className={s.docRow}>
        <span className={s.docBadge}>PDF</span>
        <span className={s.docText}>
          {/* The payload carries no file name (storage keys are uuids), so the
              owner's caption is the only human label. */}
          <span className={s.docName}>{doc.caption ?? 'PDF document'}</span>
          <span className={s.docMeta}>{`${fileSize(doc.sizeBytes)} · PDF`}</span>
        </span>
        <a className={s.viewLink} href={doc.url} target="_blank" rel="noreferrer noopener">
          View
          <EstIcon name="open_in_new" size={16} />
        </a>
      </div>
    );
  }

  return (
    <section className={s.card} aria-label="Attachments">
      <div className={s.sectionHead}>
        <span className={s.sectionTitle}>Attachments</span>
        <span className={s.sectionCount}>({total})</span>
      </div>

      {photos.length > 0 && <div className={s.photoGrid}>{photos.map(photoTile)}</div>}
      {documents.map(documentRow)}

      {total > 4 && (
        <button type="button" className={s.toggleButton} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `View all ${total} attachments`}
          <EstIcon name="expand_more" size={18} />
        </button>
      )}
    </section>
  );
}
