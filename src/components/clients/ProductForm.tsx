'use client';
// ═══ New / Edit item ═══ (release frames 3f; UI-REDESIGN-AUDIT §1.11, merge 2 · 2·8)
// Cancel · title · Save. Name + Price · optional (one card), Unit segment
// (each · hour · sq ft · job), Description · optional, shows on invoices
// (<= 300, the SQL cap). Edit adds "Used on N invoices · last on …" and
// Delete item (soft delete; a later use brings it back as unsaved history).
//
// New: an item already on file under that name (history from past invoices,
// or deleted) is saved in place rather than duplicated — name_key is unique
// per owner; one that is already saved is refused with a clear message.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/financials';
import { clientNameKey } from '@/lib/client-name';
import { UNITS, parsePrice, usedLine, type Product, type Unit } from '@/lib/products';

const LIST = '/clients?segment=products';

export type SavedItem = { name: string; unit: Unit; unit_price: number | null; detail: string | null };

export default function ProductForm({ mode, product, initialName, onSaved, onCancel, barProps }: {
  mode: 'new' | 'edit';
  product?: Product;
  /** New: pre-fills the name (the template sheet's search). */
  initialName?: string;
  /** Embedded use (the template's Product or service sheet, 2·10b): called
   *  instead of navigating. Without them the form behaves as the pages expect. */
  onSaved?: (item: SavedItem) => void;
  onCancel?: () => void;
  /** Spread onto the Cancel · title · Save bar (the sheet makes it a drag handle). */
  barProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(product?.name ?? initialName ?? '');
  const [price, setPrice] = useState(product?.unit_price != null ? money(product.unit_price) : '');
  const [unit, setUnit] = useState<Unit>(product?.unit ?? 'each');
  const [detail, setDetail] = useState(product?.detail ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // Keep a save error in view (inside a sheet the keyboard can cover it).
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [error]);

  useEffect(() => { if (mode === 'new' && !initialName) nameRef.current?.focus(); }, [mode, initialName]);

  const parsed = parsePrice(price);
  const dirty = mode === 'new'
    || name.trim() !== product!.name
    || unit !== product!.unit
    || (detail.trim() || null) !== (product!.detail ?? null)
    || (Number.isNaN(parsed) ? true : parsed !== product!.unit_price);
  const canSave = name.trim().length > 0 && dirty && !busy;
  const close = () => (onCancel ? onCancel() : window.history.length > 1 ? router.back() : router.replace(LIST));

  async function save() {
    if (!canSave) return;
    if (Number.isNaN(parsed)) { setError('Enter a price like 450 or 3.25, or leave it empty.'); priceRef.current?.focus(); return; }
    setBusy(true);
    setError('');
    const fields = { name: name.trim(), unit, unit_price: parsed, detail: detail.trim() || null };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setBusy(false); router.replace('/login'); return; }
    let err: { code?: string } | null = null;
    if (mode === 'edit') {
      ({ error: err } = await supabase.from('products').update(fields).eq('id', product!.id));
    } else {
      const { data: existing } = await supabase.from('products').select('id, saved_at, deleted_at')
        .eq('name_key', clientNameKey(fields.name)).maybeSingle();
      const ex = existing as { id: string; saved_at: string | null; deleted_at: string | null } | null;
      if (ex && ex.saved_at && !ex.deleted_at) {
        setBusy(false);
        setError(`You already have an item named “${fields.name}”.`);
        return;
      }
      const now = new Date().toISOString();
      ({ error: err } = ex
        ? await supabase.from('products').update({ ...fields, saved_at: now, deleted_at: null }).eq('id', ex.id)
        : await supabase.from('products').insert({ ...fields, user_id: session.user.id, saved_at: now }));
    }
    setBusy(false);
    if (err) {
      setError(err.code === '23505' ? `You already have an item named “${fields.name}”.` : 'Couldn’t save — check your connection and try again.');
      return;
    }
    if (onSaved) onSaved(fields); else router.replace(LIST);
  }

  async function remove() {
    if (!product || busy) return;
    setBusy(true);
    const { error: err } = await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', product.id);
    setBusy(false);
    if (err) { setError('Couldn’t delete — check your connection and try again.'); return; }
    router.replace(LIST);
  }

  return (
    <div className="flex min-h-full flex-col px-4 pb-8">
      <div {...barProps} className="flex h-14 items-center justify-between border-b border-outline-variant/60">
        <button type="button" onClick={close} className="min-h-touch px-1 text-[17px] text-primary">Cancel</button>
        <h1 className="text-[17px] font-bold text-on-background">{mode === 'new' ? 'New item' : 'Edit item'}</h1>
        <button type="button" onClick={save} disabled={!canSave}
          className="min-h-touch px-1 text-[17px] font-bold text-primary disabled:opacity-40">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-card border border-outline-variant/60 bg-surface-container-lowest">
        <label className="block border-b border-outline-variant/50 px-4 py-2.5">
          <span className="block text-[13px] text-on-surface-variant">Name</span>
          <input ref={nameRef} value={name} maxLength={120} autoComplete="off" placeholder="Deck staining"
            onChange={(e) => { setError(''); setName(e.target.value); }}
            className="w-full bg-transparent text-body-lg text-on-background outline-none placeholder:text-on-surface-variant/70" />
        </label>
        <label className="block px-4 py-2.5">
          <span className="block text-[13px] text-on-surface-variant">Price · optional</span>
          <input ref={priceRef} value={price} inputMode="decimal" autoComplete="off" placeholder="$0.00"
            onChange={(e) => { setError(''); setPrice(e.target.value.slice(0, 16)); }}
            onBlur={() => { const n = parsePrice(price); if (n != null && !Number.isNaN(n)) setPrice(money(n)); }}
            className="w-full bg-transparent font-display text-[24px] font-extrabold text-on-background outline-none placeholder:text-on-surface-variant/50" />
        </label>
      </div>

      <div className="mt-4 px-1 text-[13px] text-on-surface-variant">Unit</div>
      <div role="radiogroup" aria-label="Unit" className="mt-1.5 grid grid-cols-4 rounded-[14px] bg-surface-container p-1">
        {UNITS.map((u) => (
          <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)}
            className={`h-10 rounded-[10px] text-[15px] transition-colors active:scale-95
              ${unit === u ? 'bg-surface-container-lowest font-bold text-on-background shadow-card' : 'text-on-surface-variant'}`}>
            {u}
          </button>
        ))}
      </div>

      <label className="mt-4 block rounded-card border border-outline-variant/60 bg-surface-container-lowest px-4 py-2.5">
        <span className="block text-[13px] text-on-surface-variant">Description · optional, shows on invoices</span>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} maxLength={300}
          placeholder="Two coats, semi-transparent…"
          className="w-full resize-none bg-transparent text-body-lg text-on-background outline-none placeholder:text-on-surface-variant/70" />
      </label>

      {mode === 'edit' && product && <p className="mt-4 px-1 text-[14px] text-on-surface-variant">{usedLine(product)}</p>}
      {error && <p ref={errorRef} role="status" className="mt-3 rounded-input bg-error-container px-4 py-2.5 text-body-md font-semibold text-error-on-container">{error}</p>}

      {mode === 'edit' && (
        <button type="button" onClick={remove} disabled={busy}
          className="mt-auto flex h-14 w-full items-center justify-center gap-2 rounded-full border border-error/30 text-[17px] font-bold text-error transition active:scale-[0.98] disabled:opacity-40">
          <Icon name="delete" size={20} /> Delete item
        </button>
      )}
    </div>
  );
}
