'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface Row {
  id: string; kind: string; invoice_number: number; client_name: string;
  total: number; status: string; created_at: string; due_date: string | null;
}
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  sent: 'bg-gold/15 text-gold',
  overdue: 'bg-red-100 text-red-700',
  draft: 'bg-paper-dim text-ink/60',
  void: 'bg-paper-dim text-ink/40 line-through',
};

export default function Invoices() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid' | 'quote'>('all');

  useEffect(() => {
    supabase
      .from('invoices')
      .select('id, kind, invoice_number, client_name, total, status, created_at, due_date')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => setRows((data as Row[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = rows.filter((r) =>
    filter === 'all' ? true
    : filter === 'unpaid' ? ['sent', 'overdue'].includes(r.status)
    : filter === 'paid' ? r.status === 'paid'
    : r.kind === 'quote'
  );
  // Cash flow visibility: unpaid first, biggest first
  const sorted = [...filtered].sort((a, b) => {
    const rank = (r: Row) => (r.status === 'overdue' ? 0 : r.status === 'sent' ? 1 : 2);
    return rank(a) - rank(b) || b.total - a.total;
  });

  return (
    <div className="px-4 py-4">
      <div className="mb-4 flex gap-2">
        {(['all', 'unpaid', 'paid', 'quote'] as const).map((f) => (
          <button key={f} className={`chip capitalize ${filter === f ? 'chip-selected' : ''}`}
            onClick={() => setFilter(f)}>{f === 'quote' ? 'Quotes' : f}</button>
        ))}
      </div>
      {sorted.length === 0 && (
        <p className="mt-16 text-center text-ink/50">
          Nothing here yet. Head to Chat and tell me about a job.
        </p>
      )}
      <div className="space-y-2">
        {sorted.map((r) => (
          <Link key={r.id} href={`/invoices/${r.id}`} className="card flex items-center justify-between">
            <div>
              <div className="font-semibold">{r.client_name}</div>
              <div className="text-xs text-ink/50">
                {r.kind === 'quote' ? 'QTE' : 'INV'}-{String(r.invoice_number).padStart(4, '0')}
                {' · '}{new Date(r.created_at).toLocaleDateString()}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold">{money(r.total)}</div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_STYLE[r.status] ?? ''}`}>
                {r.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
