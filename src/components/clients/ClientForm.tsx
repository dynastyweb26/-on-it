'use client';
// ═══ New / Edit client ═══ (release frames 3c; UI-REDESIGN-AUDIT §1.9, merge 2 · 2·5)
// Cancel · title · Save. Name / Phone / Email / Address in one card, Notes in
// its own. Caps match the SQL checks (clients: name 1–120, phone 30, email
// 254, address 300, notes 500).
//
// New: save_client(), which upserts on the case-insensitive name, stamps
// saved_at and links every past invoice / quote billed to that name. While the
// typed name matches past documents, a note says so (client_name_usage()).
// Edit: a plain update of this row (a field can be cleared); a rename onto
// another client's name is refused by the unique name_key index.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { usageNote } from '@/lib/clients';

export type ClientFields = { name: string; phone: string; email: string; address: string; notes: string };
type Field = keyof ClientFields;

const CAP: Record<Field, number> = { name: 120, phone: 30, email: 254, address: 300, notes: 500 };
const EMPTY: ClientFields = { name: '', phone: '', email: '', address: '', notes: '' };

export default function ClientForm({ mode, id, initial, focus, onSaved, onCancel, barProps }: {
  mode: 'new' | 'edit';
  id?: string;
  initial?: Partial<ClientFields>;
  /** Field to focus on open (a detail-page tap on a missing phone, …). */
  focus?: string | null;
  /** Embedded use (the template's Client sheet, 2·10b): called instead of
   *  navigating. Without them the form behaves as the /clients pages expect. */
  onSaved?: (id: string) => void;
  onCancel?: () => void;
  /** Spread onto the Cancel · title · Save bar (the sheet makes it a drag handle). */
  barProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const start = useRef<ClientFields>({ ...EMPTY, ...initial });
  const [v, setV] = useState<ClientFields>(start.current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const refs = useRef<Partial<Record<Field, HTMLInputElement | HTMLTextAreaElement | null>>>({});

  useEffect(() => {
    const f = (focus ?? (mode === 'new' && !start.current.name ? 'name' : null)) as Field | null;
    if (f && f in CAP) refs.current[f]?.focus();
  }, [focus, mode]);

  // History note (New only): debounce the name, ask how many documents use it.
  useEffect(() => {
    if (mode !== 'new') return;
    const name = v.name.trim();
    if (!name) { setNote(null); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('client_name_usage', { p_name: name });
      const row = (Array.isArray(data) ? data[0] : data) as { invoices?: number; quotes?: number } | null;
      setNote(usageNote(name.split(/\s+/)[0], Number(row?.invoices ?? 0), Number(row?.quotes ?? 0)));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.name, mode]);

  const set = (f: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setError('');
    setV((s) => ({ ...s, [f]: e.target.value.slice(0, CAP[f]) }));
  };
  const dirty = (Object.keys(v) as Field[]).some((f) => v[f].trim() !== start.current[f].trim());
  const canSave = v.name.trim().length > 0 && dirty && !busy;
  const close = () => (onCancel ? onCancel()
    : window.history.length > 1 ? router.back() : router.replace(id ? `/clients/${id}` : '/clients'));

  async function save() {
    if (!canSave) return;
    const email = v.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('That email doesn’t look right.'); refs.current.email?.focus(); return; }
    setBusy(true);
    setError('');
    const clean = (s: string) => s.trim() || null;
    if (mode === 'new') {
      const { data, error: err } = await supabase.rpc('save_client', {
        p_name: v.name.trim(), p_phone: clean(v.phone), p_email: clean(email),
        p_address: clean(v.address), p_notes: clean(v.notes),
      });
      const row = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
      setBusy(false);
      if (err || !row?.id) { setError('Couldn’t save — check your connection and try again.'); return; }
      if (onSaved) onSaved(row.id); else router.replace(`/clients/${row.id}`);
      return;
    }
    const { error: err } = await supabase.from('clients').update({
      name: v.name.trim(), phone: clean(v.phone), email: clean(email),
      address: clean(v.address), notes: clean(v.notes),
    }).eq('id', id!);
    setBusy(false);
    if (err) {
      setError(err.code === '23505'
        ? `You already have a client named “${v.name.trim()}”.`
        : 'Couldn’t save — check your connection and try again.');
      return;
    }
    router.replace(`/clients/${id}`);
  }

  const input = (f: Exclude<Field, 'notes'>, label: string, placeholder: string, type = 'text', extra: Record<string, string> = {}) => (
    <label className="block border-b border-outline-variant/50 px-4 py-2.5 last:border-b-0">
      <span className="block text-[13px] text-on-surface-variant">{label}</span>
      <input ref={(el) => { refs.current[f] = el; }} type={type} value={v[f]} onChange={set(f)} placeholder={placeholder}
        maxLength={CAP[f]} className="w-full bg-transparent text-body-lg text-on-background outline-none placeholder:text-on-surface-variant/70" {...extra} />
    </label>
  );

  return (
    <div className="px-4 pb-8">
      {/* Sticky: Save stays reachable while the form scrolls (and above the keyboard in a sheet). */}
      <div {...barProps} data-form-bar="" className="sticky top-0 z-[1] flex h-14 items-center justify-between border-b border-outline-variant/60 bg-background">
        <button type="button" onClick={close} className="min-h-touch px-1 text-[17px] text-primary">Cancel</button>
        <h1 className="text-[17px] font-bold text-on-background">{mode === 'new' ? 'New client' : 'Edit client'}</h1>
        <button type="button" onClick={save} disabled={!canSave}
          className="min-h-touch px-1 text-[17px] font-bold text-primary disabled:opacity-40">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-card border border-outline-variant/60 bg-surface-container-lowest">
        {input('name', 'Name', 'Client name', 'text', { autoComplete: 'off', autoCapitalize: 'words' })}
        {input('phone', 'Phone', 'Add phone', 'tel', { autoComplete: 'off', inputMode: 'tel' })}
        {input('email', 'Email', 'Add email', 'email', { autoComplete: 'off', autoCapitalize: 'none' })}
        {input('address', 'Address', 'Add address', 'text', { autoComplete: 'off' })}
      </div>

      <label className="mt-3 block rounded-card border border-outline-variant/60 bg-surface-container-lowest px-4 py-2.5">
        <span className="block text-[13px] text-on-surface-variant">Notes</span>
        <textarea ref={(el) => { refs.current.notes = el; }} value={v.notes} onChange={set('notes')} rows={4} maxLength={CAP.notes}
          placeholder="Gate code, preferred contact time…"
          className="w-full resize-none bg-transparent text-body-lg text-on-background outline-none placeholder:text-on-surface-variant/70" />
      </label>

      {note && (
        <p className="onit-rise mt-3 flex items-start gap-2.5 rounded-card bg-primary-soft px-4 py-3 text-body-md text-on-background">
          <Icon name="history" size={20} className="mt-0.5 shrink-0" />{note}
        </p>
      )}
      {error && <p role="alert" className="mt-3 rounded-input bg-error-container px-4 py-2.5 text-body-md font-semibold text-error-on-container">{error}</p>}
    </div>
  );
}
