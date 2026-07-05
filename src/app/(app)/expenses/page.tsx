'use client';
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function Expenses() {
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('expenses').select('*').order('spent_on', { ascending: false }).limit(200)
      .then(({ data }) => setRows(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleDeductible(id: string, current: boolean) {
    await supabase.from('expenses').update({ tax_deductible: !current }).eq('id', id);
    setRows((r) => r.map((e) => (e.id === id ? { ...e, tax_deductible: !current } : e)));
  }

  return (
    <div className="px-4 py-4">
      <p className="mb-3 text-sm text-ink/60">
        Log expenses from Chat — just say “spent 80 on paint at Home Depot.”
      </p>
      {rows.length === 0 && <p className="mt-16 text-center text-ink/50">No expenses yet.</p>}
      <div className="space-y-2">
        {rows.map((e) => (
          <div key={e.id} className="card flex items-center justify-between">
            <div>
              <div className="font-medium">{e.description}</div>
              <div className="text-xs text-ink/50">
                {e.category ?? 'Uncategorized'} · {new Date(e.spent_on).toLocaleDateString()}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold">{money(Number(e.amount))}</div>
              <button
                className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase ${e.tax_deductible ? 'text-paid' : 'text-on-surface-variant/60'}`}
                onClick={() => toggleDeductible(e.id, e.tax_deductible)}>
                {e.tax_deductible && <Icon name="check_circle" size={14} />}
                {e.tax_deductible ? 'deductible' : 'not deductible'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
