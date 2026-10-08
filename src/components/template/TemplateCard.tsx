'use client';
// ═══ Template card ═══ (release frames 1e / 1f / 7a; UI-REDESIGN-AUDIT §1.4)
// The composer's guided mode: it takes the bar's slot in place (the tab bar
// stays, the chat above stays scrollable). Not a modal.
//   Header: "New invoice" / "New quote" chip · "Make it a quote / an invoice"
//   (keeps every slot) · close × (discards; nothing was written).
//   Name slot: dashed "Name" → solid ink chip; opens the Client sheet.
//   Item row: dashed "Product/Service" → ink chip "Deck staining · job";
//   opens the Item sheet (pick fills name, unit, price; qty resets to 1).
//
// Merge 2 · 2·10 (part 1). Part 2 (2·11) adds the qty / price keypads, more
// rows, remove + undo and the capped list; part 3 (2·12) adds Extra info,
// totals and Send.
import { useState } from 'react';
import Icon from '@/components/Icon';
import { ClientSheet, ItemSheet } from '@/components/template/TemplateSheets';
import { money, calculateLineAmount } from '@/lib/financials';
import { unitLabel } from '@/lib/line-units';
import { emptyItem, type TemplateClient, type TemplateItem, type TemplateKind } from '@/lib/template';

export default function TemplateCard({ kind, onKindChange, onClose }: {
  kind: TemplateKind;
  onKindChange: (k: TemplateKind) => void;
  onClose: () => void;
}) {
  const [client, setClient] = useState<TemplateClient | null>(null);
  const [items, setItems] = useState<TemplateItem[]>(() => [emptyItem()]);
  const [sheet, setSheet] = useState<{ type: 'client' } | { type: 'item'; key: string } | null>(null);

  const noun = kind === 'quote' ? 'quote' : 'invoice';
  const other: TemplateKind = kind === 'quote' ? 'invoice' : 'quote';
  const update = (key: string, patch: Partial<TemplateItem>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const hasItem = items.some((x) => x.name.trim());
  const hint = !client && !hasItem ? 'Add a client and an item to send'
    : !client ? 'Add a client to send' : !hasItem ? 'Add an item to send' : null;

  return (
    <div className="onit-rise rounded-[22px] border border-outline-variant/60 bg-surface-container-low p-3 shadow-card"
      role="group" aria-label={`New ${noun}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary-soft px-2.5 text-[13px] font-bold text-primary-on-container">
          <Icon name={kind === 'quote' ? 'request_quote' : 'description'} size={16} />
          New {noun}
        </span>
        <button type="button" onClick={() => onKindChange(other)}
          className="min-h-[36px] px-1.5 text-[13.5px] font-bold text-primary active:opacity-60">
          Make it {other === 'quote' ? 'a quote' : 'an invoice'}
        </button>
        <button type="button" aria-label="Close template" onClick={onClose}
          className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-surface-container-high text-on-background active:scale-90">
          <Icon name="close" size={18} />
        </button>
      </div>

      {/* Name slot */}
      <button type="button" onClick={() => setSheet({ type: 'client' })}
        aria-label={client ? `Client: ${client.name}. Change client` : 'Add a client'}
        className={`mt-2.5 flex h-11 w-full items-center gap-2.5 rounded-[12px] px-3 text-left transition active:scale-[0.99]
          ${client ? 'bg-inverse-surface text-inverse-on-surface' : 'border border-dashed border-outline-variant bg-surface-container-lowest/70 text-on-surface-variant'}`}>
        <Icon name="person" size={20} className={client ? 'text-primary-fixed-dim' : ''} filled={!!client} />
        <span className={`min-w-0 flex-1 truncate text-[17px] ${client ? 'font-bold' : ''}`}>{client ? client.name : 'Name'}</span>
        {client && <Icon name="unfold_more" size={20} className="shrink-0 opacity-70" />}
      </button>

      {/* Items */}
      <div className="mt-2.5 space-y-2">
        {items.map((it) => {
          const named = !!it.name.trim();
          const priced = it.unit_price != null;
          const label = unitLabel(it.unit);
          return (
            <div key={it.key} className="rounded-[14px] border border-outline-variant/50 bg-surface-container-lowest p-1.5">
              <button type="button" onClick={() => setSheet({ type: 'item', key: it.key })}
                aria-label={named ? `Item: ${it.name}. Change item` : 'Add a product or service'}
                className={`flex h-11 w-full items-center gap-2.5 rounded-[11px] px-3 text-left transition active:scale-[0.99]
                  ${named ? 'bg-inverse-surface text-inverse-on-surface' : 'border border-dashed border-outline-variant text-on-surface-variant'}`}>
                <Icon name="handyman" size={20} className={named ? 'text-primary-fixed-dim' : ''} />
                <span className="min-w-0 flex-1 truncate text-[16px]">
                  {named ? (<><span className="font-bold">{it.name}</span>{it.unit ? <span className="opacity-60"> · {it.unit === 'hour' ? 'hr' : it.unit}</span> : null}</>) : 'Product/Service'}
                </span>
              </button>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex h-10 items-center rounded-[11px] bg-surface-container px-1">
                  <button type="button" aria-label="One less" disabled={it.qty <= 1}
                    onClick={() => update(it.key, { qty: Math.max(1, Math.round((it.qty - 1) * 100) / 100) })}
                    className="grid h-8 w-8 place-items-center rounded-full text-on-background active:scale-90 disabled:opacity-30">
                    <Icon name="remove" size={18} />
                  </button>
                  <span className={`grid h-8 min-w-[34px] place-items-center rounded-[8px] bg-surface-container-lowest px-1.5 text-[16px] font-semibold tabular-nums
                    ${it.qty === 1 ? 'text-[#A39883]' : 'text-on-background'}`}>{it.qty}</span>
                  <button type="button" aria-label="One more"
                    onClick={() => update(it.key, { qty: Math.min(9_999_999, Math.round((it.qty + 1) * 100) / 100) })}
                    className="grid h-8 w-8 place-items-center rounded-full text-on-background active:scale-90">
                    <Icon name="add" size={18} />
                  </button>
                </div>
                {label && <span className="text-[14px] text-on-surface-variant">{label}</span>}
                <span className="text-on-surface-variant/60">×</span>
                <span className={`inline-flex h-10 items-center rounded-[11px] px-3 text-[15px] tabular-nums
                  ${priced ? 'bg-inverse-surface font-bold text-inverse-on-surface' : 'border border-dashed border-outline-variant text-on-surface-variant'}`}>
                  {priced ? money(it.unit_price!) : '$ Price'}
                </span>
                <span className={`ml-auto font-display text-[16px] font-bold tabular-nums ${named && priced ? 'text-on-background' : 'text-on-surface-variant/60'}`}>
                  {money(priced ? calculateLineAmount(it.qty, it.unit_price!) : 0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {hint && <p className="mt-3 border-t border-outline-variant/50 pt-2.5 text-[14px] text-on-surface-variant">{hint}</p>}

      {sheet?.type === 'client' && (
        <ClientSheet onClose={() => setSheet(null)}
          onPick={(c) => { setClient(c); setSheet(null); }} />
      )}
      {sheet?.type === 'item' && (
        <ItemSheet onClose={() => setSheet(null)}
          onPick={(p) => {
            update(sheet.key, { name: p.name, unit: p.unit, unit_price: p.unit_price, detail: p.detail, qty: 1 });
            setSheet(null);
          }} />
      )}
    </div>
  );
}
