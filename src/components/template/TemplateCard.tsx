'use client';
// ═══ Template card ═══ (release frames 1e / 1f / 7a–7d; UI-REDESIGN-AUDIT §1.4)
// The composer's guided mode: it takes the bar's slot in place (the tab bar
// stays, the chat above stays scrollable). Not a modal.
//   Header: "New invoice" / "New quote" chip · "Make it a quote / an invoice"
//   (keeps every slot) · close × (discards; nothing was written).
//   Name slot: dashed "Name" → solid ink chip; opens the Client sheet. Its
//   second line (2·10d) shows what will print: "address · phone", or "No
//   address or phone on file".
//   Item rows (two-row cards): dashed "Product/Service" → ink chip "Deck
//   staining · job" (+ its description, one line); opens the Item sheet (pick
//   fills name, unit, price; qty resets to 1). Below it: the qty stepper
//   (− / number / +, qty 1 muted; the number opens the Quantity keypad),
//   "hr" / "sq ft" after it, × the price chip (opens the Price keypad), and
//   the line total (muted until named and priced). A trash button removes a
//   row when there's more than one, leaving a 5 s "Item removed · Undo" bar
//   in its place. "+ Add item" appends a row and scrolls to it.
//   The item list scrolls inside a capped area with fading edges; the Name
//   row stays above it and the footer below.
//
// Merge 2 · 2·10 (part 1) + 2·11 (part 2). Part 3 (2·12) adds Extra info,
// totals and Send.
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { ClientSheet, ItemSheet } from '@/components/template/TemplateSheets';
import KeypadSheet from '@/components/template/KeypadSheet';
import { money, calculateLineAmount } from '@/lib/financials';
import type { KeypadKind } from '@/lib/keypad';
import { clientContactLine, emptyItem, type TemplateClient, type TemplateItem, type TemplateKind } from '@/lib/template';

const UNDO_MS = 5000;
/** Only these units print after the quantity (frames 7c / 7e: "3 hr", "120 sq ft"). */
const qtyUnit = (u: TemplateItem['unit']) => (u === 'hour' ? 'hr' : u === 'sq ft' ? 'sq ft' : '');

type Sheet = { type: 'client' } | { type: 'item'; key: string } | { type: 'keypad'; key: string; kind: KeypadKind };

export default function TemplateCard({ kind, onKindChange, onClose }: {
  kind: TemplateKind;
  onKindChange: (k: TemplateKind) => void;
  onClose: () => void;
}) {
  const [client, setClient] = useState<TemplateClient | null>(null);
  const [items, setItems] = useState<TemplateItem[]>(() => [emptyItem()]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [removed, setRemoved] = useState<{ item: TemplateItem; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>();
  const listRef = useRef<HTMLDivElement>(null);
  const scrollToEnd = useRef(false);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  const noun = kind === 'quote' ? 'quote' : 'invoice';
  const other: TemplateKind = kind === 'quote' ? 'invoice' : 'quote';
  const update = (key: string, patch: Partial<TemplateItem>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  // ── Rows: add (scrolls to it), remove (5 s undo bar in its place), undo.
  function addItem() {
    scrollToEnd.current = true;
    setItems((xs) => [...xs, emptyItem()]);
  }
  function removeItem(key: string) {
    const index = items.findIndex((x) => x.key === key);
    if (index < 0 || items.length <= 1) return;
    clearTimeout(undoTimer.current);
    setRemoved({ item: items[index], index });
    setItems((xs) => xs.filter((x) => x.key !== key));
    undoTimer.current = setTimeout(() => setRemoved(null), UNDO_MS);
  }
  function undoRemove() {
    if (!removed) return;
    clearTimeout(undoTimer.current);
    const { item, index } = removed;
    setItems((xs) => [...xs.slice(0, index), item, ...xs.slice(index)]);
    setRemoved(null);
  }
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  // ── The capped list: fade an edge only while there's more to scroll that way.
  function measureEdges() {
    const el = listRef.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }));
  }
  useEffect(() => {
    const el = listRef.current;
    if (el && scrollToEnd.current) { scrollToEnd.current = false; el.scrollTop = el.scrollHeight; }
    measureEdges();
  }, [items, removed]);

  const fade = (on: boolean) => (on ? 'transparent, #000 14px' : '#000, #000');
  const mask = `linear-gradient(to bottom, ${fade(edges.top)}, ${edges.bottom ? '#000 calc(100% - 14px), transparent' : '#000, #000'})`;

  const hasItem = items.some((x) => x.name.trim());
  const hint = !client && !hasItem ? 'Add a client and an item to send'
    : !client ? 'Add a client to send' : !hasItem ? 'Add an item to send' : null;

  const keypadItem = sheet?.type === 'keypad' ? items.find((x) => x.key === sheet.key) : undefined;

  const undoBar = removed && (
    <div key="undo" role="status" className="flex h-11 items-center justify-between rounded-[14px] border border-dashed border-outline-variant px-3 text-[14px] text-on-surface-variant">
      <span className="truncate">{removed.item.name.trim() ? `${removed.item.name} removed` : 'Item removed'}</span>
      <button type="button" onClick={undoRemove} className="min-h-[36px] shrink-0 px-2 font-bold text-primary">Undo</button>
    </div>
  );

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
        className={`mt-2.5 flex min-h-[44px] w-full items-center gap-2.5 rounded-[12px] px-3 text-left transition active:scale-[0.99]
          ${client ? 'bg-inverse-surface py-1.5 text-inverse-on-surface' : 'border border-dashed border-outline-variant bg-surface-container-lowest/70 text-on-surface-variant'}`}>
        <Icon name="person" size={20} className={client ? 'text-primary-fixed-dim' : ''} filled={!!client} />
        {client ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-bold leading-tight">{client.name}</span>
            <span className="block truncate text-[13px] leading-snug opacity-70">{clientContactLine(client)}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[17px]">Name</span>
        )}
        {client && <Icon name="unfold_more" size={20} className="shrink-0 opacity-70" />}
      </button>

      {/* Items: a capped, scrolling list (about two rows; less on short screens). */}
      <div ref={listRef} onScroll={measureEdges} data-template-items=""
        className="mt-2.5 max-h-[min(236px,34dvh)] space-y-2 overflow-y-auto overscroll-contain"
        style={{ WebkitMaskImage: mask, maskImage: mask }}>
        {items.map((it, i) => {
          const named = !!it.name.trim();
          const priced = it.unit_price != null;
          const label = qtyUnit(it.unit);
          return (
            <div key={it.key}>
              {removed && removed.index === i && <div className="mb-2">{undoBar}</div>}
              <div className="onit-rise rounded-[14px] border border-outline-variant/50 bg-surface-container-lowest p-1.5">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setSheet({ type: 'item', key: it.key })}
                    aria-label={named ? `Item: ${it.name}. Change item` : 'Add a product or service'}
                    className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-[11px] px-3 text-left transition active:scale-[0.99]
                      ${named ? `bg-inverse-surface text-inverse-on-surface${it.detail ? ' py-1.5' : ''}` : 'border border-dashed border-outline-variant text-on-surface-variant'}`}>
                    <Icon name="handyman" size={20} className={named ? 'text-primary-fixed-dim' : ''} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] leading-tight">
                        {named ? (<><span className="font-bold">{it.name}</span>{it.unit ? <span className="opacity-60"> · {it.unit === 'hour' ? 'hr' : it.unit}</span> : null}</>) : 'Product/Service'}
                      </span>
                      {named && it.detail && <span className="block truncate text-[13px] leading-snug opacity-70">{it.detail}</span>}
                    </span>
                  </button>
                  {items.length > 1 && (
                    <button type="button" aria-label={named ? `Remove ${it.name}` : 'Remove item'} onClick={() => removeItem(it.key)}
                      className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-on-surface-variant active:scale-90">
                      <Icon name="delete" size={20} />
                    </button>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex h-10 items-center rounded-[11px] bg-surface-container px-1">
                    <button type="button" aria-label="One less" disabled={it.qty <= 1}
                      onClick={() => update(it.key, { qty: Math.max(1, Math.round((it.qty - 1) * 100) / 100) })}
                      className="grid h-8 w-8 place-items-center rounded-full text-on-background active:scale-90 disabled:opacity-30">
                      <Icon name="remove" size={18} />
                    </button>
                    <button type="button" aria-label={`Quantity ${it.qty}. Change quantity`}
                      onClick={() => setSheet({ type: 'keypad', key: it.key, kind: 'qty' })}
                      className={`grid h-8 min-w-[34px] place-items-center rounded-[8px] bg-surface-container-lowest px-1.5 text-[16px] font-semibold tabular-nums active:scale-95
                        ${it.qty === 1 ? 'text-[#A39883]' : 'text-on-background'}`}>{it.qty}</button>
                    <button type="button" aria-label="One more"
                      onClick={() => update(it.key, { qty: Math.min(9_999_999, Math.round((it.qty + 1) * 100) / 100) })}
                      className="grid h-8 w-8 place-items-center rounded-full text-on-background active:scale-90">
                      <Icon name="add" size={18} />
                    </button>
                  </div>
                  {label && <span className="text-[14px] text-on-surface-variant">{label}</span>}
                  <span className="text-on-surface-variant/60">×</span>
                  <button type="button" aria-label={priced ? `Price ${money(it.unit_price!)}. Change price` : 'Add a price'}
                    onClick={() => setSheet({ type: 'keypad', key: it.key, kind: 'price' })}
                    className={`inline-flex h-10 items-center rounded-[11px] px-3 text-[15px] tabular-nums active:scale-95
                      ${priced ? 'bg-inverse-surface font-bold text-inverse-on-surface' : 'border border-dashed border-outline-variant text-on-surface-variant'}`}>
                    {priced ? money(it.unit_price!) : '$ Price'}
                  </button>
                  <span className={`ml-auto font-display text-[16px] font-bold tabular-nums ${named && priced ? 'text-on-background' : 'text-on-surface-variant/60'}`}>
                    {money(priced ? calculateLineAmount(it.qty, it.unit_price!) : 0)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {removed && removed.index >= items.length && undoBar}
      </div>

      <button type="button" onClick={addItem}
        className="mt-1.5 flex min-h-[40px] items-center gap-1.5 px-1 text-[15px] font-bold text-primary active:opacity-60">
        <Icon name="add" size={20} /> Add item
      </button>

      {hint && <p className="mt-1.5 border-t border-outline-variant/50 pt-2.5 text-[14px] text-on-surface-variant">{hint}</p>}

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
      {sheet?.type === 'keypad' && keypadItem && (
        <KeypadSheet kind={sheet.kind} itemName={keypadItem.name.trim()} unit={keypadItem.unit}
          value={sheet.kind === 'qty' ? keypadItem.qty : keypadItem.unit_price}
          otherValue={sheet.kind === 'qty' ? keypadItem.unit_price : keypadItem.qty}
          onClose={() => setSheet(null)}
          onSet={(v) => {
            update(keypadItem.key, sheet.kind === 'qty' ? { qty: v ?? 1 } : { unit_price: v });
            setSheet(null);
          }} />
      )}
    </div>
  );
}
