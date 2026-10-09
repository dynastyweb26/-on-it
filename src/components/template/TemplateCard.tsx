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
// Persisted (2·11a, lib/template-store): every change is saved for this
// user, so leaving Chat, a reload or iOS closing the PWA brings it back
// (24 h). On a restore the picked client and items are re-read, so the chips
// show their current saved details (a keypad-set price is kept).
//
//   Extra info (2·12a): dashed "Extra info · dates, notes, deposit" → ink
//   chip with the first line; opens the Extra info sheet. The text is the
//   document's notes; due date and deposit are read from it (lib/extra-info).
//   Footer: what's missing ("Add a client to send", "Add a price for Labor",
//   Q3) or Subtotal · "50% deposit due now: $X" · Total. No tax (§1.4).
//
//   Send ↗ (2·12b; founder lock): a black #2E2822 circle with a cream
//   north_east arrow, no text, aria-label "Send invoice" / "Send quote".
//   Disabled (#EFE7D8, arrow at 40 %, no press scale) until the template is
//   complete; busy while the chat pre-builds the PDF, so the tap always takes
//   the synchronous iOS share. The card hands its draft to the chat page,
//   which runs the chat's own send (lib/template-send).
//
// Merge 2 · 2·10 (part 1) + 2·11 (part 2) + 2·12a/b.
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { ClientSheet, ItemSheet } from '@/components/template/TemplateSheets';
import KeypadSheet from '@/components/template/KeypadSheet';
import OnItSpinner from '@/components/OnItSpinner';
import ExtraInfoSheet from '@/components/template/ExtraInfoSheet';
import { parseExtraInfo } from '@/lib/extra-info';
import { templateToDraft } from '@/lib/template-send';
import type { ExtractResult } from '@/lib/ai';
import { money, calculateLineAmount, calculateInvoiceTotals } from '@/lib/financials';
import type { KeypadKind } from '@/lib/keypad';
import { clientContactLine, emptyItem, type TemplateClient, type TemplateItem, type TemplateKind } from '@/lib/template';
import { saveTemplate } from '@/lib/template-store';
import { clientNameKey } from '@/lib/client-name';
import { createClient } from '@/lib/supabase/client';
import { normalizeProduct } from '@/lib/products';

const UNDO_MS = 5000;
/** Only these units print after the quantity (frames 7c / 7e: "3 hr", "120 sq ft"). */
const qtyUnit = (u: TemplateItem['unit']) => (u === 'hour' ? 'hr' : u === 'sq ft' ? 'sq ft' : '');

type Sheet = { type: 'client' } | { type: 'item'; key: string } | { type: 'keypad'; key: string; kind: KeypadKind } | { type: 'extra' };

export type SendState = 'disabled' | 'preparing' | 'ready' | 'busy';

export default function TemplateCard({ kind, onKindChange, onClose, uid, restored, onDraft, sendState, onSend, duplicateNote }: {
  kind: TemplateKind;
  onKindChange: (k: TemplateKind) => void;
  onClose: () => void;
  /** Signed-in user id (null = guest): scopes the saved template. */
  uid: string | null;
  /** A template restored from storage (2·11a). */
  restored?: { client: TemplateClient | null; items: TemplateItem[]; extra?: string } | null;
  /** The chat draft while the template is sendable, else null (2·12b). */
  onDraft: (d: Partial<ExtractResult> | null) => void;
  sendState: SendState;
  /** Called synchronously in the tap (iOS share needs the gesture). */
  onSend: () => void;
  /** "You already made an invoice for … at this amount" (L17), shown above Send. */
  duplicateNote?: string | null;
}) {
  const [extra, setExtra] = useState(() => restored?.extra ?? '');
  const [client, setClient] = useState<TemplateClient | null>(() => restored?.client ?? null);
  const [items, setItems] = useState<TemplateItem[]>(() => (restored?.items.length ? restored.items : [emptyItem()]));

  // ── Persist every change (2·11a).
  useEffect(() => { saveTemplate({ uid, kind, client, items, extra }); }, [uid, kind, client, items, extra]);
  // Hand the chat its draft whenever the sendable content changes (2·12b).
  useEffect(() => { onDraft(templateToDraft(kind, client, items, extra)); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, client, items, extra]);

  // ── After a restore, re-read the picked client and items (signed in only):
  // the chips show their current saved details; a keypad-set price stays.
  useEffect(() => {
    if (!restored || !uid) return;
    const supabase = createClient();
    let live = true;
    (async () => {
      const id = restored.client?.id;
      if (id) {
        const { data } = await supabase.from('clients').select('name, address, phone').eq('id', id).maybeSingle();
        const r = data as { name: string; address: string | null; phone: string | null } | null;
        if (live && r) setClient((c) => (c && c.id === id ? { ...c, name: r.name, address: r.address, phone: r.phone } : c));
      }
      const keys = Array.from(new Set(restored.items.map((x) => clientNameKey(x.name)).filter(Boolean)));
      if (keys.length) {
        const { data } = await supabase.from('products').select('name, name_key, unit, unit_price, detail').in('name_key', keys).is('deleted_at', null);
        const byKey = new Map(((data ?? []) as Record<string, unknown>[]).map((r) => [String(r.name_key), normalizeProduct({ id: '', ...r })]));
        if (live && byKey.size) {
          setItems((xs) => xs.map((x) => {
            const p = byKey.get(clientNameKey(x.name));
            if (!p) return x;
            return { ...x, name: p.name, unit: p.unit, detail: p.detail, unit_price: x.priceSet ? x.unit_price : p.unit_price };
          }));
        }
      }
    })().catch(() => { /* keep what was stored */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  // ── Readiness (Q3): a client, ≥ 1 named item, and a price on every named item.
  const named = items.filter((x) => x.name.trim());
  const unpriced = named.find((x) => x.unit_price == null);
  const hint = !client && named.length === 0 ? 'Add a client and an item to send'
    : !client ? 'Add a client to send'
    : named.length === 0 ? 'Add an item to send'
    : unpriced ? `Add a price for ${unpriced.name.trim()}` : null;

  // ── Totals: named, priced lines; no tax on template documents.
  const info = parseExtraInfo(extra);
  const totals = calculateInvoiceTotals(
    named.filter((x) => x.unit_price != null).map((x) => ({ qty: x.qty, unit_price: x.unit_price! })),
    0, info.deposit?.type ?? 'none', info.deposit?.value ?? 0);
  const depositLabel = info.deposit?.type === 'percentage' ? `${info.deposit.value}% deposit` : 'Deposit';

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

      {/* Extra info slot */}
      <button type="button" onClick={() => setSheet({ type: 'extra' })}
        aria-label={extra ? `Extra info: ${extra}. Change extra info` : 'Add extra info: dates, notes, deposit'}
        className={`mt-1 flex min-h-[44px] w-full items-center gap-2.5 rounded-[12px] px-3 text-left transition active:scale-[0.99]
          ${extra ? 'bg-inverse-surface text-inverse-on-surface' : 'border border-dashed border-outline-variant bg-surface-container-lowest/70 text-on-surface-variant'}`}>
        <Icon name="sticky_note_2" size={20} className={extra ? 'text-primary-fixed-dim' : ''} />
        {extra
          ? <span className="min-w-0 flex-1 truncate text-[16px] font-bold">{extra.split('\n')[0]}</span>
          : <span className="min-w-0 flex-1 truncate text-[16px]">Extra info<span className="opacity-70"> · dates, notes, deposit</span></span>}
      </button>

      {duplicateNote && !hint && (
        <p role="status" className="mt-2 flex items-start gap-2 rounded-[12px] bg-primary-soft px-3 py-2 text-[13.5px] text-on-background">
          <Icon name="history" size={18} className="mt-0.5 shrink-0" />{duplicateNote}
        </p>
      )}

      {/* Footer: what's missing, or the totals — and Send. */}
      <div className="mt-2.5 flex items-end gap-3 border-t border-outline-variant/50 pt-2.5">
        <div className="min-w-0 flex-1" aria-live="polite">
          {hint ? (
            <p className="text-[14px] text-on-surface-variant">{hint}</p>
          ) : (
            <div className="leading-tight">
              <p className="text-[13px] text-on-surface-variant">Subtotal {money(totals.subtotal)}</p>
              {totals.depositAmount > 0 && (
                <p className="text-[13px] font-bold text-primary">{depositLabel} due now: {money(totals.depositAmount)}</p>
              )}
              <p className="mt-0.5 text-[13px] text-on-surface-variant">Total <span className="font-display text-[22px] font-extrabold text-on-background tabular-nums">{money(totals.total)}</span></p>
            </div>
          )}
        </div>
        {(() => {
          const off = !!hint || sendState === 'disabled';
          const waiting = !off && (sendState === 'preparing' || sendState === 'busy');
          return (
            <button type="button" onClick={onSend}
              disabled={off || waiting} aria-disabled={off || waiting} aria-busy={waiting || undefined}
              aria-label={`Send ${noun}`}
              className={`relative grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full transition
                ${off ? 'bg-[#EFE7D8] text-on-background/40' : 'bg-[#2E2822] text-[#FBF3E5] active:scale-90'}
                ${waiting ? 'opacity-70' : ''}`}>
              {waiting ? <OnItSpinner size={22} /> : <Icon name="north_east" size={26} />}
            </button>
          );
        })()}
      </div>

      {sheet?.type === 'client' && (
        <ClientSheet onClose={() => setSheet(null)}
          onPick={(c) => { setClient(c); setSheet(null); }} />
      )}
      {sheet?.type === 'item' && (
        <ItemSheet onClose={() => setSheet(null)}
          onPick={(p) => {
            update(sheet.key, { name: p.name, unit: p.unit, unit_price: p.unit_price, detail: p.detail, qty: 1, priceSet: false });
            setSheet(null);
          }} />
      )}
      {sheet?.type === 'extra' && (
        <ExtraInfoSheet value={extra} address={client?.address ?? null} onClose={() => setSheet(null)}
          onDone={(t) => { setExtra(t); setSheet(null); }} />
      )}
      {sheet?.type === 'keypad' && keypadItem && (
        <KeypadSheet kind={sheet.kind} itemName={keypadItem.name.trim()} unit={keypadItem.unit}
          value={sheet.kind === 'qty' ? keypadItem.qty : keypadItem.unit_price}
          otherValue={sheet.kind === 'qty' ? keypadItem.unit_price : keypadItem.qty}
          onClose={() => setSheet(null)}
          onSet={(v) => {
            update(keypadItem.key, sheet.kind === 'qty' ? { qty: v ?? 1 } : { unit_price: v, priceSet: true });
            setSheet(null);
          }} />
      )}
    </div>
  );
}
