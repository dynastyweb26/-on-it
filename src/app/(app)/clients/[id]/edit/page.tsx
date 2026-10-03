'use client';
// Edit client (frames 3c). ?focus=phone|email|address|notes focuses that field
// (the detail page's taps on a missing value).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import ClientForm, { type ClientFields } from '@/components/clients/ClientForm';
import { createClient } from '@/lib/supabase/client';

export default function EditClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [initial, setInitial] = useState<ClientFields | null | undefined>(undefined);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    setFocus(new URLSearchParams(window.location.search).get('focus'));
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data } = await supabase.from('clients').select('name, phone, email, address, notes').eq('id', id).maybeSingle();
      const r = data as Record<string, string | null> | null;
      setInitial(r ? { name: r.name ?? '', phone: r.phone ?? '', email: r.email ?? '', address: r.address ?? '', notes: r.notes ?? '' } : null);
    })().catch(() => setInitial(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (initial === undefined) return <div className="mx-4 mt-4 h-48 animate-pulse rounded-card bg-surface-container" aria-busy="true" />;
  if (initial === null) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-on-surface-variant">This client couldn’t be found.</p>
        <Link href="/clients" className="btn-outline mx-auto mt-4 inline-flex px-5">Back to Clients</Link>
      </div>
    );
  }
  return <ClientForm mode="edit" id={id} initial={initial} focus={focus} />;
}
