'use client';
// One saved attachment tile on the owner estimate card: a photo thumbnail that
// opens the full-screen viewer on tap, or the PDF badge tile, plus the caption
// line. Pure presentation — every mutation (remove, caption save) and the viewer
// itself stay in EstimateAttachments.
//
// `editable` gates ONLY the remove control and the caption input. Viewing is
// never gated: a draft, a sent estimate and an approved (read-only) one all open
// their photos, because approval locks writes, not reading.
import Icon from '@/components/Icon';
import { attachmentSizeLabel } from '@/lib/estimates/attachments-view';

export type AttachmentTileProps = {
  /** 1-based position in the strip, for the caption input's accessible name. */
  index: number;
  /** True for JPG/PNG. A photo whose signed URL failed to mint is not a trigger. */
  isImage: boolean;
  sizeBytes: number;
  /** Short-lived signed URL; null for PDFs and for a photo that failed to sign. */
  previewUrl: string | null;
  caption: string | null;
  editable: boolean;
  deleting: boolean;
  captionDraft: string;
  onOpen: () => void;
  onRemove: () => void;
  onCaptionChange: (value: string) => void;
};

const CAPTION_MAX = 60;

export default function AttachmentTile({
  index,
  isImage,
  sizeBytes,
  previewUrl,
  caption,
  editable,
  deleting,
  captionDraft,
  onOpen,
  onRemove,
  onCaptionChange,
}: AttachmentTileProps) {
  return (
    <div className="w-28 shrink-0 snap-start">
      <div className="relative h-[84px] w-28 overflow-hidden rounded-[14px] border border-outline-variant/40 bg-surface-container-lowest">
        {isImage && previewUrl ? (
          // The tile IS the viewer trigger, in every state. The remove control
          // below is a later sibling, so its 44px corner still wins the hit test.
          <button
            type="button"
            onClick={onOpen}
            aria-label={caption ? `Open photo: ${caption}` : 'Open photo'}
            className="block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            {/* A short-lived signed URL; next/image adds nothing here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={caption || 'Estimate attachment'}
              className="h-full w-full object-cover"
            />
          </button>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2">
            <span className="rounded bg-[#9B3A23]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#9B3A23]">
              PDF
            </span>
            <span className="max-w-full truncate text-[10px] text-on-surface-variant">
              {attachmentSizeLabel(sizeBytes) || 'Document'}
            </span>
          </div>
        )}
        {editable && (
          <button
            type="button"
            onClick={onRemove}
            disabled={deleting}
            aria-label={`Remove ${caption || 'attachment'}`}
            className="absolute -right-1 -top-1 grid h-11 w-11 place-items-center rounded-full disabled:opacity-50"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-inverse-surface/85 text-inverse-on-surface">
              <Icon name={deleting ? 'hourglass_empty' : 'close'} size={15} />
            </span>
          </button>
        )}
      </div>
      {editable ? (
        <input
          value={captionDraft}
          onChange={(e) => onCaptionChange(e.target.value)}
          maxLength={CAPTION_MAX}
          placeholder="Add caption"
          aria-label={`Caption for attachment ${index}`}
          className="mt-1 w-full rounded-md border border-transparent bg-transparent px-0.5 py-1 text-[12px] text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-outline-variant/60"
        />
      ) : caption ? (
        <p className="mt-1 truncate text-[12px] text-on-surface-variant">{caption}</p>
      ) : null}
    </div>
  );
}
