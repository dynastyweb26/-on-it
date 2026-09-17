'use client';
// ═══ The Vault ═══ Every PDF and receipt, searchable, forever.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';

export default function Vault() {
  const supabase = createClient();
  const router = useRouter();
  const [docs, setDocs] = useState<any[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      // Signed-out guard — redirect UX only; RLS is the real boundary. Same
      // pattern as summary/settings: getSession() is a no-network local read so
      // the decision can't hang on a stalled getUser(). Middleware only refreshes
      // the cookie; it never redirects.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      // Embed the parent invoice's deleted_at so a soft-deleted invoice's
      // archived PDF drops out of the Vault. vault_documents has no deleted_at
      // of its own, and invoice_id survives a soft delete (only a hard DELETE
      // would null it via ON DELETE SET NULL), so we filter on the parent.
      // Receipts and other docs have invoice_id null (no embed) and always stay.
      const { data } = await supabase
        .from('vault_documents')
        .select('*, invoices(deleted_at)')
        .order('created_at', { ascending: false })
        .limit(300);
      const visible = (data ?? []).filter((d: any) => {
        // Supabase embeds a to-one relation as an object (older shapes: an
        // array); handle both. No parent → keep (receipt/other).
        const inv = Array.isArray(d.invoices) ? d.invoices[0] : d.invoices;
        return !inv || inv.deleted_at == null;
      });
      setDocs(visible);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open(path: string) {
    const { data } = await supabase.storage.from('vault').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  const filtered = docs.filter((d) => d.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="px-4 py-4">
      <input className="input mb-3" placeholder="Search your documents…"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {filtered.length === 0 && (
        <p className="mt-16 text-center text-on-surface-variant">Every invoice you send lands here automatically.</p>
      )}
      <div className="space-y-2">
        {filtered.map((d) => (
          <button key={d.id} className="card flex w-full items-center gap-3 text-left" onClick={() => open(d.storage_path)}>
            <Icon name="description" size={22} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{d.title}</div>
              <div className="text-xs uppercase text-on-surface-variant/70">{d.doc_type} · {new Date(d.created_at).toLocaleDateString()}</div>
            </div>
            <Icon name="download" size={20} className="shrink-0 text-on-surface-variant" />
          </button>
        ))}
      </div>
    </div>
  );
}
