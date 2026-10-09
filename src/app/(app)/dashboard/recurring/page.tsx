'use client';
// ═══ Recurring ═══ (release frames 3h / 3j; UI-REDESIGN-AUDIT §1.12, merge 3 · 3·2)
// Reached from Books. Title + PRO tag (a feature tag shown to everyone, F6),
// gold + (new item). The dark card: "$X per month · N recurring" (weekly ×
// 52 / 12, yearly / 12; paused items included) and "On It logs each charge on
// its date"; the PRO note; Next 2 weeks (total + rows, weekly items repeat);
// All recurring A–Z: vendor, "Category · Monthly", amount, "Next Nov 2" /
// "Paused", a skip notice when On It couldn't log a charge. Tap → edit; swipe
// or long-press → Edit / Delete (soft, with Undo; logged expenses stay).
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import UndoToast from '@/components/UndoToast';
import ProTag from '@/components/recurring/ProTag';
import { AlphaSections, ListRow, ListSkeleton, RowMenu } from '@/components/lists/SavedList';
import { createClient } from '@/lib/supabase/client';
import { groupByLetter } from '@/lib/clients';
import { money } from '@/lib/financials';
import {
  RECURRING_COLS, RECURRING_PATH, dayTag, localToday, monthlyTotal, nextLine, normalizeRecurring, recurringSubtitle,
  skipNotice, upcoming, type Recurring,
} from '@/lib/recurring';

export default function RecurringPage() {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<Recurring[] | null>(null);
  const [menu, setMenu] = useState<{ row: Recurring; rect: DOMRect } | null>(null);
  const [removed, setRemoved] = useState<Recurring | null>(null);
  const [failed, setFailed] = useState(false);
  const today = localToday();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data, error } = await supabase.from('recurring_expenses').select(RECURRING_COLS)
        .is('deleted_at', null).limit(500);
      if (error) { setFailed(true); setRows([]); return; }
      setRows(((data ?? []) as Record<string, unknown>[]).map(normalizeRecurring));
    })().catch(() => { setFailed(true); setRows([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => groupByLetter(rows ?? [], (r) => r.vendor), [rows]);
  const soon = useMemo(() => upcoming(rows ?? [], today), [rows, today]);
  const soonTotal = soon.reduce((s, u) => s + u.item.amount, 0);

  const edit = (r: Recurring) => router.push(`${RECURRING_PATH}/${r.id}`);
  const add = () => router.push(`${RECURRING_PATH}/new`);

  async function remove(r: Recurring) {
    setMenu(null);
    setRows((rs) => (rs ?? []).filter((x) => x.id !== r.id));
    const { error } = await supabase.from('recurring_expenses').update({ deleted_at: new Date().toISOString() }).eq('id', r.id);
    if (error) { setRows((rs) => [...(rs ?? []), r]); return; }
    setRemoved(r);
  }
  async function undo() {
    if (!removed) return;
    const r = removed;
    setRemoved(null);
    setRows((rs) => [...(rs ?? []), r]);
    const { error } = await supabase.from('recurring_expenses').update({ deleted_at: null }).eq('id', r.id);
    if (error) setRows((rs) => (rs ?? []).filter((x) => x.id !== r.id));
  }

  const header = (
    <div className="flex items-center justify-between px-1 pb-3">
      <h1 className="flex items-center gap-2.5 font-display text-[28px] font-extrabold leading-tight">Recurring <ProTag /></h1>
      <button type="button" aria-label="New recurring expense" onClick={add}
        className="grid h-9 w-9 place-items-center rounded-full bg-primary-container text-on-background active:scale-90">
        <Icon name="add" size={24} />
      </button>
    </div>
  );

  if (rows === null) return <div className="px-4 pt-2">{header}<ListSkeleton /></div>;

  if (rows.length === 0 && !removed) {
    return (
      <div className="px-4 pt-2">
        {header}
        {failed && <p role="status" className="mt-2 rounded-input bg-error-container px-4 py-2.5 text-body-md font-semibold text-error-on-container">Couldn’t load recurring expenses. Check your connection and try again.</p>}
        <div className="onit-rise mt-20 px-4 text-center">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary-soft text-on-background">
            <Icon name="autorenew" size={36} />
          </span>
          <h2 className="mt-5 font-display text-xl font-bold text-on-background">No recurring expenses</h2>
          <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">
            Add rent, insurance or software once. On It logs each one on its date, so you don’t have to.
          </p>
          <button type="button" className="btn-primary mx-auto mt-6 px-7" onClick={add}>
            <Icon name="add" size={22} /> Add recurring expense
          </button>
          <p className="mx-auto mt-4 max-w-xs text-[13px] text-on-surface-variant">When a charge repeats, On It will offer to set it up.</p>
        </div>
      </div>
    );
  }

  const body = (r: Recurring) => {
    const notice = skipNotice(r, true);
    return (
      <>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-bold text-on-background">{r.vendor}</span>
          <span className="block truncate text-[14px] text-on-surface-variant">{recurringSubtitle(r)}</span>
          {notice && <span className="mt-0.5 block truncate text-[13px] font-semibold text-error">{notice}</span>}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[16px] font-bold tabular-nums text-on-background">{money(r.amount)}</span>
          <span className="block text-[13px] text-on-surface-variant">{nextLine(r, today)}</span>
        </span>
      </>
    );
  };

  return (
    <div className="px-4 pb-6 pt-2">
      {header}
      <div className="rounded-card bg-inverse-surface px-5 py-4 text-inverse-on-surface">
        <div className="font-display text-[34px] font-extrabold leading-tight tabular-nums">{money(monthlyTotal(rows))}</div>
        <div className="text-[16px] font-semibold opacity-90">per month · {rows.length} recurring</div>
        <div className="mt-2.5 flex items-center gap-1.5 text-[13.5px] opacity-75">
          <Icon name="autorenew" size={16} /> On It logs each charge on its date.
        </div>
      </div>
      <p className="mt-2.5 px-1 text-[13.5px] text-on-surface-variant">PRO is part of an upcoming plan. It’s included free for now.</p>

      <section aria-label="Next 2 weeks" className="mt-4">
        <div className="flex items-baseline justify-between border-b-2 border-outline-variant/60 px-1 pb-2">
          <h2 className="text-[17px] font-bold text-on-background">Next 2 weeks</h2>
          <span className="text-[15px] font-bold tabular-nums text-on-surface-variant">{money(soonTotal)}</span>
        </div>
        {soon.length === 0 ? (
          <p className="px-1 py-3 text-[14px] text-on-surface-variant">Nothing due in the next 2 weeks.</p>
        ) : soon.map((u) => (
          <div key={`${u.item.id}-${u.date}`} className="flex items-center gap-3 border-b border-outline-variant/40 px-1 py-2.5 text-[15px]">
            <span className="w-14 shrink-0 text-[12.5px] font-bold tracking-wide text-[#8C6D10]">{dayTag(u.date)}</span>
            <span className="min-w-0 flex-1 truncate text-on-background">{u.item.vendor}{u.item.auto_log ? '' : ' · paused'}</span>
            <span className="shrink-0 font-semibold tabular-nums">{money(u.item.amount)}</span>
          </div>
        ))}
      </section>

      <h2 className="mt-5 px-1 text-[17px] font-bold text-on-background">All recurring</h2>
      <AlphaSections groups={groups} idPrefix="recurring" showRail={false}
        renderRow={(r) => (
          <ListRow key={r.id} id={`recurring-row-${r.id}`} onOpen={() => edit(r)} onEdit={() => edit(r)} onDelete={() => remove(r)}
            onLongPress={(rect) => setMenu({ row: r, rect })}>
            {body(r)}
          </ListRow>
        )} />

      {menu && (
        <RowMenu rect={menu.rect} label={`${menu.row.vendor} actions`} onClose={() => setMenu(null)}
          lifted={<div className="flex items-center gap-3">{body(menu.row)}</div>}
          items={[
            { label: 'Edit', icon: 'edit', onClick: () => { const r = menu.row; setMenu(null); edit(r); } },
            { label: 'Stop & delete', icon: 'delete', danger: true, onClick: () => remove(menu.row) },
          ]} />
      )}

      {removed && <UndoToast message={`Stopped ${removed.vendor}. Logged expenses stay.`} onUndo={undo} onDismiss={() => setRemoved(null)} />}
    </div>
  );
}
