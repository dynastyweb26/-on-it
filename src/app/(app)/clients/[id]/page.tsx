'use client';
// ═══ Client detail ═══ (release frames 3b; UI-REDESIGN-AUDIT §1.8, merge 2 · 2·4)
// Avatar, name, "Client since …"; Call / Text / Email (a missing value opens
// Edit with that field focused, never a dead tap) and the gold Invoice; Total
// paid / Still owed tiles (count up once); phone / email / address / notes
// rows (tap → Edit); every invoice and quote linked to this client, newest
// first, each opening its detail page.
//
// Invoice: opens the guided invoice template with this client picked (2·12c).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import CountUpMoney from '@/components/CountUpMoney';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/financials';
import { formatDocNumber } from '@/lib/documents';
import { tagFor } from '@/lib/doc-tags';
import { initials, normalizeSummary, type ClientSummary } from '@/lib/clients';

type Client = {
  id: string; name: string; phone: string | null; email: string | null;
  address: string | null; notes: string | null; created_at: string;
};
type Doc = {
  id: string; kind: string; invoice_number: number; total: number; status: string;
  created_at: string; due_date: string | null; converted_from: string | null;
  viewed_at: string | null; line_items: { description?: string }[] | null;
};

const since = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
const docDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [client, setClient] = useState<Client | null | undefined>(undefined);
  const [sum, setSum] = useState<ClientSummary | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const [c, s, d] = await Promise.all([
        supabase.from('clients').select('id, name, phone, email, address, notes, created_at').eq('id', id).maybeSingle(),
        supabase.rpc('client_summaries'),
        supabase.from('invoices')
          .select('id, kind, invoice_number, total, status, created_at, due_date, converted_from, viewed_at, line_items')
          .eq('client_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(200),
      ]);
      setClient((c.data as Client | null) ?? null);
      const row = ((s.data ?? []) as Record<string, unknown>[]).find((r) => r.id === id);
      setSum(row ? normalizeSummary(row) : null);
      setDocs((d.data as Doc[] | null) ?? []);
    })().catch(() => setClient(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (client === undefined) {
    return (
      <div className="space-y-4 px-4 py-4" aria-busy="true">
        <div className="h-16 w-2/3 animate-pulse rounded-card bg-surface-container" />
        <div className="h-20 animate-pulse rounded-card bg-surface-container" />
        <div className="h-24 animate-pulse rounded-card bg-surface-container" />
      </div>
    );
  }
  if (client === null) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-on-surface-variant">This client couldn’t be found.</p>
        <Link href="/clients" className="btn-outline mx-auto mt-4 inline-flex px-5">Back to Clients</Link>
      </div>
    );
  }

  const editHref = (focus?: string) => `/clients/${client.id}/edit${focus ? `?focus=${focus}` : ''}`;
  const converted = new Set(docs.map((d) => d.converted_from).filter(Boolean) as string[]);
  // Dial / text with digits only ("(555) 014-2290" → "5550142290"); + kept.
  const dial = (client.phone ?? '').replace(/[^\d+]/g, '');
  const invoiceHref = `/chat?template=invoice&client=${client.id}`;

  return (
    <div className="relative px-4 pb-6 pt-4">
      <Link href={editHref()} className="absolute right-3 top-2 flex min-h-touch items-center px-1 text-[17px] font-semibold text-primary">Edit</Link>

      <div className="flex items-center gap-4 pr-12">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-inverse-surface font-display text-xl font-bold text-primary-fixed-dim">
          {initials(client.name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[26px] font-extrabold leading-tight text-on-background">{client.name}</h1>
          <p className="text-[15px] text-on-surface-variant">Client since {since(client.created_at)}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2.5">
        <Action icon="call" label="Call" href={dial ? `tel:${dial}` : editHref('phone')} />
        <Action icon="sms" label="Text" href={dial ? `sms:${dial}` : editHref('phone')} />
        <Action icon="mail" label="Email" href={client.email ? `mailto:${client.email}` : editHref('email')} />
        <Action icon="description" label="Invoice" href={invoiceHref} gold />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-card bg-inverse-surface px-4 py-3.5 text-inverse-on-surface">
          <div className="font-display text-[26px] font-extrabold leading-tight tabular-nums">
            <CountUpMoney value={sum?.total_paid ?? 0} run format={moneyWhole} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[14px]"><i className="h-2 w-2 rounded-full bg-paid" />Total paid</div>
        </div>
        <div className="rounded-card border border-outline-variant/60 bg-surface-container-low px-4 py-3.5">
          <div className="font-display text-[26px] font-extrabold leading-tight text-on-background tabular-nums">
            <CountUpMoney value={sum?.open_balance ?? 0} run format={moneyWhole} delayMs={120} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[14px] text-on-surface-variant"><i className="h-2 w-2 rounded-full bg-primary-container" />Still owed</div>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-card border border-outline-variant/60 bg-surface-container-lowest">
        <InfoRow icon="call" value={client.phone} empty="Add phone" href={editHref('phone')} />
        <InfoRow icon="mail" value={client.email} empty="Add email" href={editHref('email')} />
        <InfoRow icon="location_on" value={client.address} empty="Add address" href={editHref('address')} />
        <InfoRow icon="sticky_note_2" value={client.notes} empty="Add notes" href={editHref('notes')} />
      </div>

      <div className="mt-6 flex items-baseline justify-between px-1">
        <h2 className="font-display text-lg font-bold text-on-background">Invoices &amp; quotes</h2>
        <span className="text-[14px] text-on-surface-variant">{docs.length}</span>
      </div>
      {docs.length === 0 ? (
        <p className="mt-3 px-1 text-body-md text-on-surface-variant">Nothing billed to {client.name} yet.</p>
      ) : (
        <div className="mt-2 space-y-2.5">
          {docs.map((d) => {
            const tag = tagFor(d, d.kind === 'quote' && converted.has(d.id));
            const what = d.line_items?.find((li) => li?.description)?.description;
            return (
              <Link key={d.id} href={`/invoices/${d.id}`}
                className="flex items-center gap-3 rounded-[18px] border border-outline-variant/60 bg-surface-container-low px-4 py-3 transition-transform active:scale-[0.98]">
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[17px] font-bold text-on-background">{formatDocNumber(d.kind, d.invoice_number)}</div>
                  <div className="truncate text-[13.5px] text-on-surface-variant">{docDate(d.created_at)}{what ? ` · ${what}` : ''}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-display text-[17px] font-extrabold text-on-background tabular-nums">{money(Number(d.total))}</span>
                  <span className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-[7px] px-2 text-[11px] font-bold tracking-[.06em] ${tag.cls}`}>
                    <Icon name={tag.icon} size={14} />{tag.text}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Tiles show whole dollars, like the frame ("$4,860"). */
function moneyWhole(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function Action({ icon, label, href, gold = false }: { icon: IconName; label: string; href: string; gold?: boolean }) {
  const cls = `flex h-[72px] flex-col items-center justify-center gap-1 rounded-[16px] text-[14px] font-semibold text-on-background transition active:scale-95
        ${gold ? 'bg-primary-container' : 'bg-primary-soft'}`;
  // tel: / sms: / mailto: are plain links; in-app routes go through Next.
  if (!href.startsWith('/')) return <a href={href} className={cls}><Icon name={icon} size={22} />{label}</a>;
  return (
    <Link href={href}
      className={`flex h-[72px] flex-col items-center justify-center gap-1 rounded-[16px] text-[14px] font-semibold text-on-background transition active:scale-95
        ${gold ? 'bg-primary-container' : 'bg-primary-soft'}`}>
      <Icon name={icon} size={22} />
      {label}
    </Link>
  );
}

function InfoRow({ icon, value, empty, href }: { icon: IconName; value: string | null; empty: string; href: string }) {
  return (
    <Link href={href} className="flex min-h-[52px] items-center gap-3 border-b border-outline-variant/40 px-4 py-2.5 last:border-b-0 active:bg-surface-container">
      <Icon name={icon} size={20} className="shrink-0 text-on-surface-variant" />
      <span className={`min-w-0 flex-1 whitespace-pre-line break-words text-body-md ${value ? 'text-on-background' : 'text-on-surface-variant'}`}>{value || empty}</span>
    </Link>
  );
}
