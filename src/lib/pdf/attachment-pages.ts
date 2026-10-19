// ═══ Attachment pages ═══
// An invoice/quote's attached images print on their own A4 pages, two per
// sheet, appended AFTER every page the document itself produced — so they
// always follow the invoice body and the payment-processors ("How to pay")
// block, by construction.
//
// Deliberately dependency-free: it talks to a tiny structural interface
// instead of importing jsPDF, so its page math can be unit-tested in Node
// (generate.ts passes the real jsPDF instance). Max 6 images, so at most 3
// extra pages.

/** Hard cap on images per document (also enforced by invoice_attachments.position ≤ 5). */
export const ATTACHMENT_MAX = 6;

const PAGE_W = 794;   // A4 @ 96dpi, matches the template capture
const PAGE_H = 1123;
const MARGIN = 40;    // uniform page margin
const GAP = 24;       // gap between the two stacked cells

export interface PdfAttachment {
  /** Data URL. The caller has already fetched and encoded the bytes, so there
   *  is no CORS / canvas-taint risk when html2canvas or jsPDF reads it. */
  dataUrl: string;
  /** Natural pixel size — used to fit the image without ever upscaling it. */
  width: number;
  height: number;
}

/** The slice of jsPDF this module needs. A real jsPDF is structurally
 *  assignable; a test can pass a recorder instead. */
export interface PdfPageTarget {
  addPage(format: [number, number]): unknown;
  setFillColor(r: number, g: number, b: number): unknown;
  rect(x: number, y: number, w: number, h: number, style: string): unknown;
  addImage(dataUrl: string, format: string, x: number, y: number, w: number, h: number): unknown;
  setFontSize(size: number): unknown;
  setTextColor(r: number, g: number, b: number): unknown;
  text(text: string, x: number, y: number, options?: { align?: string }): unknown;
}

/** Page-number footer for the attachment pages, continuing the invoice's own
 *  "Page X of N". Attachment page k (0-based) prints `Page (from + k) of total`;
 *  generate.ts passes the running page number so the whole document numbers as
 *  one sequence. */
export interface AttachmentFooter {
  from: number;
  total: number;
  /** Blended label colour (the invoice footer is the template text at 0.7
   *  opacity, so the jsPDF-drawn pages match it). */
  color: [number, number, number];
}

/** Extra pages `n` attachments need: 2 per page, capped at ATTACHMENT_MAX. */
export const attachmentPageCount = (n: number) => Math.ceil(Math.min(Math.max(n, 0), ATTACHMENT_MAX) / 2);

const formatOf = (dataUrl: string) => (dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG');

/** `#rgb` / `#rrggbb` / `rgb()` → [r,g,b]; anything else falls back to white. */
export function hexToRgb(color: string): [number, number, number] {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color ?? '').trim());
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(([^)]+)\)/i.exec(color ?? '');
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((v) => parseInt(v, 10));
    if ([r, g, b].every((n) => Number.isFinite(n))) return [r, g, b];
  }
  return [255, 255, 255];
}

/** Where image `a` sits inside cell `j` on its page (0 = top, 1 = bottom):
 *  scaled to fit the cell, centred, never upscaled past its natural size. */
export function attachmentCell(a: PdfAttachment, j: 0 | 1): { x: number; y: number; w: number; h: number } {
  const cellW = PAGE_W - MARGIN * 2;
  const cellH = (PAGE_H - MARGIN * 2 - GAP) / 2;
  const cellTop = MARGIN + j * (cellH + GAP);
  const scale = Math.min(cellW / a.width, cellH / a.height, 1);
  const w = a.width * scale;
  const h = a.height * scale;
  return { x: MARGIN + (cellW - w) / 2, y: cellTop + (cellH - h) / 2, w, h };
}

/** Append the attachment pages to an already-built document. The caller must
 *  have written every invoice page FIRST, so attachments land last (after the
 *  payment-processors block). `background` is the document's canvas colour, so
 *  the added pages match the invoice (dark templates stay dark). */
export function appendAttachmentPages(
  pdf: PdfPageTarget,
  attachments: readonly PdfAttachment[],
  background: string,
  footer?: AttachmentFooter,
): number {
  const list = attachments.slice(0, ATTACHMENT_MAX);
  const [r, g, b] = hexToRgb(background);
  for (let i = 0, page = 0; i < list.length; i += 2, page++) {
    pdf.addPage([PAGE_W, PAGE_H]);
    pdf.setFillColor(r, g, b);
    pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');
    list.slice(i, i + 2).forEach((a, j) => {
      const c = attachmentCell(a, j as 0 | 1);
      pdf.addImage(a.dataUrl, formatOf(a.dataUrl), c.x, c.y, c.w, c.h);
    });
    // Number in the same sequence as the invoice pages (matches the DOM
    // footer: right 56px, ~14px off the bottom, 11px).
    if (footer && footer.total > 1) {
      pdf.setFontSize(11);
      pdf.setTextColor(footer.color[0], footer.color[1], footer.color[2]);
      pdf.text(`Page ${footer.from + page} of ${footer.total}`, PAGE_W - 56, PAGE_H - 18, { align: 'right' });
    }
  }
  return attachmentPageCount(list.length);
}
