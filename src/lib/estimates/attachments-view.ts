// Copy and limit math for the estimate attachment strip. Pure so the 10-file
// cap, the count label and the caption clip match everywhere without a DOM.
import { MAX_ATTACHMENTS, MAX_CAPTION_CHARS } from './limits';

export type AttachmentSlots = {
  /** Saved rows plus files still uploading/retrying. */
  used: number;
  /** How many more files the picker may accept. */
  room: number;
  atLimit: boolean;
};

export function attachmentSlots(saved: number, inFlight: number): AttachmentSlots {
  const used = Math.max(0, saved) + Math.max(0, inFlight);
  const room = Math.max(0, MAX_ATTACHMENTS - used);
  return { used, room, atLimit: used >= MAX_ATTACHMENTS };
}

/** "3 of 10" — the header's right side. */
export function attachmentCountLabel(saved: number): string {
  return `${Math.max(0, saved)} of ${MAX_ATTACHMENTS}`;
}

/** "Photo or PDF · 7 left". */
export function attachmentRoomLabel(room: number): string {
  return `Photo or PDF · ${Math.max(0, room)} left`;
}

/** The add sheet's subtitle: "7 of 10 left". */
export function attachmentSheetLabel(room: number): string {
  return `${Math.max(0, room)} of ${MAX_ATTACHMENTS} left`;
}

export function clipCaption(value: string): string {
  return value.slice(0, MAX_CAPTION_CHARS);
}

export function attachmentSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The tile's overlay label. */
export function uploadProgressLabel(status: 'preparing' | 'uploading' | 'failed', pct: number): string {
  if (status === 'preparing') return 'Preparing';
  if (status === 'failed') return 'Upload failed';
  return `${Math.min(100, Math.max(0, Math.round(pct)))}%`;
}
