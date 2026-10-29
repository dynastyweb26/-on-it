'use client';
// ═══ The Vault ═══ Every PDF and receipt, searchable, forever.
// Loading is a skeleton, a failed read is an error with Retry (never the empty
// copy), and a genuinely empty Vault offers one action.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import EmptyState from '@/components/EmptyState';
import VaultSkeleton from '@/components/VaultSkeleton';
import { createClient } from '@/lib/supabase/client';
import { getSharedUser } from '@/lib/auth-client';
import { userMessage } from '@/lib/errors';

type VaultDoc = {
  id: string;
  title: string;
  doc_type: string;
  storage_path: string;
  created_at: string;
  invoices?: { deleted_at: string | null } | { deleted_at: string | null }[] | null;
};

export default function Vault() {
  const supabase = createClient();
  const router = useRouter();
  const [docs, setDocs] = useState<VaultDoc[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setDocs(null);
    // Signed-out guard — redirect UX only; RLS is the real boundary.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace('/login'); return; }
    const { data: { user } } = await getSharedUser();
    if (!user) { router.replace('/login'); return; }
    // Embed the parent invoice's deleted_at so a soft-deleted invoice's
    // archived PDF drops out of the Vault. Receipts and other docs have
    // invoice_id null (no embed) and always stay.
    const { data, error: readError } = await supabase
      .from('vault_documents')
      .select('*, invoices(deleted_at)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (readError) {
      setError(userMessage(readError));
      setDocs([]);
      return;
    }
    const visible = ((data ?? []) as VaultDoc[]).filter((d) => {
      const inv = Array.isArray(d.invoices) ? d.invoices[0] : d.invoices;
      return !inv || inv.deleted_at == null;
    });
    setDocs(visible);
  }, [supabase, router]);

  useEffect(() => { void load(); }, [load]);

  async function open(path: string) {
    const { data } = await supabase.storage.from('vault').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  // Loading: never the empty copy while the read is in flight.
  if (docs === null) {
    return (
      <div className="px-4 py-4 md:px-6">
        <VaultSkeleton />
      </div>
    );
  }

  // A failed read is not an empty Vault.
  if (error && docs.length === 0) {
    return (
      <div className="mx-auto mt-16 max-w-sm px-4 text-center">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-error-container text-error-on-container">
          <Icon name="sync_problem" size={36} />
        </span>
        <h1 className="mt-5 font-display text-xl font-bold text-on-background">Couldn&apos;t load your documents</h1>
        <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">{error}</p>
        <button type="button" className="btn-primary mx-auto mt-6 px-7" onClick={() => void load()}>
          <Icon name="refresh" size={22} /> Retry
        </button>
      </div>
    );
  }

  const filtered = docs.filter((d) => d.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="px-4 py-4 md:px-6">
      {docs.length === 0 ? (
        <EmptyState
          icon="description"
          title="No documents yet."
          message="Every invoice you send lands here automatically."
          action="Add document"
          onAction={() => router.push('/chat')}
        />
      ) : (
        <>
          <input className="input mb-3" type="search" enterKeyHint="search" placeholder="Search your documents…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          {filtered.length === 0 && (
            <p className="mt-10 text-center text-on-surface-variant">No documents match “{q.trim()}”</p>
          )}
          <div className="space-y-2">
            {filtered.map((d) => (
              <button key={d.id} className="card flex min-h-16 w-full items-center gap-3 text-left transition-colors active:bg-surface-container" onClick={() => void open(d.storage_path)}>
                <Icon name="description" size={22} className="shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.title}</div>
                  <div className="text-xs uppercase text-on-surface-variant/70">{d.doc_type} · {new Date(d.created_at).toLocaleDateString()}</div>
                </div>
                <Icon name="download" size={20} className="shrink-0 text-on-surface-variant" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
