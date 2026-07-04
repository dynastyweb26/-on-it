'use client';
// ═══ Net Spend Dashboard ═══
// One glance: money in, money out, what's still owed, tax-deductible total.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function Dashboard() {
  const supabase = createClient();
  const [stats, setStats] = useState({ paid: 0, outstanding: 0, spent: 0, deductible: 0, count: 0 });

  useEffect(() => {
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const [{ data: invs }, { data: exps }] = await Promise.all([
        supabase.from('invoices').select('total, status, kind').eq('kind', 'invoice'),
        supabase.from('expenses').select('amount, tax_deductible, spent_on'),
      ]);
      const paid = (invs ?? []).filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.total), 0);
      const outstanding = (invs ?? []).filter((i) => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + Number(i.total), 0);
      const spent = (exps ?? []).reduce((s, e) => s + Number(e.amount), 0);
      const deductible = (exps ?? []).filter((e) => e.tax_deductible).reduce((s, e) => s + Number(e.amount), 0);
      setStats({ paid, outstanding, spent, deductible, count: invs?.length ?? 0 });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const net = stats.paid - stats.spent;
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="card bg-ink text-paper">
        <div className="text-xs uppercase tracking-widest text-paper/60">Net (all time)</div>
        <div className={`font-mono text-4xl font-bold ${net >= 0 ? 'text-gold-light' : 'text-red-400'}`}>
          {money(net)}
        </div>
        <div className="mt-1 text-xs text-paper/50">{stats.count} invoices created</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Collected" value={money(stats.paid)} tone="text-green-700" />
        <Stat label="Still owed" value={money(stats.outstanding)} tone="text-gold" />
        <Stat label="Spent" value={money(stats.spent)} tone="text-red-700" />
        <Stat label="Tax deductible" value={money(stats.deductible)} tone="text-ink" />
      </div>
      <a href="/expenses" className="card block text-center font-semibold text-gold">
        See all expenses →
      </a>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-ink/50">{label}</div>
      <div className={`font-mono text-xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}
