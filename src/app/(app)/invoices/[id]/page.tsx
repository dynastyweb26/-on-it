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
import { calculateInvoiceTotals } from '@/lib/financials';
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
        // Payments ledger history
        const { data: pList } = await supabase
          .from('invoice_payments')
          .select('*')
          .eq('invoice_id', i.id)
          .order('paid_at', { ascending: false });
        setPayments(pList ?? []);

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
    : { background: '#FFFFFF', text: '#000000', primary: '#1A1A1A', accent: '#D4A017' };
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

  const [payments, setPayments] = useState<any[]>([]);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<'zelle' | 'cash' | 'check' | 'card' | 'other'>('zelle');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMode, setPayMode] = useState<'none' | 'deposit' | 'full' | 'other'>('none');
  const [customPayAmount, setCustomPayAmount] = useState('');

  async function fetchPayments() {
    const { data: pList } = await supabase
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', id)
      .order('paid_at', { ascending: false });
    setPayments(pList ?? []);
  }

  async function handleDeletePayment(paymentId: string) {
    const { error } = await supabase.from('invoice_payments').delete().eq('id', paymentId);
    if (error) {
      console.error('delete payment failed', error);
      return;
    }
    setDeletingPaymentId(null);
    const { data: updatedInv } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
    if (updatedInv) setInv(updatedInv);
    void fetchPayments();
  }

  async function handleRecordPayment(amountToRecord: number) {
    if (amountToRecord <= 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const paidAtIso = payDate ? new Date(payDate).toISOString() : new Date().toISOString();

    const { error } = await supabase.from('invoice_payments').insert({
      invoice_id: id,
      user_id: user.id,
      amount: amountToRecord,
      method: payMethod,
      paid_at: paidAtIso,
    });

    if (error) {
      console.error('record payment failed', error);
      return;
    }

    const { data: updatedInv } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
    if (updatedInv) setInv(updatedInv);
    setPayMode('none');
    setCustomPayAmount('');
    void fetchPayments();
  }

  async function resend(isBalanceRequest = false) {
    if (!printRef.current) return;
    setBusy(true);
    const totals = calculateInvoiceTotals(
      inv.line_items ?? [],
      Number(inv.tax_rate ?? 0),
      inv.deposit_type ?? 'none',
      Number(inv.deposit_value ?? 0),
      Number(inv.amount_paid ?? 0)
    );
    const filename = invoiceFilename(inv.kind, inv.invoice_number, inv.client_name, rd.businessName);
    const file = await elementToPdf(printRef.current, filename);
    const leadText = isBalanceRequest ? `Balance due ${money(totals.dueNow)}` : docNoun(inv.kind);
    await shareInvoice(file, inv.client_name, leadText);

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
  async function applyLineItems(newItems: LineItemRow[]) {
    const prev = (inv.line_items ?? []) as LineItemRow[];
    const merged = newItems.map((li, i) => {
      const before = prev[i];
      if (before && li.description !== before.description && !before.original_description) {
        return { ...li, original_description: before.description };
      }
      return li;
    });
    const subtotal = merged.reduce((s, li) => s + Number(li.qty) * Number(li.unit_price), 0);
    const taxRate = Number(inv.tax_rate);
    const taxAmount = Math.round(subtotal * taxRate) / 100;
    const total = subtotal + taxAmount;
    const prevTotals = { subtotal: inv.subtotal, tax_amount: inv.tax_amount, total: inv.total };
    setInv({ ...inv, line_items: merged, subtotal, tax_amount: taxAmount, total });
    const { error } = await supabase.from('invoices')
      .update({ line_items: merged, subtotal, tax_amount: taxAmount, total })
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
        <div className="mt-3 flex flex-wrap gap-2">
          {inv.kind === 'invoice' && Number(inv.amount_paid ?? 0) < Number(inv.total) && (
            <select
              className="chip border-paid text-paid bg-surface-container-lowest font-semibold outline-none cursor-pointer"
              value=""
              onChange={(e) => {
                const val = e.target.value as 'deposit' | 'full' | 'other';
                setPayMode(val);
                if (val === 'deposit') {
                  const depAmt = Number(inv.deposit_amount ?? 0);
                  const currentPaid = Number(inv.amount_paid ?? 0);
                  setCustomPayAmount(String(Math.max(0, depAmt - currentPaid)));
                } else if (val === 'full') {
                  const totalAmt = Number(inv.total ?? 0);
                  const currentPaid = Number(inv.amount_paid ?? 0);
                  setCustomPayAmount(String(Math.max(0, totalAmt - currentPaid)));
                } else if (val === 'other') {
                  setCustomPayAmount('');
                }
              }}
            >
              <option value="" disabled>Record payment</option>
              {Number(inv.deposit_amount ?? 0) > 0 && Number(inv.amount_paid ?? 0) < Number(inv.deposit_amount) && (
                <option value="deposit">
                  Deposit paid ({money(Math.max(0, Number(inv.deposit_amount) - Number(inv.amount_paid ?? 0)))})
                </option>
              )}
              <option value="full">
                Paid in full ({money(Math.max(0, Number(inv.total) - Number(inv.amount_paid ?? 0)))})
              </option>
              <option value="other">Other amount…</option>
            </select>
          )}
          <button className="chip flex items-center gap-1.5" disabled={busy} onClick={() => void resend(false)}>
            <Icon name="attach_file" size={18} /> {busy ? 'Building…' : 'Share PDF'}
          </button>
          {Number(inv.amount_paid ?? 0) > 0 &&
           calculateInvoiceTotals(inv.line_items ?? [], Number(inv.tax_rate ?? 0), inv.deposit_type ?? 'none', Number(inv.deposit_value ?? 0), Number(inv.amount_paid ?? 0)).dueNow > 0 && (
            <button className="chip flex items-center gap-1.5 border-primary text-primary" disabled={busy} onClick={() => void resend(true)}>
              <Icon name="send" size={18} /> {busy ? 'Building…' : 'Request balance'}
            </button>
          )}
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
        {inv.kind === 'invoice' && payMode !== 'none' && (
          <div className="mt-3 border-t border-outline-variant/30 pt-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-semibold text-on-surface-variant">Method:</span>
              <select
                className="rounded border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 font-semibold text-on-surface outline-none"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as any)}
              >
                <option value="zelle">Zelle</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
              <span className="font-semibold text-on-surface-variant ml-2">Date:</span>
              <input
                type="date"
                className="rounded border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 text-xs outline-none"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-on-surface-variant">Amount:</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="w-28 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 text-xs font-semibold outline-none"
                placeholder="0.00"
                value={customPayAmount}
                onChange={(e) => setCustomPayAmount(e.target.value)}
              />
              <button
                className="chip border-primary text-primary text-xs"
                disabled={!customPayAmount || Number(customPayAmount) <= 0}
                onClick={() => void handleRecordPayment(Number(customPayAmount))}
              >
                Save Payment
              </button>
              <button
                className="chip text-xs text-on-surface-variant"
                onClick={() => {
                  setPayMode('none');
                  setCustomPayAmount('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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
      {payments.length > 0 && (
        <div className="card mb-4 p-4">
          <div className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant mb-3">
            Payment History
          </div>
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-outline-variant/30 pb-2 text-xs">
                <div>
                  <span className="font-bold text-on-background">{money(Number(p.amount))}</span>
                  <span className="ml-2 text-on-surface-variant uppercase font-medium">({p.method})</span>
                  <span className="ml-2 text-on-surface-variant/70">
                    {new Date(p.paid_at).toLocaleDateString()}
                  </span>
                </div>
                {deletingPaymentId === p.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-error">Delete?</span>
                    <button
                      className="chip border-error text-error py-0.5 px-2 text-xs"
                      onClick={() => void handleDeletePayment(p.id)}
                    >
                      Yes
                    </button>
                    <button
                      className="chip text-xs py-0.5 px-2 text-on-surface-variant"
                      onClick={() => setDeletingPaymentId(null)}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-error opacity-70 hover:opacity-100 p-1"
                    title="Delete payment"
                    onClick={() => setDeletingPaymentId(p.id)}
                  >
                    <Icon name="delete" size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {Array.isArray(inv.line_items) && inv.line_items.length > 0 && (
        <div className="card mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Line items</span>
            {isDraft && <span className="text-xs text-on-surface-variant/70">Tap a value to edit</span>}
          </div>
          <LineItemsEditor items={inv.line_items as LineItemRow[]} editable={isDraft} onChange={applyLineItems} />
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
