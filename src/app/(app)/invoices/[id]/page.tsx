'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Share2, CheckCircle2, RefreshCw, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { buildTheme } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey, InvoiceRenderData } from '@/lib/pdf/templates';
import { elementToPdf, invoiceFilename, shareInvoice } from '@/lib/pdf/generate';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const router = useRouter();
  const [inv, setInv] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [zelle, setZelle] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: i } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
      setInv(i);
      if (i) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', i.user_id).maybeSingle();
        setProfile(p);
        // archived PDF from the Vault (uploaded at finalize time)
        const { data: doc } = await supabase
          .from('vault_documents')
          .select('storage_path')
          .eq('invoice_id', i.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setVaultPath(doc?.storage_path ?? null);
        try {
          const z = await (await fetch('/api/zelle?full=1')).json();
          if (z?.value) setZelle(z.value);
        } catch { /* renders without Zelle */ }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!inv || !profile) return <p className="p-6 text-ink/50">Loading…</p>;

  const theme = profile.background_color && profile.brand_colors?.length >= 2
    ? buildTheme(profile.brand_colors, profile.background_color)
    : { background: '#FFFFFF', text: '#000000', primary: '#1A1A1A', accent: '#D4A017' };

  const rd: InvoiceRenderData = {
    kind: inv.kind, invoiceNumber: inv.invoice_number,
    businessName: profile.business_name, logoUrl: profile.logo_url,
    websiteUrl: profile.website_url, slogan: profile.slogan,
    clientName: inv.client_name, lineItems: inv.line_items,
    subtotal: Number(inv.subtotal), taxRate: Number(inv.tax_rate),
    taxAmount: Number(inv.tax_amount), total: Number(inv.total),
    notes: inv.notes, issuedDate: new Date(inv.created_at).toLocaleDateString(),
    dueDate: inv.due_date, paid: inv.status === 'paid',
    zelle, cashappTag: profile.cashapp_tag, paypalMe: profile.paypal_me,
  };

  async function viewPdf() {
    if (!vaultPath) return;
    const { data } = await supabase.storage.from('vault').createSignedUrl(vaultPath, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function markPaid() {
    await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
    setInv({ ...inv, status: 'paid' });
  }

  async function resend() {
    if (!printRef.current) return;
    setBusy(true);
    const file = await elementToPdf(printRef.current, invoiceFilename(inv.invoice_number, inv.client_name, profile.business_name));
    await shareInvoice(file, inv.client_name);
    await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
    setBusy(false);
  }

  async function convertToInvoice() {
    // Quote → Invoice: one tap, new number, trail preserved
    const { data: no } = await supabase.rpc('next_invoice_no', { p_user: profile.id });
    const { data: created } = await supabase.from('invoices').insert({
      ...{
        user_id: inv.user_id, client_id: inv.client_id, kind: 'invoice',
        invoice_number: no, client_name: inv.client_name, line_items: inv.line_items,
        subtotal: inv.subtotal, tax_rate: inv.tax_rate, tax_amount: inv.tax_amount,
        total: inv.total, notes: inv.notes, status: 'draft', converted_from: inv.id,
      },
    }).select('id').single();
    if (created) router.push(`/invoices/${created.id}`);
  }

  return (
    <div className="px-4 py-4">
      <div className="card mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-lg font-bold">{inv.client_name}</div>
            <div className="text-xs text-ink/50">
              {inv.kind === 'quote' ? 'QTE' : 'INV'}-{String(inv.invoice_number).padStart(4, '0')} · {inv.status}
            </div>
          </div>
          <div className="font-mono text-xl font-bold text-gold">{money(Number(inv.total))}</div>
        </div>
        <div className="mt-3 flex gap-2">
          {inv.status !== 'paid' && inv.kind === 'invoice' && (
            <button className="chip flex items-center gap-1.5 border-green-600 text-green-700" onClick={markPaid}>
              <CheckCircle2 size={16} /> Mark paid
            </button>
          )}
          <button className="chip flex items-center gap-1.5" disabled={busy} onClick={resend}>
            <Share2 size={16} /> {busy ? 'Building…' : 'Share PDF'}
          </button>
          {vaultPath && (
            <button className="chip flex items-center gap-1.5" onClick={viewPdf}>
              <FileText size={16} /> View PDF
            </button>
          )}
          {inv.kind === 'quote' && (
            <button className="chip flex items-center gap-1.5 border-gold text-gold" onClick={convertToInvoice}>
              <RefreshCw size={16} /> Make it an invoice
            </button>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-card border border-line">
        <div style={{ transform: 'scale(0.55)', transformOrigin: 'top left', width: 794, height: 1123 * 0.55 }}>
          <div ref={printRef}>
            <InvoiceTemplate template={(profile.invoice_template ?? 'classic') as TemplateKey} data={rd} theme={theme} />
          </div>
        </div>
      </div>
    </div>
  );
}
