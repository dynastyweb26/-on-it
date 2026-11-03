'use client';
// The summary's controls: two compact PDF pills, the chart's period, and the
// grain it is drawn at. 44px tap targets with a 34px visual, as the design has.
//
// The grain options follow the period: All time can be read by month or by
// year, a short range by week or by month. When the chosen grain is not offered
// for the new period the control falls back to Months rather than showing a
// toggle with nothing selected.
import Icon from '@/components/Icon';
import SegmentedControl from '@/components/SegmentedControl';
import {
  CHART_PRESETS, grainOptions, type ChartGrain, type ChartPreset,
} from '@/lib/books-chart';
import type { SummaryPdfKind } from '@/lib/pdf/build-summary';

const GRAIN_LABEL: Record<ChartGrain, string> = {
  week: 'Weeks',
  month: 'Months',
  year: 'Years',
};

export default function SummaryControls({
  preset, onPreset, grain, onGrain, onExport, exporting, canIncome, canExpenses, disabled,
}: {
  preset: ChartPreset;
  onPreset: (preset: ChartPreset) => void;
  grain: ChartGrain;
  onGrain: (grain: ChartGrain) => void;
  onExport: (kind: SummaryPdfKind) => void;
  exporting: SummaryPdfKind | null;
  canIncome: boolean;
  canExpenses: boolean;
  disabled: boolean;
}) {
  const grains = grainOptions(preset);
  const pill = (kind: SummaryPdfKind, label: string, enabled: boolean) => (
    <button
      type="button"
      aria-haspopup="dialog"
      disabled={disabled || exporting !== null || !enabled}
      onClick={() => onExport(kind)}
      className="flex min-h-[44px] items-center rounded-full border-[1.5px] border-outline-variant bg-surface-container-lowest px-1.5 transition-transform active:scale-[0.97] disabled:opacity-40"
    >
      <span className="flex h-[34px] items-center gap-1.5 rounded-full bg-primary-soft px-3 text-[13px] font-bold text-primary">
        <Icon name="download" size={16} />
        {exporting === kind ? 'Building…' : label}
      </span>
    </button>
  );

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {pill('income', 'Income PDF', canIncome)}
        {pill('expenses', 'Expenses PDF', canExpenses)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-[44px] items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest px-3.5 text-[13px] font-semibold text-on-surface-variant">
          <span className="sr-only">Chart period</span>
          <Icon name="schedule" size={18} />
          <select
            value={preset}
            disabled={disabled}
            onChange={(e) => onPreset(e.target.value as ChartPreset)}
            aria-label="Chart period"
            className="min-h-[34px] bg-transparent text-[14px] font-semibold text-on-background outline-none"
          >
            {CHART_PRESETS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <SegmentedControl
          label="Chart grain"
          value={grain}
          onChange={onGrain}
          options={grains.map((value) => ({ value, label: GRAIN_LABEL[value] })) as never}
        />
      </div>
    </div>
  );
}
