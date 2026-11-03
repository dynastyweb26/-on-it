'use client';
// Shared line-item list with inline editing of description, quantity, unit
// (each · hr · sq ft · job), unit price and the optional line description — used by the chat confirmation card and the draft invoice detail page,
// so the edit interaction can't drift between them. Tap a value to edit it;
// blur or Enter commits, Escape cancels. The component never persists: it emits
// the new items via onChange and the parent decides what to do (a draft in
// React state, or a DB write with recomputed totals). Amounts are validated
// here — non-negative, bounded, snapped to two decimals.
//
// `variant` is VISUAL only (docs/design/onit-chat · CardLedger): the chat card
// uses the ledger skin (a printed list: number, name, amount, a quiet sub-row
// and a 40px control strip). The invoice/estimate detail screens keep the
// default skin. No handler, aria-label or validation rule differs between them.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { m } from 'framer-motion';
import Icon from '@/components/Icon';
import { money, calculateLineAmount } from '@/lib/financials';
import { LINE_UNITS, DETAIL_MAX, normalizeLineDetail, unitLabel, type LineUnit } from '@/lib/line-units';

export interface EditableLineItem {
  description: string;
  qty: number;
  unit_price: number;
  // Optional unit and description (merge 2 · 2·9); amount stays qty × price.
  unit?: LineUnit | null;
  detail?: string | null;
  // Preserved through edits (item 3 training signal); this component never sets it.
  original_description?: string | null;
}

// useLayoutEffect warns during the server render; the DOM-only half is the point
// of the FLIP below, so pick the layout effect only in the browser.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type Field = 'description' | 'qty' | 'unit_price' | 'detail';

// qty: 0..100000, up to 2 decimals (fractional hours are legitimate).
const clampQty = (n: number) => Math.min(100000, Math.max(0, Math.round(n * 100) / 100));
// price: 0..10,000,000, snapped to cents.
const clampPrice = (n: number) => Math.min(10_000_000, Math.max(0, Math.round(n * 100) / 100));

export default function LineItemsEditor({
  items,
  editable,
  onChange,
  variant = 'default',
}: {
  items: EditableLineItem[];
  editable: boolean;
  onChange: (items: EditableLineItem[]) => void;
  /** 'ledger' = the chat card's printed list. Visual only. */
  variant?: 'default' | 'ledger';
}) {
  const [cell, setCell] = useState<{ i: number; f: Field } | null>(null);
  const [text, setText] = useState('');
  const ledger = variant === 'ledger';
  // Reorder travel (design: Up/Down moves the row, 260ms settle). FLIP: the two
  // swapped rows are measured before the change and their old tops become a
  // counter-transform released on the next frame. Nothing else moves.
  const rowsRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<{ from: number; to: number; tops: number[] } | null>(null);
  // Row arrival / removal travel (Add / Dup / Delete, 260ms): one row opens its
  // own height, another closes it and is dropped from the list when the close
  // ends, so the rows around it slide instead of jumping.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [openingIndex, setOpeningIndex] = useState<number | null>(null);
  const [closingIndex, setClosingIndex] = useState<number | null>(null);

  function start(i: number, f: Field, current: string) {
    setText(current);
    setCell({ i, f });
  }

  function commit() {
    if (!cell) return;
    const { i, f } = cell;
    setCell(null);
    const cur = items[i];
    if (!cur) return;
    let next: EditableLineItem;
    if (f === 'description') {
      const t = text.trim();
      if (t === cur.description) return; // unchanged — no-op
      next = { ...cur, description: t };
    } else if (f === 'detail') {
      const d = normalizeLineDetail(text);
      if (d === (cur.detail ?? null)) return;
      next = { ...cur, detail: d };
    } else {
      const raw = text.trim();
      if (raw === '') return; // cleared — keep the previous value
      const n = Number(raw);
      if (!Number.isFinite(n)) return; // non-numeric — no-op
      const v = f === 'qty' ? clampQty(n) : clampPrice(n);
      const curVal = f === 'qty' ? cur.qty : cur.unit_price;
      if (v === curVal) return;
      next = { ...cur, [f]: v };
    }
    onChange(items.map((li, idx) => (idx === i ? next : li)));
  }

  function setUnit(i: number, u: LineUnit) {
    const cur = items[i];
    if (!cur || (cur.unit ?? 'each') === u) return;
    onChange(items.map((li, idx) => (idx === i ? { ...li, unit: u } : li)));
  }

  function move(i: number, dir: -1 | 1) {
    const target = i + dir;
    if (target < 0 || target >= items.length) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!reduce) {
      const rows = rowsRef.current?.querySelectorAll<HTMLElement>('[data-line-row]');
      const tops = rows ? Array.from(rows, (r) => r.getBoundingClientRect().top) : [];
      flipRef.current = tops.length > target ? { from: i, to: target, tops } : null;
    }
    const next = [...items];
    const temp = next[i];
    next[i] = next[target];
    next[target] = temp;
    onChange(next);
  }

  // The rows are keyed by index, so React keeps each box in place and swaps the
  // content: measuring each box's new top and offsetting it by where its new
  // content came from is what makes the swap read as travel.
  useIsoLayoutEffect(() => {
    const flip = flipRef.current;
    flipRef.current = null;
    if (!flip || !rowsRef.current) return;
    const rows = rowsRef.current.querySelectorAll<HTMLElement>('[data-line-row]');
    const pairs: Array<[number, number | undefined]> = [
      [flip.to, flip.tops[flip.from]],
      [flip.from, flip.tops[flip.to]],
    ];
    for (const [index, oldTop] of pairs) {
      const row = rows[index];
      if (!row || oldTop == null) continue;
      const delta = oldTop - row.getBoundingClientRect().top;
      if (!delta) continue;
      row.style.transition = 'none';
      row.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        row.style.transition = 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        row.style.transform = 'none';
        setTimeout(() => { row.style.transition = ''; }, 300);
      });
    }
  }, [items]);

  /** Open one row's height; the timer clears the flag so a later render does
   *  not replay it. Reduced motion never marks a row. */
  function openRow(index: number) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setOpeningIndex(index);
    setTimeout(() => setOpeningIndex((cur) => (cur === index ? null : cur)), 320);
  }

  function duplicate(i: number) {
    const item = items[i];
    if (!item) return;
    const next = [...items];
    next.splice(i + 1, 0, { ...item });
    onChange(next);
    openRow(i + 1);
  }

  function remove(i: number) {
    const item = items[i];
    if (!item) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onChange(items.filter((_, idx) => idx !== i));
      return;
    }
    setClosingIndex(i);
    // Remove AFTER the close, and by identity against the latest list, so an
    // edit made during those 260ms cannot delete the wrong row.
    setTimeout(() => {
      setClosingIndex(null);
      const latest = itemsRef.current;
      const at = latest.indexOf(item);
      onChange(at === -1 ? latest.filter((_, idx) => idx !== i) : latest.filter((_, idx) => idx !== at));
    }, 260);
  }

  function addLineItem() {
    const newIndex = items.length;
    const newItem: EditableLineItem = { description: '', qty: 1, unit_price: 0 };
    onChange([...items, newItem]);
    openRow(newIndex);
    start(newIndex, 'description', '');
  }

  const editingHere = (i: number, f: Field) => editable && cell?.i === i && cell.f === f;

  function cellInput(aria: string, numeric: boolean) {
    return (
      <input
        autoFocus
        className={
          ledger
            ? `rounded-field border-2 border-primary-container bg-surface-container-lowest px-2 py-1 text-on-background outline-none ${
                numeric ? 'w-24 text-right tabular-nums' : 'min-w-0 flex-1 text-[17px]'
              }`
            : `rounded-md border border-primary/50 bg-surface-container-lowest px-2 py-1 text-on-background outline-none focus:border-primary ${
                numeric ? 'w-24 text-right' : 'min-w-0 flex-1 text-body-md'
              }`
        }
        value={text}
        inputMode={numeric ? 'decimal' : 'text'}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setCell(null);
          }
        }}
        aria-label={aria}
      />
    );
  }

  const editBtnStyle = ledger
    ? 'inline-flex items-center gap-1 border-b border-dashed border-outline-variant text-left transition active:opacity-60 min-h-[44px] py-1'
    : 'inline-flex items-center gap-1 underline decoration-dotted decoration-outline-variant/60 underline-offset-4 transition active:opacity-60 text-left min-h-[44px] py-1';

  const controlBtn = `min-h-[44px] px-3 py-1.5 rounded-control border border-outline-variant/60 bg-surface-container-lowest font-semibold text-[13px] text-on-background transition active:scale-95 disabled:opacity-30 disabled:pointer-events-none`;

  return (
    // onit-li-rows: hook for the card build-in stagger (globals.css, MOTION-SPEC §3).
    <div ref={rowsRef} className={ledger ? 'onit-li-rows' : 'onit-li-rows space-y-3'}>
      {items.map((li, i) => (
        <div
          key={i}
          className={`onit-row-slot${openingIndex === i ? ' is-opening' : ''}${closingIndex === i ? ' is-closing' : ''}`}
        >
        <div
          data-line-row=""
          data-line-index={i}
          className={
            ledger
              ? `py-3 text-[17px] ${i === items.length - 1 ? '' : 'border-b border-outline-variant/40'}`
              : 'rounded-lg border border-outline-variant/20 bg-surface-container-lowest/50 p-2.5 text-body-md'
          }
        >
          {/* Main row: Line number + Description + Amount */}
          <div className="flex items-center justify-between gap-2">
            <span className={`shrink-0 font-mono text-sm font-semibold ${ledger ? 'w-[22px] text-on-surface-variant/70' : 'text-on-surface-variant/80'}`}>
              {i + 1}.
            </span>

            {editingHere(i, 'description') ? (
              cellInput('Edit line item description', false)
            ) : editable ? (
              <button
                type="button"
                className={`min-w-0 flex-1 ${editBtnStyle} ${ledger ? 'text-[17px] font-semibold' : ''}`}
                onClick={() => start(i, 'description', li.description)}
                aria-label={`Edit description: ${li.description || 'empty'}`}
              >
                <span className="truncate">{li.description || <span className="italic text-on-surface-variant/50">Empty description</span>}</span>
                <Icon name="edit" size={ledger ? 15 : 14} className="shrink-0 text-on-surface-variant/70" />
              </button>
            ) : ledger ? (
              <m.span data-shared={`item-${i}`} className="min-w-0 flex-1 truncate text-[17px] font-semibold">
                {li.description}
              </m.span>
            ) : (
              <span className="min-w-0 flex-1 truncate">{li.description}</span>
            )}

            {ledger ? (
              <m.span
                data-shared={`price-${i}`}
                className="shrink-0 pl-2 font-display text-[17px] font-bold tabular-nums"
              >
                {money(calculateLineAmount(li.qty, li.unit_price))}
              </m.span>
            ) : (
              <span className="shrink-0 pl-1 font-display font-bold">
                {money(calculateLineAmount(li.qty, li.unit_price))}
              </span>
            )}
          </div>

          {/* Description (a saved product's "shows on invoices" text). */}
          {editingHere(i, 'detail') ? (
            <div className={`mt-1 flex ${ledger ? 'pl-[30px]' : 'pl-5'}`}>
              <input
                autoFocus
                className={`min-w-0 flex-1 bg-surface-container-lowest px-2 py-1 outline-none ${
                  ledger
                    ? 'rounded-field border border-outline-variant/60 text-[14px] text-on-background'
                    : 'rounded-md border border-primary/50 text-sm text-on-background focus:border-primary'
                }`}
                value={text}
                maxLength={DETAIL_MAX}
                placeholder="Shows under this line on the invoice"
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commit(); }
                  else if (e.key === 'Escape') { e.preventDefault(); setCell(null); }
                }}
                aria-label="Edit line description"
              />
            </div>
          ) : li.detail ? (
            editable ? (
              <button type="button" className={`${ledger ? 'ml-[30px]' : 'ml-5'} max-w-[calc(100%-1.25rem)] text-[14px] leading-snug text-on-surface-variant ${editBtnStyle} min-h-[36px]`}
                onClick={() => start(i, 'detail', li.detail ?? '')} aria-label={`Edit line description: ${li.detail}`}>
                <span className="line-clamp-2">{li.detail}</span>
                <Icon name="edit" size={14} className="shrink-0 text-on-surface-variant/70" />
              </button>
            ) : (
              <p className={`mt-0.5 text-[13px] text-on-surface-variant ${ledger ? 'pl-[30px]' : 'pl-5'}`}>{li.detail}</p>
            )
          ) : null}

          {/* Sub-row: Qty x Unit price */}
          <div className={`mt-1 flex items-center gap-1.5 text-on-surface-variant ${ledger ? 'pl-[30px] text-[15px]' : 'pl-5 text-sm'}`}>
            {editingHere(i, 'qty') ? (
              cellInput('Edit quantity', true)
            ) : editable ? (
              <button
                type="button"
                className={editBtnStyle}
                onClick={() => start(i, 'qty', String(li.qty))}
                aria-label={`Edit quantity: ${li.qty}`}
              >
                <span className="tabular-nums">{li.qty}</span>
                <Icon name="edit" size={14} className="shrink-0 text-on-surface-variant/70" />
              </button>
            ) : (
              <span className="tabular-nums">{li.qty}</span>
            )}

            {editable ? (
              <select
                value={li.unit ?? 'each'}
                onChange={(e) => setUnit(i, e.target.value as LineUnit)}
                aria-label={`Unit for line ${i + 1}`}
                className={
                  ledger
                    ? 'min-h-[36px] rounded-field border border-outline-variant/60 bg-surface-container-lowest px-1.5 text-[14px] text-on-background transition active:scale-95'
                    : 'min-h-[36px] rounded-md bg-surface-container-high px-1.5 text-sm text-on-surface'
                }
              >
                {LINE_UNITS.map((u) => <option key={u} value={u}>{u === 'hour' ? 'hr' : u}</option>)}
              </select>
            ) : unitLabel(li.unit) ? (
              <span>{unitLabel(li.unit)}</span>
            ) : null}

            <span className="text-on-surface-variant/60">×</span>

            {editingHere(i, 'unit_price') ? (
              cellInput('Edit unit price', true)
            ) : editable ? (
              <button
                type="button"
                className={editBtnStyle}
                onClick={() => start(i, 'unit_price', String(li.unit_price))}
                aria-label={`Edit unit price: ${money(li.unit_price)}`}
              >
                <span className="tabular-nums">{money(li.unit_price)}</span>
                <Icon name="edit" size={14} className="shrink-0 text-on-surface-variant/70" />
              </button>
            ) : (
              <span className="tabular-nums">{money(li.unit_price)}</span>
            )}
          </div>

          {/* Control row: Up, Down, Dup, Delete */}
          {editable && (
            <div className={ledger
              ? 'mt-2 flex flex-wrap items-center gap-1.5 pl-[30px]'
              : 'mt-2 flex flex-wrap items-center gap-1.5 pl-5 border-t border-outline-variant/15 pt-2'}>
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className={ledger ? controlBtn : 'min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-md bg-surface-container-high font-medium text-xs text-on-surface transition active:scale-95 disabled:opacity-30 disabled:pointer-events-none disabled:bg-surface-container'}
                aria-label={`Move line ${i + 1} up`}
              >
                Up
              </button>

              <button
                type="button"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
                className={ledger ? controlBtn : 'min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-md bg-surface-container-high font-medium text-xs text-on-surface transition active:scale-95 disabled:opacity-30 disabled:pointer-events-none disabled:bg-surface-container'}
                aria-label={`Move line ${i + 1} down`}
              >
                Down
              </button>

              {!li.detail && (
                <button
                  type="button"
                  onClick={() => start(i, 'detail', '')}
                  className={ledger ? controlBtn : 'min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-md bg-surface-container-high font-medium text-xs text-on-surface transition active:scale-95'}
                  aria-label={`Add a description to line ${i + 1}`}
                >
                  + Description
                </button>
              )}

              <button
                type="button"
                onClick={() => duplicate(i)}
                className={ledger ? controlBtn : 'min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-md bg-surface-container-high font-medium text-xs text-on-surface transition active:scale-95'}
                aria-label={`Duplicate line ${i + 1}`}
              >
                Dup
              </button>

              <button
                type="button"
                onClick={() => remove(i)}
                className={
                  ledger
                    ? 'ml-auto grid h-11 w-11 place-items-center rounded-control text-error transition active:scale-90 active:bg-error-container/50'
                    : 'min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-md bg-error/10 text-error font-semibold text-xs transition active:scale-95 hover:bg-error/20'
                }
                aria-label={`Delete line ${i + 1}`}
              >
                {ledger ? <Icon name="delete" size={20} /> : 'Delete'}
              </button>
            </div>
          )}
        </div>
        </div>
      ))}

      {/* Add line item button */}
      {editable && (
        <button
          type="button"
          onClick={addLineItem}
          className={
            ledger
              ? 'flex min-h-[44px] w-full items-center gap-1.5 px-0 text-[15px] font-bold text-primary transition active:opacity-60'
              : 'w-full min-h-[44px] rounded-lg border border-dashed border-outline-variant/60 bg-surface-container-lowest/30 py-2.5 px-4 text-sm font-semibold text-primary transition hover:bg-primary/5 active:scale-[0.99] flex items-center justify-center gap-1.5'
          }
        >
          <Icon name="add" size={ledger ? 20 : 18} />
          <span>Add line item</span>
        </button>
      )}
    </div>
  );
}
