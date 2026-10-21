'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import InvoicePreviewFrame from '@/components/invoice/InvoicePreviewFrame';
import type { IconName } from '@/components/icon-names';
import RollMoney from '@/components/RollMoney';
import LineItemsEditor, { type EditableLineItem as LineItemRow } from '@/components/LineItemsEditor';
import InvoiceDetailSkeleton from '@/components/InvoiceDetailSkeleton';
import { createClient } from '@/lib/supabase/client';
import { buildTheme, explicitColorRoles } from '@/lib/colors';
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
import DepositValueInput from '@/components/DepositValueInput';
import { cardAvailableFor, fetchConnectEnabled } from '@/lib/connect-client';
import { getSharedUser } from '@/lib/auth-client';
import {
  ATTACHMENT_LOAD_ERROR, copyAttachments, deleteAttachment, listAttachmentRows,
  loadAttachmentItems, materializeAttachments, renumberAttachments, toPdfAttachments,
} from '@/lib/attachments-client';
import AttachmentsEditor, { type EditorAttachment } from '@/components/AttachmentsEditor';
import RecordPaymentBar from '@/components/invoice-detail/RecordPaymentBar';
import RecordPaymentSheet from '@/components/invoice-detail/RecordPaymentSheet';
import type { RecordPaymentInput } from '@/lib/record-payment';

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

// Payment-row icon. Reversal rows (refunds/disputes) read as an undo; manual
// rows use the method's closest Material Symbols glyph (no new font glyphs).
const PAYMENT_ICONS: Record<string, IconName> = {
  zelle: 'send', cash: 'payments', check: 'checkbook', card: 'credit_card',
  cashapp: 'payments', bank: 'account_balance', other: 'more_horiz',
};
const paymentIcon = (method: string, entryType?: string | null): IconName =>
  entryType && entryType !== 'payment' ? 'undo' : (PAYMENT_ICONS[method] ?? 'payments');

// A <input type="date"> value ("YYYY-MM-DD") is a local calendar date. The
// record-payment sheet's date→paid_at conversion now lives (and is tested) in
// lib/record-payment, shared with the sheet.

// Background builder for the SHARED PDF — the detail-page twin of the chat's
// pre-build. Renders the share copy offscreen (natural scale, no transform, so
// html2canvas captures cleanly) and builds the File once the render has been
// stable for 400ms; a newer `sig` cancels the older build's result. The send
// tap then shares the finished file synchronously. No DB writes here.
function PrebuiltPdf({ sig, template, data, theme, filename, attachments, onBuilt }: {
  sig: string;
  template: TemplateKey;
  data: InvoiceRenderData;
  theme: BrandTheme;
  filename: string;
  attachments: EditorAttachment[];
  onBuilt: (sig: string, file: File | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onBuiltRef = useRef(onBuilt);
  onBuiltRef.current = onBuilt;
  // Read through a ref: the effect re-runs only on `sig`, which already encodes
  // the attachment list, so an unrelated render never rebuilds the PDF.
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!ref.current) return;
      try {
        const atts = await toPdfAttachments(createClient(), attachmentsRef.current);
        const file = await elementToPdf(ref.current, filename, { attachments: atts });
        if (!cancelled) onBuiltRef.current(sig, file);
      } catch (e) {
        console.error('share PDF pre-build failed', e);
        if (!cancelled) onBuiltRef.current(sig, null);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // sig covers every input (data, template, theme, filename, attachments,
    // retry nonce).
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
  // Record-payment sheet (a ledger insert via recordPayment, never a direct
  // amount_paid write). The sheet owns its method / date / amount selections.
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  // The invoice_payments ledger rows for this invoice (payment history).
  const [payments, setPayments] = useState<any[]>([]);
  // One-shot "paid" moment (M4, replaces MOTION-SPEC §6's gold sweep): only
  // when a payment recorded here brings the balance to zero. Loading an
  // already-paid invoice never plays it. The status word fades (120ms), a PAID
  // stamp lands with a small settle (200–700ms), the card dips 3px on impact,
  // and the amount rolls down to what's left (500–1200ms).
  const [paidAnim, setPaidAnim] = useState(false);
  const [paidFrom, setPaidFrom] = useState<number | null>(null);
  const paidAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paidTickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (paidAnimTimerRef.current) clearTimeout(paidAnimTimerRef.current);
    if (paidTickRef.current) clearTimeout(paidTickRef.current);
  }, []);
  function celebratePaid(dueBefore: number) {
    if (paidAnimTimerRef.current) clearTimeout(paidAnimTimerRef.current);
    if (paidTickRef.current) clearTimeout(paidTickRef.current);
    setPaidFrom(dueBefore);
    setPaidAnim(true);
    paidAnimTimerRef.current = setTimeout(() => setPaidAnim(false), 1300);
    // Success tick as the stamp lands (Android; iOS ignores vibrate).
    paidTickRef.current = setTimeout(() => { try { navigator.vibrate?.(12); } catch { /* unsupported */ } }, 450);
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
  // Attachments for THIS invoice — thumbnails in the strip under the preview,
  // and the images the PDFs print 2-per-page after the body. Loaded from
  // invoice_attachments; edited here only while the document is a draft.
  const [attachments, setAttachments] = useState<EditorAttachment[]>([]);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  // The PDF builders read the list through a ref so a stale closure can never
  // print an older set of images than what's on screen.
  const attachmentsRef = useRef<EditorAttachment[]>([]);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);

  useEffect(() => {
    (async () => {
      // Signed-out guard — redirect UX only; RLS is the real boundary. Same
      // pattern as summary/settings: getSession() is a no-network local read so
      // the decision can't hang on a stalled getUser(). Middleware only refreshes
      // the cookie; it never redirects.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data: { user } } = await getSharedUser();
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
        // The invoice's attached images (RLS-scoped to the owner). A read can't
        // block the page: on failure the strip simply starts empty.
        void loadAttachmentItems(supabase, i.id).then(setAttachments, () => undefined);
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
  const colorRolesExplicit = snapped ? inv.color_roles_explicit : profile.color_roles_explicit;
  const theme = backgroundColor && brandColors?.length >= 2
    ? buildTheme(
      brandColors,
      backgroundColor,
      colorRolesExplicit ? explicitColorRoles(brandColors, backgroundColor) : undefined,
    )
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
  // payment-received line.
  // Money in only: a refund or dispute row isn't a payment.
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
    // Flag only; the bank details stay on the pay page, never on the PDF.
    bankTransferAvailable: profile?.bank_transfer_enabled === true,
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
  // an edit, or the attachment list) moves it and PrebuiltPdf rebuilds.
  const attachSig = attachments.map((a) => `${a.id}:${a.storagePath ?? a.copyFromPath ?? 'blob'}`).join('|');
  const shareSig = JSON.stringify({ shareRd, template, theme, shareFilename, prebuildNonce, attachSig });
  const shareReady = prebuilt?.sig === shareSig;
  const shareFile = shareReady ? prebuilt!.file : null;
  const shareLabel = (idle: string) => (busy ? 'Sending' : !shareReady ? 'Preparing' : idle);

  // Build the PDF for the CURRENT invoice with its attachments appended. STRICT
  // on purpose: an image that can't be read throws, so a PDF is never produced
  // silently missing a picture — the caller shows the error and the user retries.
  async function buildPdf(el: HTMLElement, filename: string): Promise<File> {
    const atts = await toPdfAttachments(supabase, attachmentsRef.current);
    return elementToPdf(el, filename, { attachments: atts });
  }
  const attachmentFailure = (e: unknown) =>
    e instanceof Error && e.message === ATTACHMENT_LOAD_ERROR
      ? "A picture couldn't be loaded, so the PDF wasn't made. Check your connection and try again."
      : null;

  // Save a freshly-picked image right away: unlike the chat (which defers to the
  // build), the detail page edits an invoice that already exists. The optimistic
  // list shows the thumbnail at once; a failed upload keeps the successes and
  // asks the user to add the failed one again.
  async function saveAttachments(next: EditorAttachment[]) {
    if (!inv) return;
    setAttachmentsError(null);
    setAttachments(next);
    if (!next.some((a) => !a.storagePath && a.blob)) return;
    try {
      const res = await materializeAttachments(supabase, inv.user_id, id, next);
      if (res.failedId) {
        setAttachments(res.items.filter((a) => a.storagePath));
        setAttachmentsError("Couldn't save that image. Please add it again.");
        return;
      }
      setAttachments(res.items);
    } catch {
      setAttachments(next.filter((a) => a.storagePath));
      setAttachmentsError("Couldn't save that image. Please add it again.");
    }
  }

  // Delete the row + object, then rewrite the survivors to 0..n-1 with the
  // delete + re-insert strategy — never sequential position UPDATEs, which would
  // collide transiently on unique(invoice_id, position).
  async function removeAttachment(item: EditorAttachment) {
    if (!inv || !item.rowId || !item.storagePath) return;
    setAttachmentsError(null);
    try {
      await deleteAttachment(supabase, { id: item.rowId, storage_path: item.storagePath, position: 0 });
      const rows = await listAttachmentRows(supabase, id);
      await renumberAttachments(supabase, inv.user_id, id, rows);
      setAttachments(await loadAttachmentItems(supabase, id));
    } catch {
      setAttachmentsError("Couldn't remove that image. Please try again.");
      setAttachments(await loadAttachmentItems(supabase, id));
    }
  }

  // Open the PDF in a new tab, rendered fresh from the current render data. Mobile
  // popup blockers only allow window.open synchronously inside the click gesture,
  // so open the tab first and point it at the blob once the PDF is ready.
  async function viewPdf() {
    if (!printRef.current) return;
    setPdfError(null);
    const w = window.open('', '_blank');
    try {
      const filename = invoiceFilename(inv.kind, inv.invoice_number, inv.client_name, rd.businessName);
      const file = await buildPdf(printRef.current, filename);
      const url = URL.createObjectURL(file);
      if (w) w.location.href = url;
      else window.open(url, '_blank'); // the synchronous open was blocked; try once more
      // Release the blob after the tab has had time to load it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      // Render failed — don't strand the blank tab we opened, and tell the user.
      console.error('view pdf failed', e);
      w?.close();
      setPdfError(attachmentFailure(e) ?? "Couldn't open the PDF. Please try again.");
    }
  }

  // View and Download both render the CURRENT state of the invoice fresh from rd,
  // so a recorded payment (balance due, payment-received line) is always shown.
  // The exact as-sent copy is preserved in the Vault (reachable from the Vault
  // page) and is never read, modified, or re-uploaded here. Neither marks sent.
  async function downloadInvoice() {
    if (downloading || !printRef.current) return;
    setDownloading(true);
    setPdfError(null);
    try {
      const filename = invoiceFilename(inv.kind, inv.invoice_number, inv.client_name, rd.businessName);
      const file = await buildPdf(printRef.current, filename);
      downloadFile(file);
    } catch (e) {
      console.error('download pdf failed', e);
      setPdfError(attachmentFailure(e) ?? "Couldn't make the PDF. Please try again.");
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
  async function recordPayment({ amount, method, paidAt }: RecordPaymentInput): Promise<boolean> {
    if (!(amount > 0)) return false;
    const dueBefore = totals.dueNow;
    const { data: { user } } = await getSharedUser();
    if (!user) return false;
    const { error } = await supabase.from('invoice_payments').insert({
      invoice_id: id,
      user_id: user.id,
      amount,
      method,
      paid_at: paidAt,
    });
    if (error) {
      console.error('record payment failed', error);
      return false;
    }
    // Celebrate when the balance hits zero, not on status: the ledger trigger
    // only flips status to 'paid' for sent/overdue invoices, so a draft paid in
    // full keeps its status but is still fully paid.
    const fullyPaid = (row: any) => Number(row?.total) > 0 && Number(row?.amount_paid ?? 0) >= Number(row?.total);
    const wasFullyPaid = fullyPaid(inv);
    const { data: updated } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
    if (updated) {
      setInv(updated);
      if (!wasFullyPaid && fullyPaid(updated)) celebratePaid(dueBefore);
    }
    setPaySheetOpen(false);
    void fetchPayments();
    return true;
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
    setPdfError(null);
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
      if (created) {
        // D4: the new invoice carries the quote's pictures (files duplicated into
        // the invoice's own folder + fresh rows). If a copy fails, undo the
        // conversion — nothing half-made lingers and a retry starts clean. The
        // quote's own rows and files are only read, never written.
        const copy = await copyAttachments(supabase, inv.user_id, inv.id, created.id);
        if (!copy.ok) {
          await supabase.from('invoices').update({ deleted_at: new Date().toISOString() }).eq('id', created.id);
          setPdfError("Couldn't copy this quote's pictures, so nothing was converted. Please try again.");
          return;
        }
        router.push(`/invoices/${created.id}`);
      }
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

  // Owner-only; never part of the render data, so never on the PDF/pay page.
  async function applyPrivateNotes(private_notes: string) {
    setInv({ ...inv, private_notes });
    await supabase.from('invoices').update({ private_notes: private_notes.trim() ? private_notes : null }).eq('id', id);
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

  // ── Receipt header (invoice detail redesign) ──
  // Display-only reads of the financial engine's output; the money math itself
  // stays in lib/financials. "Paid" is the balance reaching zero — the same
  // meaning the ledger trigger and the public pay page use.
  const fullyPaid = totals.total > 0 && totals.balanceRemaining <= 0;
  // Payments belong to invoices only; a quote's amount_paid is always 0, but
  // keep the flag scoped so a quote can never read "partially paid".
  const partiallyPaid = inv.kind === 'invoice' && amountPaid > 0 && !fullyPaid && totals.total > 0;
  const paidPct = totals.total > 0 ? Math.min(100, Math.max(0, Math.round((amountPaid / totals.total) * 100))) : 0;
  const statusLabel = invoiceStatusLabel(inv.status, inv.refunded_amount, inv.amount_paid);
  const chipLabel = fullyPaid
    ? 'Paid'
    : inv.status === 'overdue'
      ? 'Overdue'
      : inv.status === 'draft'
        ? 'Draft'
        : inv.kind === 'quote'
          ? 'Sent'
          : partiallyPaid
            ? 'Partially paid'
            : statusLabel === 'sent'
              ? 'Sent · Unpaid'
              : statusLabel;
  const chipClass = fullyPaid
    ? 'bg-paid-container text-paid'
    : inv.status === 'overdue'
      ? 'bg-error-container text-error'
      : inv.status === 'draft'
        ? 'bg-draft-container text-draft'
        : 'bg-sent-container text-sent';
  const heroLabel = fullyPaid
    ? 'Paid in full'
    : inv.kind === 'quote'
      ? 'Quote total'
      : totals.depositAmount > 0 && amountPaid < totals.depositAmount
        ? 'Deposit due'
        : partiallyPaid
          ? 'Balance due'
          : 'Amount due';
  // "in N days" / "N days overdue" for the due-date row. A bare YYYY-MM-DD is a
  // LOCAL calendar date (same rule as formatDate) so the count never slips a
  // day across the UTC offset.
  const dueDays = (() => {
    const raw = inv.due_date as string | null | undefined;
    if (inv.kind !== 'invoice' || !raw) return null;
    let y: number, m: number, d: number;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      [y, m, d] = raw.split('-').map(Number);
    } else {
      const dt = new Date(raw);
      if (Number.isNaN(dt.getTime())) return null;
      y = dt.getFullYear(); m = dt.getMonth() + 1; d = dt.getDate();
    }
    const now = new Date();
    const due = new Date(y, m - 1, d);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    if (inv.status === 'paid') return { days, text: 'paid' };
    if (days === 0) return { days, text: 'due today' };
    if (days > 0) return { days, text: `in ${days} day${days === 1 ? '' : 's'}` };
    return { days, text: `${-days} day${days === -1 ? '' : 's'} overdue` };
  })();

  // The four primary actions render as equal tiles; everything else (request
  // balance, convert, links, delete) stays a chip so the layout can wrap.
  type QuickAction = {
    key: string; label: string; icon: IconName;
    disabled?: boolean; tone?: 'good'; onClick: () => void;
  };
  const quickActions: QuickAction[] = [
    {
      key: 'share', label: shareLabel('Share PDF'), icon: 'attach_file',
      disabled: busy || !shareReady, onClick: () => resend(),
    },
    ...(inv.kind === 'invoice' && !isDraft && inv.public_token
      ? [{
          key: 'link', label: linkCopied ? 'Copied' : 'Pay link',
          icon: (linkCopied ? 'check' : 'link') as IconName,
          tone: linkCopied ? ('good' as const) : undefined, onClick: copyPayLink,
        }]
      : []),
    {
      key: 'download', label: downloading ? 'Preparing' : isDraft && inv.kind === 'invoice' ? 'Download draft' : 'Download',
      icon: 'download', disabled: downloading, onClick: downloadInvoice,
    },
    { key: 'view', label: 'View PDF', icon: 'preview', onClick: viewPdf },
  ];

  // The sticky bar exists only while an invoice still has a balance to collect.
  const showPayBar = inv.kind === 'invoice' && totals.balanceRemaining > 0;

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
    <div className={`px-4 py-4${showPayBar ? ' pb-28' : ''}`}>
      <div className={`card relative mb-4 overflow-hidden${paidAnim ? ' onit-paid-dip' : ''}`}>
        {paidAnim && <span aria-hidden className="onit-paid-stamp">PAID</span>}

        {/* Receipt top: status chip + doc number, then who and what. */}
        <div className="flex items-center justify-between gap-2">
          <span className={`status-chip ${chipClass}`}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            {chipLabel}
          </span>
          <span className="font-mono text-xs font-semibold tracking-wide text-on-surface-variant">
            {formatDocNumber(inv.kind, inv.invoice_number)}
          </span>
        </div>
        <div className="mt-3 font-display text-2xl font-bold leading-tight text-on-background">
          {inv.client_name}
        </div>
        <div className="mt-0.5 text-sm text-on-surface-variant">
          {docNoun(inv.kind)} ·{' '}
          <span className={`inline-block${paidAnim ? ' onit-paid-word' : ''}${fullyPaid ? ' font-semibold text-paid' : ''}`}>
            {statusLabel}
          </span>
        </div>
        {/* First qualifying client view (mark_invoice_viewed), in local time. */}
        {inv.viewed_at && (
          <div className="mt-0.5 text-xs text-on-surface-variant">Viewed {formatDate(inv.viewed_at)}</div>
        )}

        {/* Ticket perforation: two half-cut notches and a dashed seam. The card
            clips its overflow, so each notch shows as the inner half circle. */}
        <div aria-hidden className="relative my-3.5 h-4">
          <span className="absolute left-0 top-0 h-4 w-4 -translate-x-1/2 rounded-full border border-outline-variant/30 bg-background" />
          <span className="absolute right-0 top-0 h-4 w-4 translate-x-1/2 rounded-full border border-outline-variant/30 bg-background" />
          <span className="absolute left-3 right-3 top-2 border-t border-dashed border-outline-variant" />
        </div>

        {/* Hero: what's due right now (deposit-aware), rolling to 0 on the paid
            moment (MOTION-SPEC §6). The full total sits beneath when it differs. */}
        <div className="text-xs font-semibold text-on-surface-variant">{heroLabel}</div>
        <div className="mt-0.5 flex items-center gap-2">
          <div className="font-display text-4xl font-bold leading-none tracking-tight text-primary tabular-nums">
            <RollMoney value={totals.dueNow} from={paidFrom} run={paidAnim} format={money} delayMs={500} durationMs={700} />
          </div>
          {fullyPaid && (
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paid text-white">
              <Icon name="check" size={18} />
            </span>
          )}
        </div>
        {partiallyPaid && (
          <>
            <div className="mt-1 text-sm text-on-surface-variant">
              of {money(totals.total)} · {money(amountPaid)} paid
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container">
              <div
                className="h-full rounded-full bg-primary-container transition-[width] duration-500"
                style={{ width: `${paidPct}%` }}
              />
            </div>
          </>
        )}
        {!partiallyPaid && totals.total !== totals.dueNow && (
          <div className="mt-1 text-xs text-on-surface-variant">Total {money(totals.total)}</div>
        )}

        {/* Due date — editable on a draft, pinned once sent
            (lock_sent_invoice_fields), so the input can never no-op. */}
        {inv.kind === 'invoice' && (
          <div className="mt-4 flex min-h-touch items-center gap-2.5 rounded-input border border-outline-variant/40 bg-surface-container-lowest px-3.5 py-2">
            <Icon name="schedule" size={18} className="shrink-0 text-on-surface-variant" />
            {isDraft ? (
              <>
                <label htmlFor="due-date" className="shrink-0 text-sm font-semibold text-on-surface-variant">Due</label>
                <input
                  id="due-date"
                  type="date"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-on-surface outline-none"
                  value={inv.due_date ?? ''}
                  onChange={(e) => void setDueDate(e.target.value)}
                />
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">
                Due {inv.due_date ? formatDate(inv.due_date) : '—'}
              </span>
            )}
            {dueDays && !isDraft && (
              <span className={`shrink-0 text-xs ${
                dueDays.days < 0 && inv.status !== 'paid' ? 'font-semibold text-error' : 'text-on-surface-variant'
              }`}>
                {dueDays.text}
              </span>
            )}
          </div>
        )}
        {/* Four equal quick-action tiles. */}
        <div
          className="mt-3 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${quickActions.length}, minmax(0, 1fr))` }}
        >
          {quickActions.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={a.disabled}
              onClick={a.onClick}
              className={`flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-[14px] border px-1 py-2 text-center text-[11px] font-semibold leading-tight transition active:scale-[0.96] disabled:opacity-40 sm:text-[12px] ${
                a.tone === 'good'
                  ? 'border-paid/40 bg-paid-container text-paid'
                  : 'border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant'
              }`}
            >
              <Icon name={a.icon} size={20} />
              <span>{a.label}</span>
            </button>
          ))}
        </div>

        {/* Secondary actions. */}
        <div className="mt-2 flex flex-wrap gap-2">
          {amountPaid > 0 && totals.balanceRemaining > 0 && (
            <button className="chip flex items-center gap-1.5 border-primary text-primary" disabled={busy || !shareReady} onClick={() => resend(true)}>
              <Icon name="send" size={18} /> {shareLabel('Request balance')}
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
        {pdfError && <div className="mt-2 text-xs font-semibold text-error">{pdfError}</div>}
        {shareError && <div className="mt-2 text-xs font-semibold text-error">{shareError}</div>}
      </div>
      {payments.length > 0 && (
        <div className="card mb-4">
          <div className="mb-3 text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
            Payments
          </div>
          <div className="space-y-2">
            {payments.map((p) => {
              // Stripe-sourced rows (paid on the pay page) are locked by RLS — a
              // delete would silently match 0 rows — so they get no delete
              // control. Refunds are handled in the seller's Stripe Dashboard.
              const locked = Boolean(p.stripe_checkout_session_id || p.stripe_event_id || (p.entry_type && p.entry_type !== 'payment'));
              const confirming = deletingPaymentId === p.id;
              return (
                <div key={p.id} className="rounded-[14px] bg-surface-container-lowest">
                  <div className="flex min-h-touch items-center gap-3 px-3 py-2">
                    <span aria-hidden className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-surface-container text-primary">
                      <Icon name={paymentIcon(p.method, p.entry_type)} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-on-surface">
                        {ledgerEntryLabel(p.entry_type, p.method, Boolean(p.stripe_checkout_session_id), Number(p.amount))}
                      </span>
                      <span className="block text-[13px] text-on-surface-variant">{new Date(p.paid_at).toLocaleDateString()}</span>
                    </span>
                    <span className="shrink-0 font-display text-base font-bold tabular-nums text-on-surface">
                      {money(Number(p.amount))}
                    </span>
                    {!locked && !confirming && (
                      <button
                        type="button"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-error opacity-80 transition active:scale-95"
                        title="Delete payment"
                        aria-label="Delete payment"
                        onClick={() => setDeletingPaymentId(p.id)}
                      >
                        <Icon name="delete" size={16} />
                      </button>
                    )}
                  </div>
                  {!locked && confirming && (
                    <div className="flex items-center justify-end gap-2 px-3 pb-2">
                      <span className="text-xs font-semibold text-error">Delete?</span>
                      <button className="chip border-error px-3 text-xs text-error" onClick={() => void handleDeletePayment(p.id)}>
                        Yes
                      </button>
                      <button className="chip px-3 text-xs text-on-surface-variant" onClick={() => setDeletingPaymentId(null)}>
                        No
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between px-1 pb-0.5 pt-3 text-sm text-on-surface-variant">
            <span>{fullyPaid ? 'Balance' : 'Still owed'}</span>
            <span className={`font-display font-bold tabular-nums ${fullyPaid ? 'text-paid' : 'text-on-surface'}`}>
              {money(totals.balanceRemaining)}
            </span>
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
          <div className="mt-3 flex items-center justify-between border-t border-outline-variant/30 pt-3">
            <span className="text-sm font-semibold text-on-surface-variant">Total</span>
            <span className="font-display text-lg font-bold tabular-nums text-on-surface">{money(totals.total)}</span>
          </div>
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
                    <DepositValueInput
                      mode={inv.deposit_type}
                      className="w-20 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 text-right text-xs font-semibold outline-none"
                      value={inv.deposit_value}
                      placeholder={inv.deposit_type === 'percentage' ? '40' : '100'}
                      onChange={(v) => void applyDeposit(inv.deposit_type as DepositType, v)}
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
              <div>
                <label htmlFor="private-notes-input" className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Private notes · only you see these
                </label>
                <textarea
                  id="private-notes-input"
                  className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2.5 py-1.5 text-xs text-on-surface outline-none resize-none"
                  rows={2}
                  maxLength={4000}
                  placeholder="Tech, manager, anything not for the customer."
                  value={inv.private_notes ?? ''}
                  onChange={(e) => void applyPrivateNotes(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      )}
      {/* Visible preview — presentational only. html2canvas mis-renders (overlapping
          glyphs, collapsed spacing) when the captured node sits under a CSS
          transform, so this scaled node must NOT carry the capture ref. The
          shared frame fits the phone width and caps desktop at the old 0.55
          preview size, so nothing is clipped on the right. */}
      <InvoicePreviewFrame
        template={template}
        data={rd}
        theme={theme}
        fit="width"
        maxScale={0.55}
        frameClassName="rounded-card"
      />
      {/* Attachments strip — deliberately OUTSIDE the invoice body, which stays
          image-free: attached pictures print on their own pages in the PDF, not
          in the document. Editable on a draft only; a sent/paid document shows
          the thumbnails read-only (no add/remove). Hidden when read-only and
          empty so a document with none looks exactly as it did before. */}
      {(isDraft || attachments.length > 0) && (
        <div className="card mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Attachments</span>
            {isDraft && attachments.length > 0 && (
              <span className="text-xs text-on-surface-variant/70">Prints after the invoice</span>
            )}
          </div>
          <AttachmentsEditor
            items={attachments}
            editable={isDraft}
            onChange={(next) => void saveAttachments(next)}
            onRemove={(a) => { void removeAttachment(a); }}
          />
          {attachmentsError && <div className="mt-2 text-xs font-semibold text-error">{attachmentsError}</div>}
        </div>
      )}
      {/* Delete sits last, past the PDF, away from the everyday actions. */}
      <button
        type="button"
        onClick={() => setShowDeleteModal(true)}
        className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border border-error/40 bg-transparent text-[15px] font-semibold text-error transition active:scale-[0.985]"
      >
        <Icon name="delete" size={18} /> Delete {inv.kind === 'quote' ? 'quote' : 'invoice'}
      </button>

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
        attachments={attachments}
        onBuilt={(sig, file) => {
          setPrebuilt({ sig, file });
          if (!file) setShareError("Couldn't prepare the PDF. Tap Share PDF to try again.");
        }}
      />
      {/* Record payment — the sticky bar sits above the real tab bar while a
          balance remains; the sheet owns the selection and calls recordPayment. */}
      {showPayBar && (
        <RecordPaymentBar amount={money(totals.balanceRemaining)} onOpen={() => setPaySheetOpen(true)} />
      )}
      {paySheetOpen && (
        <RecordPaymentSheet
          clientName={inv.client_name}
          balance={totals.balanceRemaining}
          depositRemaining={Math.max(0, totals.depositAmount - amountPaid)}
          onClose={() => setPaySheetOpen(false)}
          onSave={recordPayment}
        />
      )}

      {showPaywall && <PaywallModal returnTo="invoices" onClose={() => setShowPaywall(false)} />}

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
