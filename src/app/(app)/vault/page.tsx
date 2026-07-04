'use client';
// ═══ The Vault ═══ Every PDF and receipt, searchable, forever.
import { useEffect, useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function Vault() {
  const supabase = createClient();
  const [docs, setDocs] = useState<any[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    supabase.from('vault_documents').select('*').order('created_at', { ascending: false }).limit(300)
      .then(({ data }) => setDocs(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open(path: string) {
    const { data } = await supabase.storage.from('vault').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  const filtered = docs.filter((d) => d.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="px-4 py-4">
      <input className="card mb-3 w-full" placeholder="Search your documents…"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {filtered.length === 0 && (
        <p className="mt-16 text-center text-ink/50">Every invoice you send lands here automatically.</p>
      )}
      <div className="space-y-2">
        {filtered.map((d) => (
          <button key={d.id} className="card flex w-full items-center gap-3 text-left" onClick={() => open(d.storage_path)}>
            <FileText size={20} className="shrink-0 text-gold" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{d.title}</div>
              <div className="text-xs uppercase text-ink/45">{d.doc_type} · {new Date(d.created_at).toLocaleDateString()}</div>
            </div>
            <Download size={16} className="shrink-0 text-ink/40" />
          </button>
        ))}
      </div>
    </div>
  );
}
