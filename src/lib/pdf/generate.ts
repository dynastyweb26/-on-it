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
  const blob = pdf.output('blob');
  return new File([blob], filename, { type: 'application/pdf' });
}

/** Native share sheet — the locked send mechanism (no Twilio). */
export async function shareInvoice(file: File, clientName: string): Promise<'shared' | 'downloaded'> {
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name, text: `Invoice for ${clientName}` });
      return 'shared';
    } catch {
      /* user cancelled — fall through to download */
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
