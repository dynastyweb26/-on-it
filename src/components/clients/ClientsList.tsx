'use client';
// ═══ Clients segment ═══ (release frames 3a / 3d; UI-REDESIGN-AUDIT §1.7)
// Saved clients only (client_summaries() where saved), A–Z with letter
// headers and a scrub rail, live search, a gold + (New client). Each row:
// initials, name, status line ("Paid up" / "1 open · $310.00" / overdue in
// red / "1 quote out"). Swipe left or long-press → Edit / Delete. Delete =
// un-save and clear phone / email / address / notes (Q6) with Undo; the
// client row itself and every invoice stay, so it lives on as history.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import UndoToast from '@/components/UndoToast';
import { AlphaSections, ListRow, ListSkeleton, RowMenu, SavedEmpty, SearchBar } from '@/components/lists/SavedList';
import { createClient } from '@/lib/supabase/client';
import { clientStatus, groupByLetter, initials, matchesQuery, normalizeSummary, type ClientSummary } from '@/lib/clients';

type Removed = {
  row: ClientSummary;
  prev: { saved_at: string | null; phone: string | null; email: string | null; address: string | null; notes: string | null };
};

export default function ClientsList() {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<ClientSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ row: ClientSummary; rect: DOMRect } | null>(null);
  const [removed, setRemoved] = useState<Removed | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data } = await supabase.rpc('client_summaries');
      setRows(((data ?? []) as Record<string, unknown>[]).map(normalizeSummary).filter((c) => c.saved));
    })().catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => (rows ?? []).filter((c) => matchesQuery(c.name, query)), [rows, query]);
  const groups = useMemo(() => groupByLetter(shown, (c) => c.name), [shown]);

  const open = (c: ClientSummary) => router.push(`/clients/${c.id}`);
  const edit = (c: ClientSummary) => router.push(`/clients/${c.id}/edit`);

  async function remove(c: ClientSummary) {
    setMenu(null);
    const { data: prev, error: readErr } = await supabase.from('clients')
      .select('saved_at, phone, email, address, notes').eq('id', c.id).maybeSingle();
    if (readErr || !prev) return;
    setRows((rs) => (rs ?? []).filter((r) => r.id !== c.id));
    const { error } = await supabase.from('clients')
      .update({ saved_at: null, phone: null, email: null, address: null, notes: null }).eq('id', c.id);
    if (error) { setRows((rs) => [...(rs ?? []), c]); return; }
    setRemoved({ row: c, prev: prev as Removed['prev'] });
  }

  async function undo() {
    if (!removed) return;
    const { row, prev } = removed;
    setRemoved(null);
    setRows((rs) => [...(rs ?? []), row]);
    const { error } = await supabase.from('clients').update(prev).eq('id', row.id);
    if (error) setRows((rs) => (rs ?? []).filter((r) => r.id !== row.id));
  }

  if (rows === null) return <ListSkeleton />;

  if (rows.length === 0 && !removed) {
    return (
      <SavedEmpty icon="group" title="No clients yet"
        body="Save a client once and you can pick them in a tap. On It will also offer to save anyone you bill twice."
        action="Add client" onAction={() => router.push('/clients/new')} />
    );
  }

  const nameAndStatus = (c: ClientSummary) => {
    const status = clientStatus(c);
    return (
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-bold text-on-background">{c.name}</span>
        <span className={`block truncate text-[14px] ${status.tone === 'overdue' ? 'font-semibold text-error' : 'text-on-surface-variant'}`}>{status.text}</span>
      </span>
    );
  };

  return (
    <div className="mt-4">
      <SearchBar value={query} onChange={setQuery} label="Search clients" addLabel="New client"
        placeholder={`Search ${rows.length} ${rows.length === 1 ? 'client' : 'clients'}`}
        onAdd={() => router.push('/clients/new')} />

      {shown.length === 0 ? (
        <p className="mt-10 text-center text-body-md text-on-surface-variant">No clients match “{query.trim()}”</p>
      ) : (
        <AlphaSections groups={groups} idPrefix="clients" showRail={!query.trim()}
          renderRow={(c) => (
            <ListRow key={c.id} onOpen={() => open(c)} onEdit={() => edit(c)} onDelete={() => remove(c)}
              onLongPress={(rect) => setMenu({ row: c, rect })}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-[15px] font-bold text-primary-on-container">
                {initials(c.name)}
              </span>
              {nameAndStatus(c)}
              <Icon name="chevron_right" size={20} className="shrink-0 text-outline" />
            </ListRow>
          )} />
      )}

      {menu && (
        <RowMenu rect={menu.rect} lifted={nameAndStatus(menu.row)} label={`${menu.row.name} actions`} onClose={() => setMenu(null)}
          items={[
            { label: 'Edit', icon: 'edit', onClick: () => { const c = menu.row; setMenu(null); edit(c); } },
            { label: 'Delete', icon: 'delete', danger: true, onClick: () => remove(menu.row) },
          ]} />
      )}

      {removed && <UndoToast message="Client deleted." onUndo={undo} onDismiss={() => setRemoved(null)} />}
    </div>
  );
}
