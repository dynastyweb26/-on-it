'use client';
// ═══ Attachments editor ═══
// The gold "+ Add attachment" control, placed directly beneath "+ Add line item"
// (invoice/quote card) and "+ Add item" (composer template). Text-only, same
// gold as those buttons (text-primary = #735c00, the app's "gold as text"
// token). Up to ATTACHMENT_MAX images; each is compressed on pick and held as a
// pending blob until the host uploads it. Read-only on a locked/sent document.
//
// The component owns the pick + compress UX and emits the new list; it never
// touches the network or the DB. `onRemove` lets a host delete a persisted
// file. Removing renumbers via planAttachmentPositions (delete + re-insert).
import { Suspense, lazy, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import { ATTACHMENT_MAX, prepareAttachment } from '@/lib/attachment';
import { IN_APP_CAMERA } from '@/lib/feature-flags';

// The in-app camera the receipt and estimate flows use, behind
// NEXT_PUBLIC_IN_APP_CAMERA and loaded lazily: with the flag off this editor
// keeps today's single image picker and the camera chunk is never requested.
// React.lazy rather than next/dynamic: this component is rendered by the node
// test runner, which resolves real module specifiers, and the camera never
// renders during SSR anyway (cameraOpen starts false).
const ReceiptCameraScreen = IN_APP_CAMERA
  ? lazy(() => import('@/components/camera/ReceiptCamera'))
  : null;

export interface EditorAttachment {
  /** Local uuid while pending, or the invoice_attachments row id once saved. */
  id: string;
  /** Object URL (pending) or short-lived signed URL (saved). */
  previewUrl: string;
  /** Set while the image still has to be uploaded. */
  blob?: Blob;
  /** Set once saved: its storage object path. */
  storagePath?: string;
  /** Set for a seed-time COPY that still has to be duplicated: the SOURCE
   *  invoice's object path (read-only). Materialized at the first build into a
   *  fresh object under this invoice's folder, then replaced by `storagePath`. */
  copyFromPath?: string;
  /** Set once saved: its invoice_attachments row id. */
  rowId?: string;
  /** Natural (downscaled) size, for the PDF layout. Known for picked images;
   *  measured from storage for ones loaded back from a saved invoice. */
  width?: number;
  height?: number;
}

export default function AttachmentsEditor({
  items,
  editable,
  onChange,
  onRemove,
}: {
  items: EditorAttachment[];
  editable: boolean;
  onChange: (items: EditorAttachment[]) => void;
  /** Fired for a saved attachment so the host can delete its stored file. */
  onRemove?: (item: EditorAttachment) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Flag on only: the camera / library choice, and the camera sheet itself.
  // Mounted means open; the camera's unmount is what stops its stream.
  const [chooserOpen, setChooserOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const full = items.length >= ATTACHMENT_MAX;

  // The one attachment path: the picker below and the in-app camera both land
  // here, so a captured frame is compressed exactly like a picked file.
  async function pick(files: FileList | File[] | null) {
    if (!files?.length) return;
    setError(null);
    const room = ATTACHMENT_MAX - items.length;
    const chosen = Array.from(files).slice(0, room);
    setBusy(true);
    const added: EditorAttachment[] = [];
    let failed: string | null = null;
    for (const f of chosen) {
      try {
        const p = await prepareAttachment(f);
        added.push({
          id: crypto.randomUUID(), previewUrl: p.previewUrl, blob: p.blob,
          width: p.width, height: p.height,
        });
      } catch (e) {
        failed = e instanceof Error ? e.message : "Couldn't add that image.";
        break;
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    if (added.length) onChange([...items, ...added]);
    if (files.length > room) setError(`Up to ${ATTACHMENT_MAX} images.`);
    else if (failed) setError(failed);
  }

  function remove(item: EditorAttachment) {
    setError(null);
    onChange(items.filter((a) => a.id !== item.id));
    onRemove?.(item);
  }

  return (
    // No data-no-tab-swipe here: this block is only buttons + a hidden file
    // input. A horizontal drag belongs to the tab deck; a tap still opens the
    // picker. Only real text entry (and open sheets) opts out.
    <div className="mt-1.5">
      {items.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-2">
          {items.map((a) => (
            <div key={a.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-outline-variant/40 bg-surface-container-lowest">
              {/* A local object URL or a signed storage URL; next/image adds nothing here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.previewUrl} alt="Attachment" className="h-full w-full object-cover" />
              {editable && (
                <button
                  type="button"
                  onClick={() => remove(a)}
                  aria-label="Remove attachment"
                  className="absolute right-0 top-0 grid h-6 w-6 place-items-center rounded-bl-lg bg-inverse-surface/80 text-inverse-on-surface transition active:scale-90"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || full}
            onClick={() => {
              // Flag on: ask camera or library first, like the estimate sheet.
              if (IN_APP_CAMERA) { setChooserOpen(true); return; }
              inputRef.current?.click();
            }}
            className="flex min-h-[44px] items-center gap-1.5 px-1 text-[15px] font-bold text-primary transition active:opacity-60 disabled:opacity-40"
          >
            <Icon name="add" size={20} /> {busy ? 'Adding…' : 'Add attachment'}
          </button>
          {items.length > 0 && (
            <span className="text-[13px] text-on-surface-variant">{items.length} of {ATTACHMENT_MAX}</span>
          )}
        </div>
      )}

      {error && <p role="alert" className="px-1 text-[13px] text-error">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Choose attachment images"
        onChange={(e) => void pick(e.target.files)}
      />

      {/* Flag on: camera or library, in the same sheet the estimate attachments
          picker uses. Flag off this never renders and the button above opens
          the input directly, exactly as before. */}
      {chooserOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[78] flex items-end md:items-center md:p-6 justify-center">
          <div
            className="onit-composer-scrim absolute inset-0 bg-on-background/40"
            onClick={() => setChooserOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add attachment"
            className="onit-sheet-in relative w-full max-w-lg rounded-t-card md:rounded-card bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card-raised"
          >
            <div className="flex items-start gap-3 pb-1 pt-4">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl font-bold text-on-background">Add attachment</h2>
              </div>
              <button
                type="button"
                onClick={() => setChooserOpen(false)}
                aria-label="Close"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-container text-on-surface-variant transition active:scale-95"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="mt-1 divide-y divide-outline-variant/30">
              <button
                type="button"
                onClick={() => { setChooserOpen(false); setCameraOpen(true); }}
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
                onClick={() => { setChooserOpen(false); inputRef.current?.click(); }}
                className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left transition active:opacity-60"
              >
                <Icon name="photo_library" size={22} className="text-primary" />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-on-surface">Photo library</span>
                  <span className="block text-[12px] text-on-surface-variant">Choose from your photos</span>
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setChooserOpen(false)}
              className="mt-2 flex min-h-touch w-full items-center justify-center rounded-[16px] text-[15px] font-semibold text-on-surface-variant"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* Use photo goes through pick(), the same handler the input above fires,
          so the frame is prepared by prepareAttachment unchanged. */}
      {ReceiptCameraScreen && cameraOpen && (
        <Suspense fallback={null}>
          <ReceiptCameraScreen
            copy={{
              sheet: 'Photograph an attachment',
              gallery: 'Choose a photo from your library',
              photoAlt: 'The attachment photo you just took',
              subject: 'it',
            }}
            onClose={() => setCameraOpen(false)}
            onPhoto={(file) => { setCameraOpen(false); void pick([file]); }}
            onPickFromLibrary={() => { setCameraOpen(false); inputRef.current?.click(); }}
          />
        </Suspense>
      )}
    </div>
  );
}
