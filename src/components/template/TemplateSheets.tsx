'use client';
// The template's two pickers (release frames 1g / 1h).
//   Client: saved clients A–Z ("4 invoices"), unsaved history clients under
//   USED BEFORE · NOT SAVED ("Used once · Sep 18"), or a new name.
//   Product or service: saved items A–Z with prices ("$85.00/hr", "No
//   price"), unsaved history items with their last price, or a new name.
// Guests (no rows) just get the search + "Use '{q}'".
import { useEffect, useState } from 'react';
import PickerSheet from '@/components/template/PickerSheet';
import { createClient } from '@/lib/supabase/client';
import { initials, normalizeSummary, type ClientSummary } from '@/lib/clients';
import { PRODUCT_COLS, normalizeProduct, priceText, productSubtitle, type Product } from '@/lib/products';
import { clientDocsLine, usedBeforeLine, type TemplateClient } from '@/lib/template';

const byRecent = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');

export function ClientSheet({ onPick, onClose }: { onPick: (c: TemplateClient) => void; onClose: () => void }) {
  const [rows, setRows] = useState<ClientSummary[] | null>(null);
  useEffect(() => {
    createClient().rpc('client_summaries')
      .then(({ data }) => setRows(((data ?? []) as Record<string, unknown>[]).map(normalizeSummary)), () => setRows([]));
  }, []);

  async function pick(c: ClientSummary) {
    // The contact on file rides along (invoice snapshot, the "Job at …" chip).
    const { data } = await createClient().from('clients').select('address, phone').eq('id', c.id).maybeSingle();
    const r = data as { address: string | null; phone: string | null } | null;
    onPick({ name: c.name, id: c.id, address: r?.address ?? null, phone: r?.phone ?? null });
  }

  const saved = (rows ?? []).filter((c) => c.saved);
  const history = (rows ?? []).filter((c) => !c.saved && c.doc_count > 0).sort((a, b) => byRecent(a.last_used_at, b.last_used_at));
  return (
    <PickerSheet title="Client" searchNoun={['client', 'clients']} idPrefix="tpl-client" newLabel="New client"
      saved={saved} history={history} loading={rows === null} onClose={onClose}
      onPick={pick}
      onUseName={(name) => onPick({ name, id: null, address: null, phone: null })}
      renderRow={(c, kind) => (
        <>
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-bold text-primary-on-container
            ${kind === 'history' ? 'border border-dashed border-primary-container' : 'bg-primary-soft'}`}>{initials(c.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-bold text-on-background">{c.name}</span>
            <span className="block truncate text-[14px] text-on-surface-variant">
              {kind === 'history' ? usedBeforeLine(c.doc_count, c.last_used_at) : clientDocsLine(c)}
            </span>
          </span>
        </>
      )} />
  );
}

type ItemRow = Product & { saved: boolean };

export function ItemSheet({ onPick, onClose }: {
  onPick: (p: Pick<Product, 'name' | 'unit' | 'unit_price' | 'detail'> & { saved: boolean }) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ItemRow[] | null>(null);
  useEffect(() => {
    createClient().from('products').select(`${PRODUCT_COLS}, saved_at`).is('deleted_at', null).limit(500)
      .then(({ data }) => setRows(((data ?? []) as Record<string, unknown>[])
        .map((r) => ({ ...normalizeProduct(r), saved: r.saved_at != null }))), () => setRows([]));
  }, []);

  const saved = (rows ?? []).filter((p) => p.saved);
  const history = (rows ?? []).filter((p) => !p.saved && p.use_count > 0).sort((a, b) => byRecent(a.last_used_at, b.last_used_at));
  return (
    <PickerSheet title="Product or service" searchNoun={['item', 'items']} idPrefix="tpl-item" newLabel="New product or service"
      saved={saved} history={history} loading={rows === null} onClose={onClose}
      onPick={(p) => onPick({ name: p.name, unit: p.unit, unit_price: p.unit_price, detail: p.detail, saved: p.saved })}
      onUseName={(name) => onPick({ name, unit: 'each', unit_price: null, detail: null, saved: false })}
      renderRow={(p, kind) => {
        const price = priceText(p);
        return (
          <>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-[15px] font-bold text-primary-on-container
              ${kind === 'history' ? 'border border-dashed border-primary-container' : 'bg-primary-soft'}`}>{p.name.charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-bold text-on-background">{p.name}</span>
              <span className="block truncate text-[14px] text-on-surface-variant">
                {kind === 'history' ? usedBeforeLine(p.use_count, p.last_used_at) : productSubtitle(p)}
              </span>
            </span>
            <span className={`shrink-0 text-[16px] tabular-nums ${price ? 'font-bold text-on-background' : 'text-on-surface-variant'}`}>{price ?? 'No price'}</span>
          </>
        );
      }} />
  );
}
