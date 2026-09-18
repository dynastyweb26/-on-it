'use client';
// HTML → canvas → PDF. Renders the chosen template offscreen at A4 size,
// captures it, and returns a File ready for the native share sheet.
// Filename format: <PREFIX>-####_ClientName_Date_BusinessName.pdf — INV- for
// invoices (locked), Q- for quotes, so the two are distinct in the share sheet
// and the Vault.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { docPrefix } from '@/lib/documents';

const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '').slice(0, 24) || 'Client';

export function invoiceFilename(kind: string, no: number, client: string, business: string, date = new Date()) {
  const d = date.toISOString().slice(0, 10);
  return `${docPrefix(kind)}-${String(no).padStart(4, '0')}_${safe(client)}_${d}_${safe(business)}.pdf`;
}

/** Filename for the expense-summary export, e.g.
 *  Expense-Summary_2026_AcmePlumbing.pdf */
export function summaryFilename(periodLabel: string, business: string) {
  return `Expense-Summary_${safe(periodLabel)}_${safe(business)}.pdf`;
}

/** Wait for every <img> inside the node to finish decoding. html2canvas does not
 *  wait, so a slow logo (Supabase storage) rasterizes as a blank box. decode()
 *  rejects on a broken image — we swallow that so one bad logo can't block the
 *  whole document. */
async function awaitImages(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : img.decode().catch(() => undefined)
    )
  );
}

/** Measures data-pdf-link nodes in pageEl and attaches jsPDF link annotations to the active page */
function addPageLinks(pdf: jsPDF, pageEl: HTMLElement) {
  const elRect = pageEl.getBoundingClientRect();
  if (elRect.width <= 0) return;
  const ratio = 794 / elRect.width;
  pageEl.querySelectorAll<HTMLElement>('[data-pdf-link]').forEach((node) => {
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

/** el = the rendered template node (794px wide).
 *  PNG, not JPEG: flat color with fine text, often on near-black background.
 *  scale: 3 for crisp text edges.
 *  backgroundColor: null so templates paint their own background.
 *  Multi-page documents are measured and partitioned by DOM block rather than canvas-sliced,
 *  preserving split-free table rows and page-specific link annotations. */
export async function elementToPdf(el: HTMLElement, filename: string): Promise<File> {
  // Wait for web fonts before capture: html2canvas snapshots synchronously and
  // uses fallback-font metrics if the display font isn't ready yet, which
  // collapses letter spacing. Guarded — document.fonts is absent in older envs.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }
  await awaitImages(el);

  const fullHeight = el.scrollHeight || el.offsetHeight;
  const table = el.querySelector('table');
  const rows = table ? Array.from(table.querySelectorAll('tbody tr')) : [];

  // Single-page fast path: height fits in A4 or no expandable table rows
  if (fullHeight <= 1125 || rows.length <= 1) {
    const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: null });
    const pdf = new jsPDF({ unit: 'px', format: [794, 1123], compress: true });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 794, 1123);
    addPageLinks(pdf, el);
    const blob = pdf.output('blob');
    return new File([blob], filename, { type: 'application/pdf' });
  }

  // ── Multi-page DOM Block Partitioning ──────────────────────────
  const rowHeights = rows.map((r) => (r as HTMLElement).offsetHeight || 36);
  const tableHeader = table?.querySelector('thead') as HTMLElement | null;
  const tableHeaderHeight = tableHeader ? tableHeader.offsetHeight : 32;

  // Measure top content (masthead + meta) and bottom content
  const tableTop = table ? (table as HTMLElement).offsetTop : 200;
  const tableHeight = table ? (table as HTMLElement).offsetHeight : 300;
  const bottomHeight = Math.max(200, fullHeight - (tableTop + tableHeight));

  const page1Capacity = Math.max(200, 1060 - tableTop - tableHeaderHeight);
  const continuationCapacity = Math.max(300, 1040 - 80 - tableHeaderHeight); // continuation header ~80px

  // Partition row indices into pages
  const pageRowRanges: { start: number; end: number }[] = [];
  let currentRow = 0;
  const totalRows = rows.length;

  // Page 1 rows
  let p1Height = 0;
  let p1End = 0;
  while (p1End < totalRows && p1Height + rowHeights[p1End] <= page1Capacity) {
    p1Height += rowHeights[p1End];
    p1End++;
  }
  // Enforce orphan rule: if only 1 row left for Page 2+, pull one back unless Page 1 needs it
  if (p1End === totalRows - 1 && p1End > 2) {
    p1End--;
  }
  // Enforce widow rule: min 2 rows on Page 1 if any rows exist
  if (p1End < 2 && totalRows >= 2) {
    p1End = Math.min(2, totalRows);
  }
  pageRowRanges.push({ start: 0, end: p1End });
  currentRow = p1End;

  // Pages 2+. Pack each continuation page to the FULL continuation capacity.
  // The previous code reserved bottomHeight/2 on EVERY continuation page via an
  // `isLastPageAttempt` flag that was always true (pEnd starts at currentRow,
  // which is < totalRows on entry), so every page under-filled and the document
  // trailed off into a sparse, mostly-empty final page. Now the reservation
  // applies only to the page that actually carries the trailing blocks.
  while (currentRow < totalRows) {
    let pHeight = 0;
    let pEnd = currentRow;

    while (pEnd < totalRows && pHeight + rowHeights[pEnd] <= continuationCapacity) {
      pHeight += rowHeights[pEnd];
      pEnd++;
    }

    if (pEnd === currentRow) {
      // At least one row per page (a single row taller than the page).
      pEnd = currentRow + 1;
      pHeight = rowHeights[currentRow] || 0;
    }

    if (pEnd === totalRows) {
      // This page consumes the last row, so the trailing blocks (Totals,
      // Payment, Notes) get appended beneath its rows. Guarantee a full
      // bottomHeight of room so they can't overlap the table or be clipped by
      // the page's overflow:hidden. If the packed rows leave too little, pull
      // rows back (keeping at least one) so they spill onto a fresh final page
      // that does have room for the block.
      while (pEnd > currentRow + 1 && continuationCapacity - pHeight < bottomHeight) {
        pEnd--;
        pHeight -= rowHeights[pEnd];
      }
    } else if (pEnd === totalRows - 1 && pEnd - currentRow > 1) {
      // Not the last page: keep the widow guard so the next page never carries a
      // lone orphan row sitting by itself above the totals block.
      pEnd--;
    }

    pageRowRanges.push({ start: currentRow, end: pEnd });
    currentRow = pEnd;
  }

  const totalPages = pageRowRanges.length;

  // ── Build DOM Node per Page ───────────────────────────────────
  const pageNodes: HTMLElement[] = [];
  const offscreenContainer = document.createElement('div');
  offscreenContainer.style.position = 'fixed';
  offscreenContainer.style.left = '-9999px';
  offscreenContainer.style.top = '0px';
  document.body.appendChild(offscreenContainer);

  const getEffectiveBgAndColor = (node: HTMLElement) => {
    const child = (node.firstElementChild || node) as HTMLElement;

    let bg = node.style.backgroundColor || node.style.background || child.style.backgroundColor || child.style.background;
    let color = node.style.color || child.style.color;
    let fontFamily = node.style.fontFamily || child.style.fontFamily;

    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
      bg = getComputedStyle(node).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
        bg = getComputedStyle(child).backgroundColor;
      }
    }

    if (!color || color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
      color = getComputedStyle(node).color;
      if (!color || color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
        color = getComputedStyle(child).color;
      }
    }

    if (!fontFamily) {
      fontFamily = getComputedStyle(node).fontFamily || getComputedStyle(child).fontFamily;
    }

    const effectiveBg = (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') ? bg : '#FFFFFF';
    const effectiveColor = (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') ? color : '#000000';

    return { bg: effectiveBg, color: effectiveColor, fontFamily: fontFamily || "'Helvetica Neue', Arial, sans-serif" };
  };

  const { bg: computedBg, color: computedColor, fontFamily: computedFont } = getEffectiveBgAndColor(el);

  const businessName = el.querySelector('[data-pdf-business-name]')?.textContent?.trim() || '';
  const docNounStr = el.querySelector('[data-pdf-doc-noun]')?.textContent?.trim() || '';
  const docNumStr = el.querySelector('[data-pdf-doc-number]')?.textContent?.trim() || '';
  const docMark = (docNounStr && docNumStr) ? `${docNounStr} ${docNumStr}` : (docNounStr || docNumStr || 'INVOICE');

  for (let p = 0; p < totalPages; p++) {
    const range = pageRowRanges[p];

    if (p === 0) {
      // Page 1: Clone el content cleanly at full 794x1123 size
      const pageNode = document.createElement('div');
      pageNode.style.width = '794px';
      pageNode.style.height = '1123px';
      pageNode.style.boxSizing = 'border-box';
      pageNode.style.position = 'relative';
      pageNode.style.overflow = 'hidden';
      pageNode.style.backgroundColor = computedBg;
      pageNode.style.color = computedColor;
      pageNode.style.fontFamily = computedFont;
      pageNode.style.padding = '0px';

      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.width = '794px';
      clone.style.minHeight = '1123px';
      clone.style.height = '1123px';
      clone.style.boxSizing = 'border-box';
      clone.style.backgroundColor = computedBg;
      clone.style.color = computedColor;

      if (clone.firstElementChild) {
        const templateRoot = clone.firstElementChild as HTMLElement;
        templateRoot.style.width = '794px';
        templateRoot.style.minHeight = '1123px';
        templateRoot.style.height = '1123px';
        templateRoot.style.boxSizing = 'border-box';
        templateRoot.style.backgroundColor = computedBg;
      }

      // Hide rows not belonging to Page 1
      const cloneTable = clone.querySelector('table');
      if (cloneTable) {
        const cloneRows = Array.from(cloneTable.querySelectorAll('tbody tr'));
        cloneRows.forEach((r, idx) => {
          if (idx < range.start || idx >= range.end) {
            r.remove();
          }
        });
      }

      // If more pages exist, remove bottom trailing blocks from Page 1 using data-pdf-block
      if (totalPages > 1) {
        clone.querySelectorAll('[data-pdf-block]').forEach((b) => {
          // Keep ledger rail on page 1 if present
          if (b.getAttribute('data-pdf-block') !== 'ledger-rail') {
            b.remove();
          }
        });

        // Add Page 1 of M indicator
        const pageInd = document.createElement('div');
        pageInd.style.position = 'absolute';
        pageInd.style.right = '56px';
        pageInd.style.bottom = '14px';
        pageInd.style.fontSize = '11px';
        pageInd.style.opacity = '0.7';
        pageInd.textContent = `Page 1 of ${totalPages}`;
        clone.appendChild(pageInd);
      }

      pageNode.appendChild(clone);
      offscreenContainer.appendChild(pageNode);
      pageNodes.push(pageNode);
    } else {
      // Page 2+: Build continuation page
      const pageNode = document.createElement('div');
      pageNode.style.width = '794px';
      pageNode.style.height = '1123px';
      pageNode.style.boxSizing = 'border-box';
      pageNode.style.position = 'relative';
      pageNode.style.overflow = 'hidden';
      pageNode.style.backgroundColor = computedBg;
      pageNode.style.color = computedColor;
      pageNode.style.fontFamily = computedFont;
      pageNode.style.padding = '48px 56px';

      // 1. Continuation Header (Business name + document number only, ~50% masthead height)
      const contHeader = document.createElement('div');
      contHeader.style.display = 'flex';
      contHeader.style.justifyContent = 'space-between';
      contHeader.style.alignItems = 'center';
      contHeader.style.paddingBottom = '12px';
      contHeader.style.marginBottom = '20px';
      contHeader.style.borderBottom = `1px solid ${computedColor}33`;

      const leftHead = document.createElement('div');
      leftHead.style.fontWeight = '800';
      leftHead.style.fontSize = '16px';
      leftHead.style.lineHeight = '1.2';
      leftHead.style.color = computedColor;
      leftHead.textContent = businessName;

      const rightHead = document.createElement('div');
      rightHead.style.fontSize = '12px';
      rightHead.style.fontWeight = '700';
      rightHead.style.letterSpacing = '0.08em';
      rightHead.style.textTransform = 'uppercase';
      rightHead.style.opacity = '0.8';
      rightHead.style.color = computedColor;
      rightHead.textContent = docMark;

      contHeader.appendChild(leftHead);
      contHeader.appendChild(rightHead);
      pageNode.appendChild(contHeader);

      // 2. Table with repeated header and assigned rows
      if (table) {
        const pageTable = document.createElement('table');
        pageTable.style.width = '100%';
        pageTable.style.borderCollapse = 'collapse';
        pageTable.style.fontSize = '15px';

        if (tableHeader) {
          pageTable.appendChild(tableHeader.cloneNode(true));
        }

        const tbody = document.createElement('tbody');
        for (let rIdx = range.start; rIdx < range.end; rIdx++) {
          if (rows[rIdx]) {
            tbody.appendChild(rows[rIdx].cloneNode(true));
          }
        }
        pageTable.appendChild(tbody);
        pageNode.appendChild(pageTable);
      }

      // 3. Final Page: clone trailing blocks (Totals, PaymentBlock, Notes)
      if (p === totalPages - 1) {
        const trailingBlocks = Array.from(el.querySelectorAll('[data-pdf-block]')).filter(
          (b) => b.getAttribute('data-pdf-block') !== 'ledger-rail'
        );

        if (trailingBlocks.length > 0) {
          const trailingWrapper = document.createElement('div');
          trailingWrapper.style.marginTop = '24px';
          trailingWrapper.style.display = 'flex';
          trailingWrapper.style.flexDirection = 'column';
          trailingWrapper.style.gap = '20px';

          trailingBlocks.forEach((block) => {
            trailingWrapper.appendChild(block.cloneNode(true));
          });
          pageNode.appendChild(trailingWrapper);
        }
      }

      // Ledger special case (PDF-SPEC 6.5 & 9.4): drop payment rail on pages 2+
      pageNode.querySelectorAll('[data-pdf-block="ledger-rail"]').forEach((rail) => rail.remove());

      // 4. Page N of M Indicator
      const pageInd = document.createElement('div');
      pageInd.style.position = 'absolute';
      pageInd.style.right = '56px';
      pageInd.style.bottom = '14px';
      pageInd.style.fontSize = '11px';
      pageInd.style.opacity = '0.7';
      pageInd.textContent = `Page ${p + 1} of ${totalPages}`;
      pageNode.appendChild(pageInd);

      offscreenContainer.appendChild(pageNode);
      pageNodes.push(pageNode);
    }
  }

  // Render each page into jsPDF
  const pdf = new jsPDF({ unit: 'px', format: [794, 1123], compress: true });

  for (let p = 0; p < pageNodes.length; p++) {
    if (p > 0) {
      pdf.addPage([794, 1123]);
    }
    const pageNode = pageNodes[p];
    const canvas = await html2canvas(pageNode, {
      scale: 3,
      useCORS: true,
      backgroundColor: computedBg,
      width: 794,
      height: 1123,
      windowWidth: 794,
      windowHeight: 1123,
    });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 794, 1123);
    addPageLinks(pdf, pageNode);
  }

  // Cleanup offscreen container
  offscreenContainer.remove();

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
