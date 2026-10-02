'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import LineItemsEditor, { type EditableLineItem as LineItemRow } from '@/components/LineItemsEditor';
import InvoiceDetailSkeleton from '@/components/InvoiceDetailSkeleton';
import { createClient } from '@/lib/supabase/client';
import { buildTheme } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey, InvoiceRenderData } from '@/lib/pdf/templates';
import { elementToPdf, invoiceFilename, downloadFile } from '@/lib/pdf/generate';
import { sharePdf, shareText, type ShareResult } from '@/lib/pdf/share';
import type { BrandTheme } from '@/lib/colors';
import { defaultDueDate, formatDate } from '@/lib/dates';
import { docNoun, formatDocNumber } from '@/lib/documents';
import { calculateInvoiceTotals, type DepositType } from '@/lib/financials';
import { renderSnapshot } from '@/lib/invoice-snapshot';
// Payment-history method label: Stripe-sourced rows (paid on the pay page)
// read e.g. "Cash App (via Stripe)"; manual rows keep the bare method.
import { invoiceStatusLabel, ledgerEntryLabel } from '@/lib/payment-methods';
import PaywallModal from '@/components/PaywallModal';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import UndoToast from '@/components/UndoToast';
import { cardAvailableFor, fetchConnectEnabled } from '@/lib/connect-client';

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

// A <input type="date"> value ("YYYY-MM-DD") is a local calendar date. Format
// today for the picker, and convert a picked value to a timestamp from its parts
// as a LOCAL date (not UTC) — so a payment entered on the 14th is stored and
// shown as the 14th instead of slipping to the 13th when local midnight crosses
// the UTC offset.
const localDateString = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const localDateToIso = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
};

// Background builder for the SHARED PDF — the detail-page twin of the chat's
// pre-build. Renders the share copy offscreen (natural scale, no transform, so
// html2canvas captures cleanly) and builds the File once the render has been
// stable for 400ms; a newer `sig` cancels the older build's result. The send
// tap then shares the finished file synchronously. No DB writes here.
function PrebuiltPdf({ sig, template, data, theme, filename, onBuilt }: {
  sig: string;
  template: TemplateKey;
  data: InvoiceRenderData;
  theme: BrandTheme;
  filename: string;
  onBuilt: (sig: string, file: File | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onBuiltRef = useRef(onBuilt);
  onBuiltRef.current = onBuilt;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!ref.current) return;
      try {
        const file = await elementToPdf(ref.current, filename);
        if (!cancelled) onBuiltRef.current(sig, file);
      } catch (e) {
        console.error('share PDF pre-build failed', e);
        if (!cancelled) onBuiltRef.current(sig, null);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // sig covers every input (data, template, theme, filename, retry nonce).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return (
    <div style={{ position: 'fixed', left: -9999, top: 0 }}>
      <div ref={ref}>
        <InvoiceTemplate template={template} data={data} theme={theme} />
      </div>
    </div>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const router = useRouter();
  const [inv, setInv] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  // Connect on in this deployment? (PDF card line; fails closed.)
  const [connectOn, setConnectOn] = useState(false);
  useEffect(() => { void fetchConnectEnabled().then(setConnectOn); }, []);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
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
  // Record-payment entry (a ledger insert, never a direct amount_paid write).
  const [payMode, setPayMode] = useState<'none' | 'deposit' | 'full' | 'other'>('none');
  const [payMethod, setPayMethod] = useState<'zelle' | 'cash' | 'check' | 'card' | 'other'>('zelle');
  const [payDate, setPayDate] = useState(() => localDateString(new Date()));
  const [payAmount, setPayAmount] = useState('');
  // The invoice_payments ledger rows for this invoice (payment history).
  const [payments, setPayments] = useState<any[]>([]);
  // One-shot "paid" moment (MOTION-SPEC §6): only when a payment recorded here
  // brings the balance to zero. Loading an already-paid invoice never plays it.
  const [paidAnim, setPaidAnim] = useState(false);
  const paidAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (paidAnimTimerRef.current) clearTimeout(paidAnimTimerRef.current); }, []);
  function celebratePaid() {
    if (paidAnimTimerRef.current) clearTimeout(paidAnimTimerRef.current);
    setPaidAnim(true);
    paidAnimTimerRef.current = setTimeout(() => setPaidAnim(false), 1000);
    // Short tick as it lands (Android; iOS ignores vibrate).
    try { navigator.vibrate?.(12); } catch { /* unsupported */ }
  }
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  // Pre-built share PDF (see PrebuiltPdf): the file for the render signature it
  // was built from, or file=null when that build failed. The nonce forces a
  // rebuild after a failure. shareError: a blocked/failed share, shown inline.
  const [prebuilt, setPrebuilt] = useState<{ sig: string; file: File | null } | null>(null);
  const [prebuildNonce, setPrebuildNonce] = useState(0);
  const [shareError, setShareError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false); // "Copy pay link" feedback
  const [deleting, setDeleting] = useState(false);
  const [undoDelete, setUndoDelete] = useState(false);

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
      const { data: i } = await supabase.from('invoices').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
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
            .is('deleted_at', null)
            .maybeSingle();
          setConvertedTo(conv ?? null);
        }
        // An invoice made from a quote — link back to the originating quote.
        if (i.kind === 'invoice' && i.converted_from) {
          const { data: src } = await supabase
            .from('invoices')
            .select('id, invoice_number')
            .eq('id', i.converted_from)
            .is('deleted_at', null)
            .maybeSingle();
          setConvertedFrom(src ?? null);
        }
        void fetchPayments();
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

  // amount_paid is kept in sync by the invoice_payments trigger; all deposit and
  // payment math (depositAmount, dueNow, credit, paymentStage) comes from the
  // financial engine — the single source of truth — never recomputed here.
  const amountPaid = Number(inv.amount_paid ?? 0);
  const totals = calculateInvoiceTotals(
    inv.line_items ?? [],
    Number(inv.tax_rate ?? 0),
    (inv.deposit_type ?? 'none') as DepositType,
    Number(inv.deposit_value ?? 0),
    amountPaid,
  );
  // Most recent payment date (payments are ordered newest-first) for the PDF's
  // payment-received line. Money in only: a refund or dispute row isn't a payment.
  const lastPayment = payments.find((p) => Number(p.amount) > 0);
  const paymentDate = lastPayment ? new Date(lastPayment.paid_at).toLocaleDateString() : null;

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
    depositType: (inv.deposit_type ?? 'none') as DepositType,
    depositValue: Number(inv.deposit_value ?? 0),
    depositAmount: totals.depositAmount,
    remaining: totals.remaining,
    amountDueNow: totals.dueNow,
    paymentsReceived: amountPaid,
    paymentDate,
    paymentStage: totals.paymentStage,
    notes: inv.notes, issuedDate: formatDate(inv.created_at),
    dueDate: formatDate(inv.due_date), paid: inv.status === 'paid',
    zelle, // live — Zelle is never snapshotted, in either case
    cashappTag: snapped ? inv.cashapp_tag : profile.cashapp_tag,
    paypalMe: snapped ? inv.paypal_me : profile.paypal_me,
    venmoUsername: snapped ? inv.venmo_username : profile.venmo_username,
    // Embed the pay link into the PDF's "How to pay" block (one silent tappable
    // annotation) for a non-draft invoice only — a draft/quote has no usable pay
    // page, so leave it null and the block stays link-free.
    payUrl:
      inv.kind === 'invoice' && inv.status !== 'draft' && inv.public_token && typeof window !== 'undefined'
        ? `${window.location.origin}/pay/${inv.public_token}`
        : null,
    // Live (never snapshotted), like Zelle: can the pay page take card / Cash
    // App Pay right now? Shown only with payUrl.
    cardAvailable: cardAvailableFor(profile, connectOn),
  };

  // The SHARED copy carries the pay link even while the invoice is still a draft
  // (a converted quote, or a chat draft that was only downloaded): sharing it IS
  // the send, which flips it to 'sent' so the link resolves — the same rule as
  // the chat send. View/Download keep rd, so a draft's copy stays link-free.
  // Invoices only — a quote is never payable.
  const shareUrl =
    inv.kind === 'invoice' && inv.public_token && typeof window !== 'undefined'
      ? `${window.location.origin}/pay/${inv.public_token}`
      : null;
  const shareRd: InvoiceRenderData = { ...rd, payUrl: shareUrl };
  const shareFilename = invoiceFilename(inv.kind, inv.invoice_number, inv.client_name, rd.businessName);
  // Everything the shared PDF renders from; a change (Zelle arriving, a payment,
  // an edit) moves it and PrebuiltPdf rebuilds.
  const shareSig = JSON.stringify({ shareRd, template, theme, shareFilename, prebuildNonce });
  const shareReady = prebuilt?.sig === shareSig;
  const shareFile = shareReady ? prebuilt!.file : null;
  const shareLabel = (idle: string) => (busy ? 'Sending…' : !shareReady ? 'Preparing…' : idle);

  // Open the PDF in a new tab, rendered fresh from the current render data. Mobile
  // popup blockers only allow window.open synchronously inside the click gesture,
  // so open the tab first and point it at the blob once the PDF is ready.
  async function viewPdf() {
    if (!printRef.current) return;
    setPdfError(null);
    const w = window.open('', '_blank');
    try {
      const filename = invoiceFilename(inv.kind, inv.invoice_number, inv.client_name, rd.businessName);
      const file = await elementToPdf(printRef.current, filename);
      const url = URL.createObjectURL(file);
      if (w) w.location.href = url;
      else window.open(url, '_blank'); // the synchronous open was blocked; try once more
      // Release the blob after the tab has had time to load it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      // Render failed — don't strand the blank tab we opened, and tell the user.
      console.error('view pdf failed', e);
      w?.close();
      setPdfError("Couldn't open the PDF. Please try again.");
    }
  }

  // View and Download both render the CURRENT state of the invoice fresh from rd,
  // so a recorded payment (balance due, payment-received line) is always shown.
  // The exact as-sent copy is preserved in the Vault (reachable from the Vault
  // page) and is never read, modified, or re-uploaded here. Neither marks sent.
  async function downloadInvoice() {
    if (downloading || !printRef.current) return;
    setDownloading(true);
    try {
      const filename = invoiceFilename(inv.kind, inv.invoice_number, inv.client_name, rd.businessName);
      const file = await elementToPdf(printRef.current, filename);
      downloadFile(file);
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

  // Record a payment as a row in the invoice_payments ledger. The DB trigger
  // recomputes invoices.amount_paid from the ledger — we never write amount_paid
  // directly — so we refetch the invoice afterward to pick up the new total.
  async function recordPayment(amount: number) {
    if (!(amount > 0)) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const paidAtIso = payDate ? localDateToIso(payDate) : new Date().toISOString();
    const { error } = await supabase.from('invoice_payments').insert({
      invoice_id: id,
      user_id: user.id,
      amount,
      method: payMethod,
      paid_at: paidAtIso,
    });
    if (error) {
      console.error('record payment failed', error);
      return;
    }
    // Celebrate when the balance hits zero, not on status: the ledger trigger
    // only flips status to 'paid' for sent/overdue invoices, so a draft paid in
    // full keeps its status but is still fully paid.
    const fullyPaid = (row: any) => Number(row?.total) > 0 && Number(row?.amount_paid ?? 0) >= Number(row?.total);
    const wasFullyPaid = fullyPaid(inv);
    const { data: updated } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
    if (updated) {
      setInv(updated);
      if (!wasFullyPaid && fullyPaid(updated)) celebratePaid();
    }
    setPayMode('none');
    setPayAmount('');
    void fetchPayments();
  }

  async function fetchPayments() {
    const { data } = await supabase
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', id)
      .order('paid_at', { ascending: false });
    setPayments(data ?? []);
  }

  // Delete a ledger row (behind a confirm step). The trigger recomputes
  // invoices.amount_paid from what remains, so we refetch the invoice after.
  async function handleDeletePayment(paymentId: string) {
    const { error } = await supabase.from('invoice_payments').delete().eq('id', paymentId);
    if (error) {
      console.error('delete payment failed', error);
      return;
    }
    setDeletingPaymentId(null);
    const { data: updated } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
    if (updated) setInv(updated);
    void fetchPayments();
  }

  // Share PDF / Request balance: the SAME one-tap send path as chat
  // (lib/pdf/share.ts). The PDF is pre-built in the background (PrebuiltPdf
  // below) and shared SYNCHRONOUSLY from the tap — nothing awaited before
  // navigator.share(), so iOS keeps the tap's user activation. Until the file
  // for the current render is ready the button reads "Preparing…". A failed
  // build shows an error and the tap rebuilds (never a slow, activation-less
  // share). A balance request re-sends the SAME file through the SAME path — no
  // new token, no second invoice — with share text that leads with the balance.
  function resend(isBalanceRequest = false) {
    if (busy || !shareReady) return;
    if (!shareFile) {
      // The pre-build failed: rebuild on tap instead of sharing nothing.
      setShareError(null);
      setPrebuilt(null);
      setPrebuildNonce((n) => n + 1);
      return;
    }
    const lead = isBalanceRequest ? `Balance due ${money(totals.balanceRemaining)}` : docNoun(inv.kind);
    const file = shareFile;
    void settleShare(sharePdf(file, shareText(lead, inv.client_name, shareUrl)), file, isBalanceRequest);
  }

  // After the one share call. A cancel is silent (no message, no status change;
  // a draft stays a draft). A failure says so with the error name, keeping the
  // file so the next tap re-shares it synchronously. A completed share (or a
  // download where the platform has no file share) records the send.
  async function settleShare(pending: Promise<ShareResult>, file: File, isBalanceRequest: boolean) {
    setBusy(true);
    setShareError(null);
    // try/finally so a DB error can't strand the card with its buttons disabled.
    try {
      const r = await pending;
      if (r.status === 'cancelled') return;
      if (r.status === 'failed') {
        setShareError(`The share sheet didn't open (${r.name}). Tap ${isBalanceRequest ? 'Request balance' : 'Share PDF'} to try again.`);
        return;
      }
      if (r.status === 'unsupported') downloadFile(file);
      // Always bump sent_at. Only a genuine first send (draft → sent) flips the
      // status and captures the render snapshot from the current profile. A resend
      // of an already-sent OR paid invoice must NOT touch status — forcing 'sent'
      // would regress a 'paid' invoice (the ledger trigger only reconciles on a
      // payments-row change, so it would stay 'sent') — and must NOT re-snapshot,
      // which would overwrite the historical record with the current profile.
      const firstSend = inv.status === 'draft';
      const patch: Record<string, unknown> = { sent_at: new Date().toISOString() };
      if (firstSend) Object.assign(patch, { status: 'sent' }, renderSnapshot(profile));
      await supabase.from('invoices').update(patch).eq('id', id);
      setInv({ ...inv, ...patch });

      // Archive to the Vault, the same way a chat send does (best-effort — a
      // storage hiccup must not undo the share the user just confirmed):
      //  - a FIRST send from here (a converted quote, or a chat draft that was
      //    only downloaded) archives the document itself, as chat would have;
      //  - a balance request archives its own copy, distinguished by title and
      //    storage path since doc_type is a fixed enum with no balance value.
      // A plain resend of an already-sent document isn't re-archived (its first
      // send already was). invoice_id ties each row to the parent so a soft
      // delete still hides it.
      if (firstSend || isBalanceRequest) {
        try {
          const path = isBalanceRequest ? `${inv.user_id}/balance-${file.name}` : `${inv.user_id}/${file.name}`;
          await supabase.storage.from('vault').upload(path, file, { upsert: true });
          await supabase.from('vault_documents').insert({
            user_id: inv.user_id,
            title: isBalanceRequest ? `Balance request — ${file.name}` : file.name,
            doc_type: inv.kind,
            storage_path: path,
            invoice_id: inv.id,
          });
        } catch (archiveErr) {
          console.error('vault archive failed', archiveErr);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  // Copy the public pay link to the clipboard. Origin-relative so it matches the
  // deployment the business is on (preview or prod). Only offered for a non-draft
  // invoice (a draft's /pay page wouldn't resolve).
  async function copyPayLink() {
    if (!inv?.public_token) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pay/${inv.public_token}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      /* clipboard blocked — no-op; the PDF share still carries the link */
    }
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

  // Soft-delete this invoice/quote (sets deleted_at; ledger rows are untouched).
  async function handleDelete() {
    setDeleting(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('invoices').update({ deleted_at: now }).eq('id', id);
    setDeleting(false);
    setShowDeleteModal(false);
    if (!error) {
      setUndoDelete(true);
    }
  }

  async function handleUndo() {
    setUndoDelete(false);
    const { error } = await supabase.from('invoices').update({ deleted_at: null }).eq('id', id);
    if (error) {
      router.push('/invoices');
    }
  }

  return (
    <div className="px-4 py-4">
      <div className="card relative mb-4 overflow-hidden">
        {paidAnim && <div aria-hidden className="onit-paid-sweep" />}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-lg font-bold">{inv.client_name}</div>
            <div className="text-xs text-on-surface-variant">
              {docNoun(inv.kind)} {formatDocNumber(inv.kind, inv.invoice_number)} ·{' '}
              <span className={`inline-block${inv.status === 'paid' ? ' font-semibold text-paid' : ''}${paidAnim ? ' onit-chip-in' : ''}`}
                style={paidAnim ? { animationDelay: '380ms' } : undefined}>
                {invoiceStatusLabel(inv.status, inv.refunded_amount, inv.amount_paid)}
              </span>
            </div>
            {/* First qualifying client view (mark_invoice_viewed), in local time. */}
            {inv.viewed_at && (
              <div className="text-xs text-on-surface-variant">Viewed {formatDate(inv.viewed_at)}</div>
            )}
          </div>
          <div className="text-right">
            <div className={`font-display text-xl font-bold text-primary${paidAnim ? ' onit-bump' : ''}`}
              style={paidAnim ? { animationDelay: '380ms', transformOrigin: 'right center' } : undefined}>{money(totals.dueNow)}</div>
            {/* The headline is what's due right now (a deposit, or the balance
                after payments). Show the full project total beneath it so it's
                never hidden — but only when it differs, so a plain unpaid
                invoice (dueNow === total) doesn't read the same figure twice. */}
            {totals.total !== totals.dueNow && (
              <div className="text-xs text-on-surface-variant">Total {money(totals.total)}</div>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {inv.kind === 'invoice' && totals.dueNow > 0 && (
            <select
              className="chip border-paid text-paid bg-surface-container-lowest font-semibold outline-none cursor-pointer"
              value=""
              onChange={(e) => {
                const mode = e.target.value as 'deposit' | 'full' | 'other';
                setPayMode(mode);
                if (mode === 'deposit') setPayAmount(String(Math.max(0, totals.depositAmount - amountPaid)));
                else if (mode === 'full') setPayAmount(String(totals.balanceRemaining));
                else setPayAmount('');
              }}
            >
              <option value="" disabled>Record payment</option>
              {totals.depositAmount > 0 && amountPaid < totals.depositAmount && (
                <option value="deposit">Deposit paid ({money(Math.max(0, totals.depositAmount - amountPaid))})</option>
              )}
              <option value="full">Paid in full ({money(totals.balanceRemaining)})</option>
              <option value="other">Other amount…</option>
            </select>
          )}
          <button className="chip flex items-center gap-1.5" disabled={busy || !shareReady} onClick={() => resend()}>
            <Icon name="attach_file" size={18} /> {shareLabel('Share PDF')}
          </button>
          {inv.kind === 'invoice' && !isDraft && inv.public_token && (
            <button className="chip flex items-center gap-1.5" onClick={copyPayLink}>
              <Icon name={linkCopied ? 'check' : 'link'} size={18} /> {linkCopied ? 'Copied' : 'Copy pay link'}
            </button>
          )}
          {amountPaid > 0 && totals.balanceRemaining > 0 && (
            <button className="chip flex items-center gap-1.5 border-primary text-primary" disabled={busy || !shareReady} onClick={() => resend(true)}>
              <Icon name="send" size={18} /> {shareLabel('Request balance')}
            </button>
          )}
          <button className="chip flex items-center gap-1.5" disabled={downloading} onClick={downloadInvoice}>
            <Icon name="download" size={18} /> {downloading ? 'Preparing…' : 'Download'}
          </button>
          <button className="chip flex items-center gap-1.5" onClick={viewPdf}>
            <Icon name="preview" size={18} /> View PDF
          </button>
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
          <button className="chip flex items-center gap-1.5 border-error text-error"
            onClick={() => setShowDeleteModal(true)}>
            <Icon name="delete" size={18} /> Delete
          </button>
        </div>
        {pdfError && <div className="mt-2 text-xs font-semibold text-error">{pdfError}</div>}
        {shareError && <div className="mt-2 text-xs font-semibold text-error">{shareError}</div>}
        {inv.kind === 'invoice' && payMode !== 'none' && (
          <div className="mt-3 border-t border-outline-variant/30 pt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-on-surface-variant">Method</span>
              <select
                className="rounded border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 font-semibold text-on-surface outline-none"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
              >
                <option value="zelle">Zelle</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
              <span className="ml-2 font-semibold text-on-surface-variant">Date</span>
              <input
                type="date"
                className="rounded border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 outline-none"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-on-surface-variant">Amount</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="w-28 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 text-xs font-semibold outline-none"
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
              <button
                className="chip border-primary text-primary text-xs"
                disabled={!(Number(payAmount) > 0)}
                onClick={() => void recordPayment(Number(payAmount))}
              >
                Save payment
              </button>
              <button
                className="chip text-xs text-on-surface-variant"
                onClick={() => { setPayMode('none'); setPayAmount(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {inv.kind === 'invoice' && (
          <div className="mt-3 flex items-center gap-2">
            <label htmlFor="due-date" className="text-sm font-semibold text-on-surface-variant">Due</label>
            {/* Editable only while a draft — the due date is pinned once the
                invoice is sent (lock_sent_invoice_fields), and letting the input
                accept a change it can't persist would silently no-op. */}
            {isDraft ? (
              <input
                id="due-date"
                type="date"
                className="input h-auto flex-1 py-2 text-sm"
                value={inv.due_date ?? ''}
                onChange={(e) => void setDueDate(e.target.value)}
              />
            ) : (
              <span className="flex-1 py-2 text-sm text-on-surface">
                {inv.due_date ? formatDate(inv.due_date) : '—'}
              </span>
            )}
          </div>
        )}
      </div>
      {payments.length > 0 && (
        <div className="card mb-4">
          <div className="mb-3 text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
            Payment history
          </div>
          <div className="space-y-2">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-b border-outline-variant/30 pb-2 text-xs last:border-0 last:pb-0"
              >
                <div>
                  <span className="font-bold text-on-surface">{money(Number(p.amount))}</span>
                  <span className="ml-2 font-medium text-on-surface-variant">{ledgerEntryLabel(p.entry_type, p.method, Boolean(p.stripe_checkout_session_id), Number(p.amount))}</span>
                  <span className="ml-2 text-on-surface-variant/70">{new Date(p.paid_at).toLocaleDateString()}</span>
                </div>
                {/* Stripe-sourced rows (paid on the pay page, and the refund /
                    dispute rows the webhook records against them) are locked by
                    RLS — a delete would silently match 0 rows — so they get no
                    delete control. Refunds are made in the seller's Stripe Dashboard. */}
                {p.stripe_checkout_session_id || p.stripe_event_id || (p.entry_type && p.entry_type !== 'payment') ? null : deletingPaymentId === p.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-error">Delete?</span>
                    <button className="chip border-error px-2 py-0.5 text-xs text-error" onClick={() => void handleDeletePayment(p.id)}>
                      Yes
                    </button>
                    <button className="chip px-2 py-0.5 text-xs text-on-surface-variant" onClick={() => setDeletingPaymentId(null)}>
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    className="p-1 text-error opacity-70 hover:opacity-100"
                    title="Delete payment"
                    aria-label="Delete payment"
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
      {/* Visible preview — presentational only. html2canvas mis-renders (overlapping
          glyphs, collapsed spacing) when the captured node sits under a CSS
          transform, so this scaled node must NOT carry the capture ref. */}
      <div className="overflow-hidden rounded-card border border-outline-variant">
        <div style={{ transform: 'scale(0.55)', transformOrigin: 'top left', width: 794, height: 1123 * 0.55 }}>
          <InvoiceTemplate template={template} data={rd} theme={theme} />
        </div>
      </div>
      {/* Offscreen capture source — natural scale, no transform. Mirrors the chat
          finalize path so both produce identical clean PDFs. */}
      <div style={{ position: 'fixed', left: -9999, top: 0 }}>
        <div ref={printRef}>
          <InvoiceTemplate template={template} data={rd} theme={theme} />
        </div>
      </div>
      <PrebuiltPdf
        sig={shareSig}
        template={template}
        data={shareRd}
        theme={theme}
        filename={shareFilename}
        onBuilt={(sig, file) => {
          setPrebuilt({ sig, file });
          if (!file) setShareError("Couldn't prepare the PDF. Tap Share PDF to try again.");
        }}
      />
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} />}

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title={`${inv.client_name} (${formatDocNumber(inv.kind, inv.invoice_number)})`}
        recordType={inv.kind === 'quote' ? 'quote' : 'invoice'}
        status={inv.status}
        busy={deleting}
      />

      {undoDelete && (
        <UndoToast
          message={`${inv.kind === 'quote' ? 'Quote' : 'Invoice'} deleted.`}
          onUndo={handleUndo}
          onDismiss={() => {
            setUndoDelete(false);
            router.push('/invoices');
          }}
        />
      )}
    </div>
  );
}
