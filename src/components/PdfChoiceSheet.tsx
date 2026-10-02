'use client';
// The Totals / Itemized choice for a books PDF, as a bottom sheet (the period
// picker's pattern). Shared by the Summary screen and the recap sheet; the
// caller owns what happens on a pick (buildSummaryPdf + share) and its own
// Escape / scroll-lock handling. z-[80] so it also sits above the recap sheet.
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import type { SummaryPdfKind, SummaryPdfDetail } from '@/lib/pdf/build-summary';

export default function PdfChoiceSheet({ kind, onPick, onClose }: {
  kind: SummaryPdfKind | null;
  onPick: (detail: SummaryPdfDetail) => void;
  onClose: () => void;
}) {
  if (!kind) return null;
  const title = kind === 'expenses' ? 'Expenses PDF' : 'Income PDF';
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-on-background/45"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-t-card bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card-raised"
        style={{ animation: 'paywall-in 200ms ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 px-1 text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
          {title}
        </div>
        <PdfOption
          icon="description"
          title="Totals"
          detail={kind === 'expenses' ? 'Totals by category' : 'Totals by client'}
          onClick={() => onPick('totals')}
        />
        <div className="my-1 border-t border-outline-variant/40" />
        <PdfOption
          icon="receipt_long"
          title="Itemized"
          detail={kind === 'expenses'
            ? 'Every expense with date, store and amount'
            : 'Every payment with date, invoice and amount'}
          onClick={() => onPick('itemized')}
        />
      </div>
    </div>
  );
}

// One choice in the PDF sheet: icon, title, and what the document contains.
function PdfOption({ icon, title, detail, onClick }: { icon: IconName; title: string; detail: string; onClick: () => void }) {
  return (
    <button
      className="flex min-h-touch w-full items-center gap-3 rounded-input px-3 py-3 text-left active:bg-surface-container transition-colors"
      onClick={onClick}
    >
      <Icon name={icon} size={24} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-on-background">{title}</span>
        <span className="block text-xs text-on-surface-variant">{detail}</span>
      </span>
      <Icon name="chevron_right" size={20} className="shrink-0 text-on-surface-variant" />
    </button>
  );
}
