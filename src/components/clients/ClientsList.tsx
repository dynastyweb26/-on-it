'use client';
// ═══ Clients segment ═══ (release frames 3a / 3d; UI-REDESIGN-AUDIT §1.7)
// Saved clients only (client_summaries() where saved), A–Z with letter
// headers and a scrub rail, live search, a gold + (New client). Each row:
// initials, name, status line ("Paid up" / "1 open · $310.00" / overdue in
// red / "1 quote out"). Swipe left or long-press → Edit / Delete. Delete =
// un-save and clear phone / email / address / notes (Q6) with Undo; the
// client row itself and every invoice stay, so it lives on as history.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import SwipeableRow from '@/components/SwipeableRow';
import UndoToast from '@/components/UndoToast';
import { createClient } from '@/lib/supabase/client';
import {
  RAIL_LETTERS, clientStatus, groupByLetter, initials, matchesQuery, normalizeSummary, type ClientSummary,
} from '@/lib/clients';

type Removed = {
  row: ClientSummary;
  prev: { saved_at: string | null; phone: string | null; email: string | null; address: string | null; notes: string | null };
};

const LONG_PRESS_MS = 450;

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
  const present = useMemo(() => new Set(groups.map((g) => g.letter)), [groups]);

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

  // ── Scrub rail: tap or drag a letter → jump to it (or the next letter with rows).
  const railRef = useRef<HTMLDivElement>(null);
  const lastJump = useRef('');
  function jumpAt(clientY: number) {
    const rail = railRef.current;
    if (!rail) return;
    const r = rail.getBoundingClientRect();
    const i = Math.min(RAIL_LETTERS.length - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * RAIL_LETTERS.length)));
    const target = RAIL_LETTERS.slice(i).find((l) => present.has(l)) ?? [...present].pop();
    if (!target || target === lastJump.current) return;
    lastJump.current = target;
    document.getElementById(`clients-letter-${target}`)?.scrollIntoView({ block: 'start' });
    try { navigator.vibrate?.(5); } catch { /* unsupported */ }
  }

  if (rows === null) {
    return (
      <div className="mt-4 space-y-3" aria-busy="true">
        <div className="h-12 animate-pulse rounded-full bg-surface-container" />
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-surface-container" />)}
      </div>
    );
  }

  if (rows.length === 0 && !removed) {
    return (
      <div className="onit-rise mt-20 px-4 text-center">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary-soft text-on-background">
          <Icon name="group" size={36} />
        </span>
        <h1 className="mt-5 font-display text-xl font-bold text-on-background">No clients yet</h1>
        <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">
          Save a client once and you can pick them in a tap. On It will also offer to save anyone you bill twice.
        </p>
        <button type="button" className="btn-primary mx-auto mt-6 px-7" onClick={() => router.push('/clients/new')}>
          <Icon name="add" size={22} /> Add client
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest px-4">
          <Icon name="search" size={20} className="shrink-0 text-on-surface-variant" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${rows.length} ${rows.length === 1 ? 'client' : 'clients'}`}
            aria-label="Search clients"
            className="min-w-0 flex-1 bg-transparent text-body-lg text-on-background outline-none placeholder:text-on-surface-variant"
          />
        </label>
        <button type="button" aria-label="New client" onClick={() => router.push('/clients/new')}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary-container text-on-background shadow-card transition active:scale-90">
          <Icon name="add" size={26} />
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="mt-10 text-center text-body-md text-on-surface-variant">No clients match “{query.trim()}”</p>
      ) : (
        <div className="relative mt-2 pr-5">
          {groups.map((g) => (
            <section key={g.letter} aria-label={g.letter}>
              <h2 id={`clients-letter-${g.letter}`}
                className="sticky top-0 z-[1] bg-background pb-1 pt-3 text-label-lg font-bold text-[#8C6D10]">{g.letter}</h2>
              {g.rows.map((c) => (
                <ClientRow key={c.id} c={c} onOpen={() => open(c)} onEdit={() => edit(c)} onDelete={() => remove(c)}
                  onLongPress={(rect) => setMenu({ row: c, rect })} />
              ))}
            </section>
          ))}

          {/* The rail sits beside the list and sticks to the top while it scrolls. */}
          {!query.trim() && (
            <div className="absolute bottom-0 right-0 top-0 w-5">
              <div ref={railRef} aria-hidden data-no-tab-swipe="true"
                className="sticky top-2 flex touch-none select-none flex-col items-center pt-3"
                onPointerDown={(e) => { (e.target as Element).releasePointerCapture?.(e.pointerId); lastJump.current = ''; jumpAt(e.clientY); }}
                onPointerMove={(e) => { if (e.buttons) jumpAt(e.clientY); }}>
                {RAIL_LETTERS.map((l) => (
                  <span key={l} className={`w-5 text-center text-[10.5px] font-bold leading-[15px] ${present.has(l) ? 'text-[#8C6D10]' : 'text-[#D6CCB8]'}`}>{l}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {menu && <RowMenu menu={menu} onClose={() => setMenu(null)}
        onEdit={() => { const c = menu.row; setMenu(null); edit(c); }}
        onDelete={() => remove(menu.row)} />}

      {removed && <UndoToast message="Client deleted." onUndo={undo} onDismiss={() => setRemoved(null)} />}
    </div>
  );
}

function ClientRow({ c, onOpen, onEdit, onDelete, onLongPress }: {
  c: ClientSummary;
  onOpen: () => void; onEdit: () => void; onDelete: () => void;
  onLongPress: (rect: DOMRect) => void;
}) {
  const status = clientStatus(c);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const ref = useRef<HTMLButtonElement>(null);
  const cancel = () => { clearTimeout(timer.current); start.current = null; };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <SwipeableRow flat onEdit={onEdit} onDelete={onDelete}>
      <button ref={ref} type="button"
        className="flex min-h-[64px] w-full items-center gap-3 border-b border-outline-variant/50 py-2.5 text-left active:bg-surface-container"
        onPointerDown={(e) => {
          fired.current = false;
          start.current = { x: e.clientX, y: e.clientY };
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            fired.current = true;
            try { navigator.vibrate?.(10); } catch { /* unsupported */ }
            if (ref.current) onLongPress(ref.current.getBoundingClientRect());
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(e) => {
          if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) cancel();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => { if (fired.current) { fired.current = false; return; } onOpen(); }}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-[15px] font-bold text-primary-on-container">
          {initials(c.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-bold text-on-background">{c.name}</span>
          <span className={`block truncate text-[14px] ${status.tone === 'overdue' ? 'font-semibold text-error' : 'text-on-surface-variant'}`}>{status.text}</span>
        </span>
        <Icon name="chevron_right" size={20} className="shrink-0 text-outline" />
      </button>
    </SwipeableRow>
  );
}

/** Long-press menu (frames 3e): the row lifts over a dimmed list, Edit / Delete below it. */
function RowMenu({ menu, onClose, onEdit, onDelete }: {
  menu: { row: ClientSummary; rect: DOMRect };
  onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const { rect, row } = menu;
  const below = rect.bottom + 132 < window.innerHeight;
  const status = clientStatus(row);
  return (
    <div className="fixed inset-0 z-[60]" data-no-tab-swipe="true">
      <div className="onit-composer-scrim absolute inset-0 bg-on-background/30" onClick={onClose} />
      <div className="onit-pop absolute rounded-card bg-surface-container-lowest px-4 py-2.5 shadow-card-raised"
        style={{ left: rect.left - 8, top: rect.top - 4, width: rect.width + 16 }}>
        <div className="truncate text-[17px] font-bold text-on-background">{row.name}</div>
        <div className={`truncate text-[14px] ${status.tone === 'overdue' ? 'font-semibold text-error' : 'text-on-surface-variant'}`}>{status.text}</div>
      </div>
      <div role="menu" aria-label={`${row.name} actions`}
        className="onit-pop absolute w-56 overflow-hidden rounded-card bg-surface-container-lowest shadow-card-raised"
        style={below ? { left: rect.left, top: rect.bottom + 8 } : { left: rect.left, top: rect.top - 8 - 112 }}>
        <button type="button" role="menuitem" onClick={onEdit}
          className="flex h-14 w-full items-center justify-between border-b border-outline-variant/50 px-4 text-body-lg text-on-background active:bg-surface-container">
          Edit <Icon name="edit" size={20} />
        </button>
        <button type="button" role="menuitem" onClick={onDelete}
          className="flex h-14 w-full items-center justify-between px-4 text-body-lg text-error active:bg-surface-container">
          Delete <Icon name="delete" size={20} />
        </button>
      </div>
    </div>
  );
}
