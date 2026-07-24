'use client';
// ═══ Books — every expense, newest first ═══
// Reached from the Books tab. Receipt photos live in a PRIVATE bucket, so
// thumbnails are signed URLs, batch-signed in one round trip rather than one
// request per row.
import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { CATEGORY_LABEL, isExpenseCategory } from '@/lib/expenses';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** yyyy-mm-dd read as LOCAL — `new Date('2026-07-12')` is UTC midnight and
 *  renders as the 11th for anyone behind UTC. */
function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

interface ExpenseRow {
  id: string;
  amount: number;
  category: string;
  vendor: string | null;
  description: string | null;
  spent_on: string;
  receipt_url: string | null;
  tax_deductible: boolean;
}

const SIGNED_URL_TTL = 3600;

export default function Books() {
  const supabase = createClient();
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({}); // storage path → signed URL
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    // spent_on is the user-facing date; created_at breaks ties so two expenses
    // logged on the same day keep a stable, genuinely-newest-first order.
    const { data } = await supabase
      .from('expenses')
      .select('id, amount, category, vendor, description, spent_on, receipt_url, tax_deductible')
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);

    const list = (data ?? []) as ExpenseRow[];
    setRows(list);
    setLoading(false);

    const paths = list.map((r) => r.receipt_url).filter((p): p is string => Boolean(p));
    if (!paths.length) return;
    const { data: signed } = await supabase.storage.from('receipts').createSignedUrls(paths, SIGNED_URL_TTL);
    if (!signed) return;
    // flatMap rather than filter+map: `path` is nullable on the response type
    // and a filter callback doesn't narrow it for the map that follows.
    setThumbs(Object.fromEntries(
      signed.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : []))
    ));
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function toggleDeductible(id: string, current: boolean) {
    // Optimistic: the toggle is the whole interaction, so it must feel instant.
    setRows((r) => r.map((e) => (e.id === id ? { ...e, tax_deductible: !current } : e)));
    const { error } = await supabase.from('expenses').update({ tax_deductible: !current }).eq('id', id);
    if (error) setRows((r) => r.map((e) => (e.id === id ? { ...e, tax_deductible: current } : e)));
  }

  return (
    <div className="px-4 py-4">
      {loading && <p className="mt-16 text-center text-on-surface-variant">Loading your books…</p>}

      {!loading && rows.length === 0 && (
        <div className="mt-16 text-center">
          <Icon name="receipt_long" size={40} className="text-primary" />
          <p className="mt-2 text-body-md text-on-surface-variant">
            Snap a receipt in Chat, or just say &ldquo;spent 45 on gas at Shell.&rdquo;
            <br />I&apos;ll file it here.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((e) => {
          const thumb = e.receipt_url ? thumbs[e.receipt_url] : null;
          const label = e.vendor || e.description || 'Expense';
          const category = isExpenseCategory(e.category) ? CATEGORY_LABEL[e.category] : 'Other';
          return (
            <div key={e.id} className="card flex items-center gap-3">
              {thumb ? (
                <button
                  aria-label={`View the receipt from ${label}`}
                  onClick={() => setLightbox(thumb)}
                  className="shrink-0 transition active:scale-95"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumb}
                    alt=""
                    className="h-14 w-14 rounded-input border border-outline-variant/40 object-cover"
                  />
                </button>
              ) : (
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-input bg-surface-container text-on-surface-variant/60">
                  <Icon name={e.receipt_url ? 'image' : 'shopping_cart'} size={22} />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{label}</div>
                <div className="text-xs text-on-surface-variant">
                  {category} · {localDate(e.spent_on).toLocaleDateString()}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="font-display font-bold">{money(Number(e.amount))}</div>
                <button
                  className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase ${e.tax_deductible ? 'text-paid' : 'text-on-surface-variant/60'}`}
                  aria-pressed={e.tax_deductible}
                  onClick={() => toggleDeductible(e.id, e.tax_deductible)}
                >
                  {e.tax_deductible && <Icon name="check_circle" size={14} />}
                  {e.tax_deductible ? 'deductible' : 'not deductible'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-on-background/80 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Your receipt" className="max-h-full max-w-full rounded-card object-contain" />
          <button
            aria-label="Close receipt"
            className="absolute right-4 top-4 grid h-touch w-touch place-items-center rounded-full bg-background text-on-background"
            onClick={() => setLightbox(null)}
          >
            <Icon name="close" size={24} />
          </button>
        </div>
      )}
    </div>
  );
}
