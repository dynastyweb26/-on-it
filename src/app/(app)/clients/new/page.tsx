'use client';
// New client (frames 3c). ?name= pre-fills the name (the save prompt, 2·13).
import { useEffect, useState } from 'react';
import ClientForm from '@/components/clients/ClientForm';

export default function NewClient() {
  const [params, setParams] = useState<{ name: string; focus: string | null } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setParams({ name: (q.get('name') ?? '').slice(0, 120), focus: q.get('focus') });
  }, []);
  if (!params) return null;
  return <ClientForm mode="new" initial={{ name: params.name }} focus={params.focus} />;
}
