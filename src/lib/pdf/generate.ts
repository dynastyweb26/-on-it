'use client';
// HTML → canvas → PDF. Renders the chosen template offscreen at A4 size,
// captures it, and returns a File ready for the native share sheet.
// Filename format: <PREFIX>-####_ClientName_Date_BusinessName.pdf — INV- for
// invoices (locked), Q- for quotes, so the two are distinct in the share sheet
// and the Vault.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { docPrefix } from '@/lib/documents';

const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '').slice(0, 24) || 'Customer';

export function invoiceFilename(kind: string, no: number, client: string, business: string, date = new Date()) {
  const d = date.toISOString().slice(0, 10);
  return `${docPrefix(kind)}-${String(no).padStart(4, '0')}_${safe(client)}_${d}_${safe(business)}.pdf`;
}

/** Filename for the expense-summary export, e.g.
 *  Expense-Summary_2026_AcmePlumbing.pdf */
export function summaryFilename(periodLabel: string, business: string) {
  return `Expense-Summary_${safe(periodLabel)}_${safe(business)}.pdf`;
}

/** el = the rendered template node (794px wide). */
export async function elementToPdf(el: HTMLElement, filename: string): Promise<File> {
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const pdf = new jsPDF({ unit: 'px', format: [794, 1123], compress: true });

  const pageHeight = 1123;
  const totalHeight = canvas.height / 2; // canvas scale is 2
  const pageCount = Math.max(1, Math.ceil(totalHeight / pageHeight));

  for (let page = 0; page < pageCount; page++) {
    if (page > 0) pdf.addPage([794, 1123]);

    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.min(canvas.height - page * pageHeight * 2, pageHeight * 2);

    const ctx = pageCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        page * pageHeight * 2,
        canvas.width,
        pageCanvas.height,
        0,
        0,
        canvas.width,
        pageCanvas.height
      );
    }

    pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 794, pageCanvas.height / 2);

    // Footer "Page N of M"
    if (pageCount > 1) {
      pdf.setFontSize(9);
      pdf.setTextColor(120, 120, 120);
      pdf.text(`Page ${page + 1} of ${pageCount}`, 794 / 2, 1123 - 20, { align: 'center' });
    }
  }

  // Tappable payment links: templates mark elements with data-pdf-link.
  const elRect = el.getBoundingClientRect();
  if (elRect.width > 0) {
    const ratio = 794 / elRect.width;
    el.querySelectorAll<HTMLElement>('[data-pdf-link]').forEach((node) => {
      const url = node.dataset.pdfLink;
      if (!url) return;
      const r = node.getBoundingClientRect();
      const topPos = (r.top - elRect.top) * ratio;
      const targetPage = Math.floor(topPos / pageHeight);
      const pageTop = topPos % pageHeight;

      if (targetPage < pageCount) {
        pdf.setPage(targetPage + 1);
        pdf.link(
          (r.left - elRect.left) * ratio,
          pageTop,
          r.width * ratio,
          r.height * ratio,
          { url }
        );
      }
    });
  }

  const blob = pdf.output('blob');
  return new File([blob], filename, { type: 'application/pdf' });
}

/** Trigger a browser download of a File without sending it anywhere. Used by the
 *  explicit download controls (confirm card, invoice detail) and as shareInvoice's
 *  non-share fallback. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Native share sheet — the locked send mechanism (no Twilio).
 *  'cancelled' means the user dismissed the share sheet: a normal choice, not a
 *  failure and NOT a send — the caller leaves the invoice unsent. Any OTHER
 *  share error falls through to a download so the user still gets their file. */
export async function shareInvoice(file: File, clientName: string, noun = 'Invoice'): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name, text: `${noun} for ${clientName}` });
      return 'shared';
    } catch (err) {
      // User dismissed the sheet → cancel (don't download, don't mark sent).
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      /* any other share error — fall through to download */
    }
  }
  downloadFile(file);
  return 'downloaded';
}
