'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import InvoicesSkeleton from '@/components/InvoicesSkeleton';
import { createClient } from '@/lib/supabase/client';
import { formatDocNumber } from '@/lib/documents';

interface Row {
  id: string; kind: string; invoice_number: number; client_name: string;
  total: number; amount_paid?: number; status: string; created_at: string; due_date: string | null;
  converted_from: string | null;
}
const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

// Status chips (§2): semantic containers, ALWAYS icon + text.
const STATUS_CHIP: Record<string, { cls: string; icon: string }> = {
  paid: { cls: 'bg-paid-container text-paid', icon: 'check_circle' },
  sent: { cls: 'bg-sent-container text-sent', icon: 'send' },
  overdue: { cls: 'bg-error-container text-on-error-container', icon: 'warning' },
  draft: { cls: 'bg-draft-container text-draft', icon: 'history' },
  void: { cls: 'bg-draft-container text-draft line-through', icon: 'block' },
};

export default function Invoices() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid' | 'quote'>('all');

  useEffect(() => {
    supabase
      .from('invoices')
      .select('id, kind, invoice_number, client_name, total, amount_paid, status, created_at, due_date, converted_from')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A quote that has already become an invoice: some invoice row points back to
  // it via converted_from. Derived from the fetched rows, so no extra query.
  const convertedQuoteIds = new Set(
    rows.map((r) => r.converted_from).filter((id): id is string => Boolean(id)),
  );
  const isConvertedQuote = (r: Row) => r.kind === 'quote' && convertedQuoteIds.has(r.id);

  const filtered = rows.filter((r) =>
    // Hide converted quotes from the main views so one job doesn't read as two
    // documents. They stay reachable under the Quotes tab.
    filter === 'all' ? !isConvertedQuote(r)
    : filter === 'unpaid' ? ['sent', 'overdue'].includes(r.status)
    : filter === 'paid' ? r.status === 'paid'
    : r.kind === 'quote'
  );
  // One ordering for EVERY tab (All / Unpaid / Paid / Quotes): newest first, then
  // client name A→Z. This is a client-side sort applied to the filtered set, so it
  // is the source of truth for display — the query's .order('created_at') alone is
  // not enough (this sort previously ranked by status then total, which overrode
  // it). created_at is the invoice's displayed date; ISO timestamps compare
  // chronologically, so comparing b→a gives newest→oldest.
  const sorted = [...filtered].sort((a, b) =>
    b.created_at.localeCompare(a.created_at) ||        // Tier 1: newest → oldest
    a.client_name.localeCompare(b.client_name));       // Tier 2: client name A→Z

  return (
    <div className="px-4 py-4">
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {(['all', 'unpaid', 'paid', 'quote'] as const).map((f) => (
          <button key={f} className={`chip shrink-0 capitalize ${filter === f ? 'chip-selected' : ''}`}
            onClick={() => setFilter(f)}>{f === 'quote' ? 'Quotes' : f}</button>
        ))}
      </div>
      {loading ? (
        <InvoicesSkeleton />
      ) : (
        <>
          {sorted.length === 0 && (
            <p className="mt-16 text-center text-on-surface-variant">
              Nothing here yet. Head to Chat and tell me about a job.
            </p>
          )}
          {(() => {
            const groups: { dateLabel: string; items: Row[] }[] = [];
            sorted.forEach((r) => {
              const d = new Date(r.created_at);
              const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              const lastGroup = groups[groups.length - 1];
              if (lastGroup && lastGroup.dateLabel === dateLabel) {
                lastGroup.items.push(r);
              } else {
                groups.push({ dateLabel, items: [r] });
              }
            });

            return (
              <div className="space-y-6">
                {groups.map((group) => (
                  <div key={group.dateLabel} className="space-y-3">
                    <div className="flex justify-center">
                      <span className="inline-block rounded-full bg-[#d4af37] px-3 py-1 text-xs font-bold text-[#1a1a1a]">
                        {group.dateLabel}
                      </span>
                    </div>
                    {group.items.map((r) => {
                      const converted = isConvertedQuote(r);
                      const total = Number(r.total ?? 0);
                      const amountPaid = Number(r.amount_paid ?? 0);
                      const remaining = total - amountPaid;
                      const isPartial = r.kind === 'invoice' && amountPaid > 0 && amountPaid < total;

                      const chip = converted
                        ? { cls: 'bg-sent-container text-sent', icon: 'sync', label: 'converted' }
                        : isPartial
                        ? { cls: 'bg-amber-100 text-amber-900 font-bold', icon: 'pie_chart', label: 'PARTIAL' }
                        : STATUS_CHIP[r.status] ? { ...STATUS_CHIP[r.status], label: r.status } : { ...STATUS_CHIP.draft, label: r.status };

                      const displayAmount = isPartial ? remaining : total;

                      return (
                        <Link key={r.id} href={`/invoices/${r.id}`}
                          className="card block p-5 transition-transform active:scale-[0.98]">
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-display text-headline-mobile text-on-background">{r.client_name}</div>
                              <div className="text-body-md text-on-surface-variant/70">
                                {formatDocNumber(r.kind, r.invoice_number)}
                              </div>
                            </div>
                            <span className={`status-chip shrink-0 uppercase ${chip.cls}`}>
                              <Icon name={chip.icon} size={18} />
                              {chip.label}
                            </span>
                          </div>
                          <div className="flex items-end justify-between">
                            <div>
                              <div className="font-display text-numeric-xl tracking-tight text-on-background">{money(displayAmount)}</div>
                              {isPartial && (
                                <div className="text-xs font-medium text-on-surface-variant/80">
                                  Remaining of {money(total)}
                                </div>
                              )}
                            </div>
                            <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-variant/50 text-primary">
                              <Icon name="chevron_right" size={24} />
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
