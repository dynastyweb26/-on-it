'use client';
// ═══ Estimate attachments (owner) ═══
// Horizontal strip of photo / PDF tiles, the add-attachment bottom sheet, and
// the upload states from the design (uploading ring, failed + Retry, 10 of 10).
//
// Every mutation goes through the estimate routes (presign → signed PUT →
// confirm, DELETE, PATCH caption). Rows are never re-inserted or renumbered:
// positions are server-assigned and gaps are harmless.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import Icon from '@/components/Icon';
import { IN_APP_CAMERA } from '@/lib/feature-flags';
import { createClient } from '@/lib/supabase/client';
import { useSheetDrag } from '@/lib/use-sheet-drag';
import {
  attachmentCountLabel,
  attachmentRoomLabel,
  attachmentSheetLabel,
  attachmentSizeLabel,
  attachmentSlots,
  clipCaption,
  uploadProgressLabel,
} from '@/lib/estimates/attachments-view';
import {
  deleteEstimateAttachment,
  isImageAttachment,
  loadOwnerAttachments,
  prepareEstimateFile,
  readableUploadError,
  saveAttachmentCaption,
  uploadEstimateAttachment,
  type OwnerAttachment,
  type PreparedUpload,
} from '@/lib/estimates/attachments-client';

// The same in-app camera the receipt flow uses, behind NEXT_PUBLIC_IN_APP_CAMERA
// and loaded lazily: with the flag off this screen keeps today's `capture=`
// input and the camera chunk is never requested.
const ReceiptCameraScreen = IN_APP_CAMERA
  ? dynamic(() => import('@/components/camera/ReceiptCamera'), { ssr: false })
  : null;

type UploadStatus = 'preparing' | 'uploading' | 'failed';

type UploadItem = {
  id: string;
  label: string;
  status: UploadStatus;
  pct: number;
  /** Set once prepared (image object URL, or null for a PDF). */
  previewUrl: string | null;
  source: File;
  prepared?: PreparedUpload;
  error?: string;
};

const CAPTION_MAX = 60;
const CAPTION_DEBOUNCE_MS = 700;

function ProgressRing({ pct }: { pct: number }) {
  const r = 15;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, Math.max(0, pct)) / 100) * circumference;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" role="img" aria-label={`${pct}% uploaded`}>
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-outline-variant/50" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 18 18)"
        className="stroke-primary-container"
      />
    </svg>
  );
}

export default function EstimateAttachments({
  estimateId,
  userId,
  editable,
}: {
  estimateId: string;
  userId: string;
  editable: boolean;
}) {
  const [items, setItems] = useState<OwnerAttachment[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The in-app camera (flag on only). Mounted means open; closing unmounts it,
  // and that unmount is what stops the stream.
  const [cameraOpen, setCameraOpen] = useState(false);
  const { handleProps, sheetStyle, scrimStyle } = useSheetDrag(() => setSheetOpen(false));

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const captionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const objectUrls = useRef<string[]>([]);
  const alive = useRef(true);

  useEffect(() => () => {
    alive.current = false;
    Object.values(captionTimers.current).forEach(clearTimeout);
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!editable) setSheetOpen(false);
  }, [editable]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadOwnerAttachments(createClient(), userId, estimateId)
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setCaptionDrafts(Object.fromEntries(rows.map((r) => [r.id, r.caption ?? ''])));
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the attachments. Refresh to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [estimateId, userId]);

  const { room, atLimit } = attachmentSlots(items.length, uploads.length);

  const patchUpload = useCallback((id: string, patch: Partial<UploadItem>) => {
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  const runUpload = useCallback(async (uploadId: string, source: File) => {
    setError(null);
    patchUpload(uploadId, { status: 'preparing', pct: 0, error: undefined });
    try {
      const prepared = await prepareEstimateFile(source);
      if (!alive.current) return;
      let previewUrl = prepared.previewUrl;
      if (previewUrl) objectUrls.current.push(previewUrl);
      patchUpload(uploadId, {
        prepared,
        previewUrl,
        label: prepared.label,
        status: 'uploading',
        pct: 1,
      });
      const saved = await uploadEstimateAttachment({
        estimateId,
        file: prepared,
        onProgress: (pct) => {
          if (alive.current) patchUpload(uploadId, { pct });
        },
      });
      if (!alive.current) return;
      setItems((list) => [...list, saved]);
      setCaptionDrafts((drafts) => ({ ...drafts, [saved.id]: saved.caption ?? '' }));
      setUploads((list) => list.filter((u) => u.id !== uploadId));
    } catch (e) {
      if (!alive.current) return;
      patchUpload(uploadId, {
        status: 'failed',
        pct: 0,
        error: readableUploadError(e),
      });
    }
  }, [estimateId, patchUpload]);

  // The one attachment path: the pickers below and the in-app camera both land
  // here, so a captured frame is prepared/uploaded exactly like a picked file.
  function pick(files: FileList | File[] | null) {
    if (!files?.length) return;
    setError(null);
    const chosen = Array.from(files).slice(0, room);
    for (const file of chosen) {
      const upload: UploadItem = {
        id: crypto.randomUUID(),
        label: file.name || 'Attachment',
        status: 'preparing',
        pct: 0,
        previewUrl: null,
        source: file,
      };
      setUploads((list) => [...list, upload]);
      void runUpload(upload.id, file);
    }
    if (files.length > room) {
      setError('Up to 10 attachments.');
    }
  }

  function removeUpload(uploadId: string) {
    setUploads((list) => {
      const hit = list.find((u) => u.id === uploadId);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return list.filter((u) => u.id !== uploadId);
    });
  }

  async function removeItem(item: OwnerAttachment) {
    if (deletingId) return;
    setDeletingId(item.id);
    setError(null);
    try {
      await deleteEstimateAttachment(estimateId, item.id);
      if (!alive.current) return;
      setItems((list) => list.filter((a) => a.id !== item.id));
    } catch (e) {
      if (!alive.current) return;
      setError(
        e instanceof Error && e.message === 'locked'
          ? 'This estimate is locked.'
          : "Couldn't remove that file. Please try again.",
      );
    } finally {
      if (alive.current) setDeletingId(null);
    }
  }

  function changeCaption(item: OwnerAttachment, value: string) {
    const clipped = clipCaption(value);
    setCaptionDrafts((drafts) => ({ ...drafts, [item.id]: clipped }));
    setCaptionError(null);
    if (captionTimers.current[item.id]) clearTimeout(captionTimers.current[item.id]);
    captionTimers.current[item.id] = setTimeout(async () => {
      try {
        await saveAttachmentCaption(estimateId, item.id, clipped);
        if (!alive.current) return;
        setItems((list) => list.map((a) => (
          a.id === item.id ? { ...a, caption: clipped.trim() || null } : a
        )));
      } catch {
        if (alive.current) setCaptionError("Couldn't save that caption. Try again.");
      }
    }, CAPTION_DEBOUNCE_MS);
  }

  function openSheet(source: 'camera' | 'library' | 'files') {
    setSheetOpen(false);
    if (source === 'camera') {
      // Flag on: the in-app sheet. Off: the OS camera input, unchanged.
      if (IN_APP_CAMERA) { setCameraOpen(true); return; }
      cameraRef.current?.click();
    }
    if (source === 'library') libraryRef.current?.click();
    if (source === 'files') filesRef.current?.click();
  }

  return (
    <div className="card mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
          Attachments
        </span>
        <span className="text-[13px] font-semibold text-on-surface-variant">
          {attachmentCountLabel(items.length)}
        </span>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex gap-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-[84px] w-28 animate-pulse rounded-[14px] bg-surface-container" />
          ))}
        </div>
      ) : items.length === 0 && uploads.length === 0 ? (
        <p className="text-[13px] text-on-surface-variant">No attachments yet.</p>
      ) : (
        <div
          className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1"
          aria-label="Estimate attachments"
        >
          {items.map((item) => (
            <div key={item.id} className="w-28 shrink-0 snap-start">
              <div className="relative h-[84px] w-28 overflow-hidden rounded-[14px] border border-outline-variant/40 bg-surface-container-lowest">
                {isImageAttachment(item) && item.previewUrl ? (
                  // A short-lived signed URL; next/image adds nothing here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previewUrl} alt={item.caption || 'Estimate attachment'} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2">
                    <span className="rounded bg-[#9B3A23]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#9B3A23]">
                      PDF
                    </span>
                    <span className="max-w-full truncate text-[10px] text-on-surface-variant">
                      {attachmentSizeLabel(item.sizeBytes) || 'Document'}
                    </span>
                  </div>
                )}
                {editable && (
                  <button
                    type="button"
                    onClick={() => void removeItem(item)}
                    disabled={deletingId === item.id}
                    aria-label={`Remove ${item.caption || 'attachment'}`}
                    className="absolute -right-1 -top-1 grid h-11 w-11 place-items-center rounded-full disabled:opacity-50"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-inverse-surface/85 text-inverse-on-surface">
                      <Icon name={deletingId === item.id ? 'hourglass_empty' : 'close'} size={15} />
                    </span>
                  </button>
                )}
              </div>
              {editable ? (
                <input
                  value={captionDrafts[item.id] ?? ''}
                  onChange={(e) => changeCaption(item, e.target.value)}
                  maxLength={CAPTION_MAX}
                  placeholder="Add caption"
                  aria-label={`Caption for attachment ${items.indexOf(item) + 1}`}
                  className="mt-1 w-full rounded-md border border-transparent bg-transparent px-0.5 py-1 text-[12px] text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-outline-variant/60"
                />
              ) : item.caption ? (
                <p className="mt-1 truncate text-[12px] text-on-surface-variant">{item.caption}</p>
              ) : null}
            </div>
          ))}

          {uploads.map((u) => (
            <div key={u.id} className="w-28 shrink-0 snap-start">
              <div
                className={`relative h-[84px] w-28 overflow-hidden rounded-[14px] border ${
                  u.status === 'failed'
                    ? 'border-error/40 bg-error-container'
                    : 'border-outline-variant/40 bg-surface-container-lowest'
                }`}
              >
                {u.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.previewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-2">
                    <span className="rounded bg-[#9B3A23]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#9B3A23]">
                      PDF
                    </span>
                  </div>
                )}

                {u.status === 'failed' ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-error-container/90 px-1 text-center">
                    <Icon name="error" size={16} className="text-error" />
                    <span className="text-[11px] font-semibold leading-tight text-error">Upload failed</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-background/75">
                    <ProgressRing pct={u.pct} />
                    <span className="text-[11px] font-semibold tabular-nums text-on-surface-variant">
                      {uploadProgressLabel(u.status, u.pct)}
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removeUpload(u.id)}
                  aria-label={`Stop uploading ${u.label}`}
                  className="absolute -right-1 -top-1 grid h-11 w-11 place-items-center rounded-full"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-inverse-surface/85 text-inverse-on-surface">
                    <Icon name="close" size={15} />
                  </span>
                </button>
              </div>
              {u.status === 'failed' ? (
                <button
                  type="button"
                  onClick={() => void runUpload(u.id, u.source)}
                  className="mt-1 flex min-h-[36px] w-full items-center justify-center gap-1 rounded-md text-[12px] font-bold text-primary"
                >
                  <Icon name="refresh" size={14} /> Retry
                </button>
              ) : (
                <p className="mt-1 truncate text-[12px] text-on-surface-variant">{u.label}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-1 text-[12px] font-semibold text-error">{error}</p>
      )}
      {captionError && (
        <p role="alert" className="mt-1 text-[12px] font-semibold text-error">{captionError}</p>
      )}

      {editable ? (
        <>
          {atLimit ? (
            <div className="mt-2 flex items-start gap-2 rounded-[14px] bg-[#F3E7C9] px-3 py-2.5 text-[13px] font-semibold text-[#6B5410]">
              <Icon name="info" size={18} className="mt-0.5 shrink-0" />
              <span>10 of 10 max. Remove one to add another.</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              disabled={loading}
              className="mt-2 flex w-full items-center gap-3 rounded-[14px] border border-dashed border-outline-variant px-3.5 py-2.5 text-left transition active:scale-[0.99] disabled:opacity-50"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-container text-primary">
                <Icon name="add" size={20} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-bold text-primary">Add attachment</span>
                <span className="block text-[12px] text-on-surface-variant">
                  {attachmentRoomLabel(room)}
                </span>
              </span>
            </button>
          )}
          <p className="mt-2 text-[12px] text-on-surface-variant">
            Your client sees these on the estimate. They can view, not upload.
          </p>
        </>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-on-surface-variant">
          <Icon name="lock" size={14} /> Read-only after approval
        </p>
      )}

      {/* Hidden pickers: camera, photo library, documents (PDF only). */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label="Take a photo"
        onChange={(e) => { pick(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Choose from your photos"
        onChange={(e) => { pick(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={filesRef}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        aria-label="Choose PDF files"
        onChange={(e) => { pick(e.target.files); e.target.value = ''; }}
      />

      {/* In-app camera (NEXT_PUBLIC_IN_APP_CAMERA). Use photo goes through
          pick(), the same handler the two inputs below call; the gallery button
          is this flow's own photo library input. */}
      {ReceiptCameraScreen && cameraOpen && (
        <ReceiptCameraScreen
          copy={{
            sheet: 'Photograph an attachment',
            gallery: 'Choose a photo from your library',
            photoAlt: 'The attachment photo you just took',
            subject: 'it',
          }}
          onClose={() => setCameraOpen(false)}
          onPhoto={(file) => { setCameraOpen(false); pick([file]); }}
          onPickFromLibrary={() => { setCameraOpen(false); libraryRef.current?.click(); }}
        />
      )}

      {sheetOpen && editable && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[78] flex items-end md:items-center md:p-6 justify-center" data-no-tab-swipe="true">
          <div
            className="onit-composer-scrim absolute inset-0 bg-on-background/40"
            style={scrimStyle}
            onClick={() => setSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add attachment"
            style={sheetStyle as CSSProperties}
            className="onit-sheet-in relative w-full max-w-lg rounded-t-card md:rounded-card bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card-raised"
          >
            <div data-sheet-handle="" className="cursor-grab select-none" {...handleProps}>
              <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-outline-variant" />
              <div className="flex items-start gap-3 pb-1 pt-2">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl font-bold text-on-background">Add attachment</h2>
                  <p className="mt-0.5 text-[13px] text-on-surface-variant">{attachmentSheetLabel(room)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-container text-on-surface-variant transition active:scale-95"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>

            <div className="mt-1 divide-y divide-outline-variant/30">
              <button
                type="button"
                onClick={() => openSheet('camera')}
                className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left transition active:opacity-60"
              >
                <Icon name="photo_camera" size={22} className="text-primary" />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-on-surface">Take photo</span>
                  <span className="block text-[12px] text-on-surface-variant">Use your camera</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => openSheet('library')}
                className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left transition active:opacity-60"
              >
                <Icon name="photo_library" size={22} className="text-primary" />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-on-surface">Photo library</span>
                  <span className="block text-[12px] text-on-surface-variant">Choose from your photos</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => openSheet('files')}
                className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left transition active:opacity-60"
              >
                <Icon name="description" size={22} className="text-primary" />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-on-surface">Files</span>
                  <span className="block text-[12px] text-on-surface-variant">PDF only</span>
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="mt-2 flex min-h-touch w-full items-center justify-center rounded-[16px] text-[15px] font-semibold text-on-surface-variant"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
