'use client';
// TEMPORARY — remove before merge. Four buttons, each building one PDF from
// the mock source and handing it to the share sheet, like the Summary screen.
import { useState } from 'react';
import Icon from '@/components/Icon';
import { buildSummaryPdf, type SummaryPdfKind, type SummaryPdfDetail } from '@/lib/pdf/build-summary';
import { shareInvoice } from '@/lib/pdf/generate';
import { mockSource, MOCK_RANGE, MOCK_PERIOD_LABEL, MOCK_COUNTS } from './mock-data';

const SAMPLES: { kind: SummaryPdfKind; detail: SummaryPdfDetail; label: string }[] = [
  { kind: 'income', detail: 'detailed', label: 'Income Itemized' },
  { kind: 'income', detail: 'summary', label: 'Income Totals' },
  { kind: 'expenses', detail: 'detailed', label: 'Expenses Detailed' },
  { kind: 'expenses', detail: 'summary', label: 'Expenses Summary' },
];

export default function PdfSamples() {
  const [building, setBuilding] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function build(s: (typeof SAMPLES)[number]) {
    if (building) return;
    setBuilding(s.label);
    setStatus('');
    const t0 = performance.now();
    try {
      const file = await buildSummaryPdf(
        { kind: s.kind, detail: s.detail, range: MOCK_RANGE, periodLabel: MOCK_PERIOD_LABEL },
        mockSource,
      );
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      const how = await shareInvoice(file, 'Sample', s.label);
      setStatus(`${file.name} · ${Math.round(file.size / 1024)} KB · ${secs}s · ${how}`);
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBuilding(null);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <h1 className="font-display text-headline-mobile font-extrabold text-on-background">PDF samples</h1>
      <p className="text-body-md text-on-surface-variant">
        Dev only, removed before merge. Mock data for {MOCK_PERIOD_LABEL}: {MOCK_COUNTS.payments} payments across{' '}
        {MOCK_COUNTS.clients} clients, {MOCK_COUNTS.expenses} expenses. Nothing is read from or written to the database.
      </p>
      <div className="grid gap-3">
        {SAMPLES.map((s) => (
          <button key={s.label} className="btn-primary" disabled={building !== null} onClick={() => build(s)}>
            <Icon name="download" size={20} /> {building === s.label ? 'Building…' : s.label}
          </button>
        ))}
      </div>
      {status && <p className="break-all text-xs text-on-surface-variant">{status}</p>}
    </main>
  );
}
