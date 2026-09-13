'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import LineItemsEditor, { type EditableLineItem as LineItemRow } from '@/components/LineItemsEditor';
import InvoiceDetailSkeleton from '@/components/InvoiceDetailSkeleton';
import { createClient } from '@/lib/supabase/client';
import { buildTheme } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey, InvoiceRenderData } from '@/lib/pdf/templates';
import { elementToPdf, invoiceFilename, shareInvoice, downloadFile } from '@/lib/pdf/generate';
import { defaultDueDate } from '@/lib/dates';
import { docNoun, formatDocNumber } from '@/lib/documents';
import { calculateInvoiceTotals, type DepositType } from '@/lib/financials';
import { renderSnapshot } from '@/lib/invoice-snapshot';
import PaywallModal from '@/components/PaywallModal';

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const router = useRouter();
  const [inv, setInv] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [zelle, setZelle] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false); // free cap hit on convert
  const [converting, setConverting] = useState(false);
  // If this is a quote that was already converted, the invoice it became — so we
  // show a link to it instead of a convert button that would mint a second one.
  const [convertedTo, setConvertedTo] = useState<{ id: string; invoice_number: number } | null>(null);
  // If this is an invoice made by converting a quote, the originating quote — so
  // we can link back to it.
  const [convertedFrom, setConvertedFrom] = useState<{ id: string; invoice_number: number } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: i } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
      setInv(i);
      if (i) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', i.user_id).maybeSingle();
        setProfile(p);
        // A quote that already became an invoice — surface that, don't re-convert.
        if (i.kind === 'quote') {
          const { data: conv } = await supabase
            .from('invoices')
            .select('id, invoice_number')
            .eq('converted_from', i.id)
            .eq('kind', 'invoice')
            .maybeSingle();
          setConvertedTo(conv ?? null);
        }
        // An invoice made from a quote — link back to the originating quote.
        if (i.kind === 'invoice' && i.converted_from) {
          const { data: src } = await supabase
            .from('invoices')
            .select('id, invoice_number')
            .eq('id', i.converted_from)
            .maybeSingle();
          setConvertedFrom(src ?? null);
        }
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

  if (!inv || !profile) return <InvoiceDetailSkeleton />;

  // Per-ROW snapshot sentinel: a non-null snapshot template means this invoice was
  // finalized WITH the render snapshot, so use the snapshot for ALL ten fields —
  // including where a value is legitimately null (e.g. no logo at send time). A
  // null template means the row predates the snapshot fix, so use the live profile
  // for everything. Never mix: a row is either snapshotted or it isn't. Zelle is
  // never snapshotted, so it is read live in both cases. (logo_url snapshots the
  // URL only — the asset itself isn't frozen and can 404 if later replaced.)
  const snapped = inv.template != null;

  const brandColors = snapped ? inv.brand_colors : profile.brand_colors;
  const backgroundColor = snapped ? inv.background_color : profile.background_color;
  const theme = backgroundColor && brandColors?.length >= 2
    ? buildTheme(brandColors, backgroundColor)
    : { background: '#FFFFFF', text: '#000000', primary: '#1A1A1A', accent: '#D4A017', heading: '#000000', surface: '#E6E6E6', muted: '#666666', rule: '#CCCCCC', accentInk: '#735c00' };
  const template = (snapped ? inv.template : (profile.invoice_template ?? 'classic')) as TemplateKey;

  const rd: InvoiceRenderData = {
    kind: inv.kind, invoiceNumber: inv.invoice_number,
    businessName: snapped ? inv.business_name : profile.business_name,
    logoUrl: snapped ? inv.logo_url : profile.logo_url,
    websiteUrl: snapped ? inv.website_url : profile.website_url,
    slogan: snapped ? inv.slogan : profile.slogan,
    clientName: inv.client_name, clientAddress: inv.client_address ?? null,
    clientPhone: inv.client_phone ?? null, lineItems: inv.line_items,
    subtotal: Number(inv.subtotal), taxRate: Number(inv.tax_rate),
    taxAmount: Number(inv.tax_amount), total: Number(inv.total),
    notes: inv.notes, issuedDate: new Date(inv.created_at).toLocaleDateString(),
    dueDate: inv.due_date, paid: inv.status === 'paid',
    zelle, // live — Zelle is never snapshotted, in either case
    cashappTag: snapped ? inv.cashapp_tag : profile.cashapp_tag,
    paypalMe: snapped ? inv.paypal_me : profile.paypal_me,
    venmoUsername: snapped ? inv.venmo_username : profile.venmo_username,
  };

  async function viewPdf() {
    if (!vaultPath) return;
    const { data } = await supabase.storage.from('vault').createSignedUrl(vaultPath, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  // Download the PDF (never marks sent). Prefer the archived as-sent PDF from the
  // Vault when one exists — that's the exact file the client received — by signing
  // its URL with a download disposition. Fall back to re-rendering the current
  // template (snapshot-aware) only when there is no archive (upload failed at
  // finalize, or the invoice was never sent).
  async function downloadInvoice() {
    if (downloading) return;
    setDownloading(true);
    try {
      const filename = invoiceFilename(inv.kind, inv.invoice_number, inv.client_name, rd.businessName);
      if (vaultPath) {
        const { data } = await supabase.storage.from('vault').createSignedUrl(vaultPath, 300, { download: filename });
        if (data?.signedUrl) {
          const a = document.createElement('a');
          a.href = data.signedUrl;
          a.rel = 'noopener';
          a.click();
        }
      } else if (printRef.current) {
        const file = await elementToPdf(printRef.current, filename);
        downloadFile(file);
      }
    } finally {
      setDownloading(false);
    }
  }

  // The +30 default is a pre-fill, not a lock — the ONLY editable field here.
  async function setDueDate(v: string) {
    const due = v || null;
    setInv({ ...inv, due_date: due });
    await supabase.from('invoices').update({ due_date: due }).eq('id', id);
  }

  async function markPaid() {
    await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
    setInv({ ...inv, status: 'paid' });
  }

  async function resend() {
    if (!printRef.current) return;
    setBusy(true);
    const file = await elementToPdf(printRef.current, invoiceFilename(inv.kind, inv.invoice_number, inv.client_name, rd.businessName));
    await shareInvoice(file, inv.client_name, docNoun(inv.kind));
    // First send (e.g. a converted quote→invoice draft) captures the render
    // snapshot from the current profile. A RE-send of an already-sent invoice
    // must NOT re-snapshot — that would overwrite the record, or for a pre-fix
    // invoice fabricate history — so it's gated on the draft→sent transition.
    const patch: Record<string, unknown> = { status: 'sent', sent_at: new Date().toISOString() };
    if (inv.status !== 'sent') Object.assign(patch, renderSnapshot(profile));
    await supabase.from('invoices').update(patch).eq('id', id);
    setInv({ ...inv, ...patch });
    setBusy(false);
  }

  async function convertToInvoice() {
    // Quote → Invoice: one tap, a fresh INVOICE number assigned server-side, the
    // quote preserved as its own record and linked via converted_from. The
    // invoice_number is set by the assign_document_number trigger (NOT sent from
    // here), so the invoice sequence only advances now — at conversion — and the
    // quote never left a gap in it. This insert goes through the same cap trigger,
    // so a free user at the limit is stopped here too, with the paywall modal.
    if (converting || convertedTo) return;
    setConverting(true);
    try {
      const { data: created, error } = await supabase.from('invoices').insert({
        user_id: inv.user_id, client_id: inv.client_id, kind: 'invoice',
        client_name: inv.client_name,
        // Carry the contact snapshot forward so the invoice bills the same person.
        client_address: inv.client_address ?? null,
        client_phone: inv.client_phone ?? null,
        line_items: inv.line_items, subtotal: inv.subtotal, tax_rate: inv.tax_rate,
        tax_amount: inv.tax_amount, total: inv.total, notes: inv.notes,
        status: 'draft', converted_from: inv.id,
        due_date: defaultDueDate(), // every new invoice gets the +30 default
      }).select('id').single();
      if (error) {
        if (error.hint === 'PAYWALL_LIMIT') { setShowPaywall(true); return; }
        console.error('convert to invoice failed', error);
        return;
      }
      if (created) router.push(`/invoices/${created.id}`);
    } finally {
      setConverting(false);
    }
  }

  // Apply a line-item edit (description, qty, or unit_price) on a DRAFT. Writes
  // line_items back (allowed while draft by the lock_line_items carve-out in
  // 20260826232448) with subtotal/tax_amount/total recomputed atomically from the
  // new items, so the stored totals, the PDF, and Books never drift apart. On a
  // description change, records the AI's original wording the first time a line is
  // edited — never overwriting an original already captured from a chat edit,
  // since the first AI output is the training signal.
  async function applyNotes(notes: string) {
    setInv({ ...inv, notes });
    await supabase.from('invoices').update({ notes }).eq('id', id);
  }

  async function applyDeposit(deposit_type: DepositType, deposit_value: number) {
    const totals = calculateInvoiceTotals(
      inv.line_items ?? [],
      Number(inv.tax_rate ?? 0),
      deposit_type,
      deposit_value
    );
    setInv({
      ...inv,
      deposit_type,
      deposit_value,
      subtotal: totals.subtotal,
      tax_amount: totals.taxAmount,
      total: totals.total,
    });
    await supabase.from('invoices')
      .update({
        deposit_type,
        deposit_value,
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        total: totals.total,
      })
      .eq('id', id);
  }

  async function applyLineItems(newItems: LineItemRow[]) {
    const prev = (inv.line_items ?? []) as LineItemRow[];
    const merged = newItems.map((li, i) => {
      const before = prev[i];
      if (before && li.description !== before.description && !before.original_description) {
        return { ...li, original_description: before.description };
      }
      return li;
    });
    const totals = calculateInvoiceTotals(
      merged,
      Number(inv.tax_rate),
      inv.deposit_type ?? 'none',
      Number(inv.deposit_value ?? 0)
    );
    const prevTotals = { subtotal: inv.subtotal, tax_amount: inv.tax_amount, total: inv.total };
    setInv({
      ...inv,
      line_items: merged,
      subtotal: totals.subtotal,
      tax_amount: totals.taxAmount,
      total: totals.total,
    });
    const { error } = await supabase.from('invoices')
      .update({
        line_items: merged,
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        total: totals.total,
      })
      .eq('id', id);
    if (error) {
      console.error('line item update failed', error);
      // revert local optimistic state on failure
      setInv((p: any) => ({ ...p, line_items: prev, ...prevTotals }));
    }
  }

  const isDraft = inv.status === 'draft';

  return (
    <div className="px-4 py-4">
      <div className="card mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-lg font-bold">{inv.client_name}</div>
            <div className="text-xs text-on-surface-variant">
              {docNoun(inv.kind)} {formatDocNumber(inv.kind, inv.invoice_number)} · {inv.status}
            </div>
          </div>
          <div className="font-display text-xl font-bold text-primary">{money(Number(inv.total))}</div>
        </div>
        <div className="mt-3 flex gap-2">
          {inv.status !== 'paid' && inv.kind === 'invoice' && (
            <button className="chip flex items-center gap-1.5 border-paid text-paid" onClick={markPaid}>
              <Icon name="check_circle" size={18} /> Mark paid
            </button>
          )}
          <button className="chip flex items-center gap-1.5" disabled={busy} onClick={resend}>
            <Icon name="attach_file" size={18} /> {busy ? 'Building…' : 'Share PDF'}
          </button>
          <button className="chip flex items-center gap-1.5" disabled={downloading} onClick={downloadInvoice}>
            <Icon name="download" size={18} /> {downloading ? 'Preparing…' : 'Download'}
          </button>
          {vaultPath && (
            <button className="chip flex items-center gap-1.5" onClick={viewPdf}>
              <Icon name="preview" size={18} /> View PDF
            </button>
          )}
          {inv.kind === 'quote' && !convertedTo && (
            <button className="chip flex items-center gap-1.5 border-primary text-primary"
              disabled={converting} onClick={convertToInvoice}>
              <Icon name="sync" size={18} /> {converting ? 'Converting…' : 'Convert to Invoice'}
            </button>
          )}
          {inv.kind === 'quote' && convertedTo && (
            <button className="chip flex items-center gap-1.5 border-paid text-paid"
              onClick={() => router.push(`/invoices/${convertedTo.id}`)}>
              <Icon name="check_circle" size={18} /> Converted to {formatDocNumber('invoice', convertedTo.invoice_number)}
            </button>
          )}
          {inv.kind === 'invoice' && convertedFrom && (
            <button className="chip flex items-center gap-1.5"
              onClick={() => router.push(`/invoices/${convertedFrom.id}`)}>
              <Icon name="request_quote" size={18} /> From {formatDocNumber('quote', convertedFrom.invoice_number)}
            </button>
          )}
        </div>
        {inv.kind === 'invoice' && (
          <div className="mt-3 flex items-center gap-2">
            <label htmlFor="due-date" className="text-sm font-semibold text-on-surface-variant">Due</label>
            <input
              id="due-date"
              type="date"
              className="input h-auto flex-1 py-2 text-sm"
              value={inv.due_date ?? ''}
              onChange={(e) => void setDueDate(e.target.value)}
            />
          </div>
        )}
      </div>
      {Array.isArray(inv.line_items) && inv.line_items.length > 0 && (
        <div className="card mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Line items</span>
            {isDraft && <span className="text-xs text-on-surface-variant/70">Tap a value to edit</span>}
          </div>
          <LineItemsEditor items={inv.line_items as LineItemRow[]} editable={isDraft} onChange={applyLineItems} />
          {isDraft && (
            <div className="mt-3 border-t border-outline-variant/30 pt-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-on-surface-variant">Deposit required</span>
                <div className="flex items-center gap-1.5">
                  <select
                    className="rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 text-xs font-semibold text-on-surface outline-none"
                    value={inv.deposit_type ?? 'none'}
                    onChange={(e) => {
                      const dt = e.target.value as DepositType;
                      const val = dt === 'none' ? 0 : (inv.deposit_value ?? (dt === 'percentage' ? 40 : 100));
                      void applyDeposit(dt, val);
                    }}
                  >
                    <option value="none">None</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed ($)</option>
                  </select>
                  {(inv.deposit_type === 'percentage' || inv.deposit_type === 'fixed') && (
                    <input
                      type="number"
                      min="0"
                      max={inv.deposit_type === 'percentage' ? 100 : 1000000}
                      className="w-20 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 text-right text-xs font-semibold outline-none"
                      value={inv.deposit_value ?? ''}
                      placeholder={inv.deposit_type === 'percentage' ? '40' : '100'}
                      onChange={(e) => {
                        const v = Math.max(0, Number(e.target.value) || 0);
                        void applyDeposit(inv.deposit_type as DepositType, v);
                      }}
                    />
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="notes-input" className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Notes
                </label>
                <textarea
                  id="notes-input"
                  className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2.5 py-1.5 text-xs text-on-surface outline-none resize-none"
                  rows={2}
                  maxLength={400}
                  placeholder="Deposit due before materials are ordered. 3-5 day lead time."
                  value={inv.notes ?? ''}
                  onChange={(e) => void applyNotes(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      )}
      <div className="overflow-hidden rounded-card border border-outline-variant">
        <div style={{ transform: 'scale(0.55)', transformOrigin: 'top left', width: 794, height: 1123 * 0.55 }}>
          <div ref={printRef}>
            <InvoiceTemplate template={template} data={rd} theme={theme} />
          </div>
        </div>
      </div>
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} />}
    </div>
  );
}
