'use client';
// ═══ Products & Services segment ═══ (release frames 3e / 3g; UI-REDESIGN-AUDIT §1.10)
// Saved items only (saved_at set, not deleted), A–Z with letter headers and
// a scrub rail, live search, a gold + (new item). Row: name, "description ·
// per unit", price ("$450.00", "$65.00/hr", "No price" muted). Tap → Edit.
// Swipe left → Edit / Delete; long-press → Edit · Duplicate · Delete.
// Duplicate saves "{name} (copy)". Delete is soft (deleted_at) with Undo; a
// later use on an invoice brings the item back as unsaved history.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import UndoToast from '@/components/UndoToast';
import { AlphaSections, ListRow, ListSkeleton, RowMenu, SavedEmpty, SearchBar } from '@/components/lists/SavedList';
import { createClient } from '@/lib/supabase/client';
import { groupByLetter, matchesQuery } from '@/lib/clients';
import { PRODUCT_COLS, copyName, normalizeProduct, priceText, productSubtitle, type Product } from '@/lib/products';

export default function ProductsList() {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<Product[] | null>(null);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ row: Product; rect: DOMRect } | null>(null);
  const [removed, setRemoved] = useState<Product | null>(null);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data } = await supabase.from('products').select(PRODUCT_COLS)
        .not('saved_at', 'is', null).is('deleted_at', null).limit(500);
      setRows(((data ?? []) as Record<string, unknown>[]).map(normalizeProduct));
    })().catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => (rows ?? []).filter((p) => matchesQuery(p.name, query)), [rows, query]);
  const groups = useMemo(() => groupByLetter(shown, (p) => p.name), [shown]);

  const edit = (p: Product) => router.push(`/clients/products/${p.id}`);
  const add = () => router.push('/clients/products/new');

  async function remove(p: Product) {
    setMenu(null);
    setRows((rs) => (rs ?? []).filter((r) => r.id !== p.id));
    const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', p.id);
    if (error) { setRows((rs) => [...(rs ?? []), p]); return; }
    setRemoved(p);
  }

  async function undo() {
    if (!removed) return;
    const p = removed;
    setRemoved(null);
    setRows((rs) => [...(rs ?? []), p]);
    const { error } = await supabase.from('products').update({ deleted_at: null }).eq('id', p.id);
    if (error) setRows((rs) => (rs ?? []).filter((r) => r.id !== p.id));
  }

  async function duplicate(p: Product) {
    setMenu(null);
    setFailed('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    // Every name on file (saved, history, deleted) is taken: name_key is unique per owner.
    const { data: names } = await supabase.from('products').select('name').limit(2000);
    const name = copyName(p.name, ((names ?? []) as { name: string }[]).map((n) => n.name));
    const { data, error } = await supabase.from('products').insert({
      user_id: session.user.id, name, unit: p.unit, unit_price: p.unit_price, detail: p.detail,
      saved_at: new Date().toISOString(),
    }).select(PRODUCT_COLS).single();
    if (error || !data) { setFailed('Couldn’t duplicate — check your connection and try again.'); return; }
    setRows((rs) => [...(rs ?? []), normalizeProduct(data as Record<string, unknown>)]);
  }

  if (rows === null) return <ListSkeleton />;

  if (rows.length === 0 && !removed) {
    return (
      <SavedEmpty icon="handyman" round={false} title="Nothing saved yet"
        body="Add the jobs you do most, with a price if you have one. Picking one in an invoice fills in the price."
        action="Add product or service" onAction={add} />
    );
  }

  const body = (p: Product) => {
    const price = priceText(p);
    return (
      <>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-bold text-on-background">{p.name}</span>
          <span className="block truncate text-[14px] text-on-surface-variant">{productSubtitle(p)}</span>
        </span>
        <span className={`shrink-0 text-[16px] tabular-nums ${price ? 'font-bold text-on-background' : 'text-on-surface-variant'}`}>
          {price ?? 'No price'}
        </span>
      </>
    );
  };

  return (
    <div className="mt-4">
      <SearchBar value={query} onChange={setQuery} label="Search products and services" addLabel="New product or service"
        placeholder={`Search ${rows.length} ${rows.length === 1 ? 'item' : 'items'}`} onAdd={add} />

      {failed && <p role="status" className="mt-3 rounded-input bg-error-container px-4 py-2.5 text-body-md font-semibold text-error-on-container">{failed}</p>}

      {shown.length === 0 ? (
        <p className="mt-10 text-center text-body-md text-on-surface-variant">No items match “{query.trim()}”</p>
      ) : (
        <AlphaSections groups={groups} idPrefix="products" showRail={!query.trim()}
          renderRow={(p) => (
            <ListRow key={p.id} onOpen={() => edit(p)} onEdit={() => edit(p)} onDelete={() => remove(p)}
              onLongPress={(rect) => setMenu({ row: p, rect })}>
              {body(p)}
            </ListRow>
          )} />
      )}

      {menu && (
        <RowMenu rect={menu.rect} label={`${menu.row.name} actions`} onClose={() => setMenu(null)}
          lifted={<div className="flex items-center gap-3">{body(menu.row)}</div>}
          items={[
            { label: 'Edit', icon: 'edit', onClick: () => { const p = menu.row; setMenu(null); edit(p); } },
            { label: 'Duplicate', icon: 'content_copy', onClick: () => duplicate(menu.row) },
            { label: 'Delete', icon: 'delete', danger: true, onClick: () => remove(menu.row) },
          ]} />
      )}

      {removed && <UndoToast message="Item deleted." onUndo={undo} onDismiss={() => setRemoved(null)} />}
    </div>
  );
}
