// Visual Chat Chart Component for rendering responsive financial summaries directly in chat.
import React from 'react';

export interface VisualChartProps {
  title: string;
  period: 'week' | 'month' | 'year';
  revenue: number;
  expenses: number;
  netIncome: number;
  categories?: { category: string; amount: number; percentage: number }[];
}

export function VisualChart({ title, period, revenue, expenses, netIncome, categories }: VisualChartProps) {
  const formatMoney = (val: number) => `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const maxVal = Math.max(revenue, expenses, 1);

  return (
    <div className="w-full bg-[#FFF8F0] border border-[#E8DCC4] rounded-2xl p-4 shadow-sm my-2 text-[#2C221E] font-sans">
      <div className="flex items-center justify-between border-b border-[#E8DCC4] pb-2 mb-3">
        <h4 className="font-semibold text-sm tracking-tight text-[#2C221E]">{title}</h4>
        <span className="text-xs uppercase px-2 py-0.5 rounded bg-[#E8DCC4] text-[#735C00] font-bold">
          {period}
        </span>
      </div>

      {/* Bar Comparison */}
      <div className="space-y-2 mb-4">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium text-[#735C00]">Revenue</span>
            <span className="font-bold">{formatMoney(revenue)}</span>
          </div>
          <div className="w-full bg-[#E8DCC4]/50 h-3 rounded-full overflow-hidden">
            <div
              className="bg-[#2D5A27] h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (revenue / maxVal) * 100)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium text-[#8B0000]">Expenses</span>
            <span className="font-bold">{formatMoney(expenses)}</span>
          </div>
          <div className="w-full bg-[#E8DCC4]/50 h-3 rounded-full overflow-hidden">
            <div
              className="bg-[#B22222] h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (expenses / maxVal) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Net Income Line */}
      <div className="flex justify-between items-center bg-[#E8DCC4]/30 rounded-lg p-2 text-xs">
        <span className="font-medium">Net Income</span>
        <span className={`font-bold ${netIncome >= 0 ? 'text-[#2D5A27]' : 'text-[#B22222]'}`}>
          {formatMoney(netIncome)}
        </span>
      </div>

      {/* Optional Category Breakdown */}
      {categories && categories.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#E8DCC4]">
          <h5 className="text-xs font-semibold mb-2">Category Breakdown</h5>
          <div className="space-y-1.5">
            {categories.slice(0, 4).map((c, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-gray-600 truncate max-w-[140px]">{c.category}</span>
                <span className="font-medium">{formatMoney(c.amount)} ({c.percentage.toFixed(0)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
