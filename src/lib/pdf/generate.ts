'use client';
// HTML → canvas → PDF. Renders the chosen template offscreen at A4 size,
// captures it, and returns a File ready for the native share sheet.
// Filename format (locked): INV-####_ClientName_Date_BusinessName.pdf
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '').slice(0, 24) || 'Client';

export function invoiceFilename(no: number, client: string, business: string, date = new Date()) {
  const d = date.toISOString().slice(0, 10);
  return `INV-${String(no).padStart(4, '0')}_${safe(client)}_${d}_${safe(business)}.pdf`;
}

/** el = the rendered template node (794px wide). */
export async function elementToPdf(el: HTMLElement, filename: string): Promise<File> {
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: null });
  const pdf = new jsPDF({ unit: 'px', format: [794, 1123], compress: true });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 794, 1123);

  // Tappable payment links: templates mark elements with data-pdf-link.
  // Positions are measured against the live DOM and normalized to PDF
  // coordinates, so on-screen scale() transforms don't skew the boxes.
  const elRect = el.getBoundingClientRect();
  if (elRect.width > 0) {
    const ratio = 794 / elRect.width;
    el.querySelectorAll<HTMLElement>('[data-pdf-link]').forEach((node) => {
      const url = node.dataset.pdfLink;
      if (!url) return;
      const r = node.getBoundingClientRect();
      pdf.link(
        (r.left - elRect.left) * ratio,
        (r.top - elRect.top) * ratio,
        r.width * ratio,
        r.height * ratio,
        { url }
      );
    });
  }

  const blob = pdf.output('blob');
  return new File([blob], filename, { type: 'application/pdf' });
}

/** Native share sheet — the locked send mechanism (no Twilio).
 *  'cancelled' means the user dismissed the share sheet: a normal choice, not a
 *  failure and NOT a send — the caller leaves the invoice unsent. Any OTHER
 *  share error falls through to a download so the user still gets their file. */
export async function shareInvoice(file: File, clientName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name, text: `Invoice for ${clientName}` });
      return 'shared';
    } catch (err) {
      // User dismissed the sheet → cancel (don't download, don't mark sent).
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      /* any other share error — fall through to download */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
