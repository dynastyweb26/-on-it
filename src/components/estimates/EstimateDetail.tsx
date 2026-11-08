'use client';
import { postOwnerCard } from '@/lib/owner-cards';
import { formatDocNumber } from '@/lib/documents';
// ═══ Estimate detail (owner) ═══
// Spec §3 of design/estimates/ESTIMATES-DESIGN-SPEC.md, mounted from the
// invoice detail page for kind='quote' only. Invoices never reach this file.
//
// Estimates have no PDFs: everything is delivered as the /e/<token> link, and
// sending/resending goes through the estimate routes (never the invoice send
// route). Approval is written only by the client's signature (sign_estimate) —
// there is no owner "mark as signed" control any more.
import { convertedDepositColumns } from '@/lib/estimates/convert';
import PopSheet from '@/components/popups/PopSheet';
import {
  convertActionLabel, REVOKE_LINK_CONSEQUENCE, revokeLinkMeta, revokeLinkSub,
} from '@/lib/popups/destructive';
import { CLIPBOARD_BLOCKED_TEXT } from '@/lib/popups/decision';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import LineItemsEditor, { type EditableLineItem as LineItemRow } from '@/components/LineItemsEditor';
import PaywallModal from '@/components/PaywallModal';
import ChatNudgeCard from '@/components/ChatNudgeCard';
import { isPaidTier } from '@/lib/paywall';
import { estimateApprovedPrompt, markSeen, promptDue, type SoftPrompt } from '@/lib/soft-prompts';
import { createClient } from '@/lib/supabase/client';
import { calculateInvoiceTotals, money } from '@/lib/financials';
import { defaultDueDate } from '@/lib/dates';
import { copyAttachments } from '@/lib/attachments-client';
import type { PublicEstimate } from '@/lib/estimates/types';
import {
  estimateLink,
  estimateShareText,
  requestEstimateExtend,
  requestEstimatePreview,
  requestEstimateRevoke,
  requestEstimateSend,
  requestEstimateEdits,
  shareEstimateLink,
} from '@/lib/estimates/owner-actions';
import {
  estimateNumber,
  extendValidity,
  firstName,
  mergeLineItemEdits,
  isLinkLive,
  isOwnerEditable,
  ownerEstimateState,
  sentOrApprovedDate,
  shortDate,
  signedMethodLabel,
  signedStamp,
  validityLabel,
  type OwnerEstimateState,
} from '@/lib/estimates/owner-view';
import EstimateAttachments from '@/components/estimates/EstimateAttachments';

export type EstimateDetailRow = {
  id: string;
  user_id: string;
  client_id: string | null;
  invoice_number: number;
  kind: string | null;
  status: string | null;
  title: string | null;
  client_name: string | null;
  client_address: string | null;
  client_phone: string | null;
  client_email: string | null;
  line_items: LineItemRow[] | null;
  subtotal: number | string | null;
  tax_rate: number | string | null;
  tax_amount: number | string | null;
  total: number | string | null;
  notes: string | null;
  public_token: string | null;
  approved_at: string | null;
  revoked_at: string | null;
  valid_until: string | null;
  sent_at: string | null;
  first_sent_at: string | null;
};

export type EstimateProfile = {
  business_name: string | null;
  timezone: string | null;
  [key: string]: unknown;
};

type SignatureRow = {
  signer_name: string;
  signature_type: 'draw' | 'type';
  signature_data: string;
  signed_at: string;
};

type Busy = 'send' | 'convert' | 'extend' | 'revoke' | 'preview' | null;

const CHIP: Record<OwnerEstimateState, { label: string; icon: 'edit' | 'verified' | 'schedule' | 'lock' | 'link_off' | null; className: string }> = {
  draft: { label: 'Draft', icon: 'edit', className: 'bg-draft-container text-draft' },
  sent: { label: 'Sent', icon: null, className: 'bg-sent-container text-sent' },
  expired: { label: 'Expired', icon: 'schedule', className: 'bg-[#F4E2D8] text-[#8A3B1E]' },
  approved: { label: 'Approved', icon: 'verified', className: 'bg-paid-container text-paid' },
  converted: { label: 'Converted', icon: 'lock', className: 'bg-surface-container text-on-surface-variant' },
  revoked: { label: 'Link closed', icon: 'link_off', className: 'bg-surface-container text-on-surface-variant' },
  unavailable: { label: 'Unavailable', icon: 'lock', className: 'bg-surface-container text-on-surface-variant' },
};

export default function EstimateDetail({
  estimate,
  profile,
  convertedToId,
}: {
  estimate: EstimateDetailRow;
  profile: EstimateProfile;
  /** The invoice this estimate became, when it was already converted. */
  convertedToId?: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [inv, setInv] = useState(estimate);
  const [signature, setSignature] = useState<SignatureRow | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // Synchronous guard: `busy` lags a render, so a same-frame second tap could
  // otherwise convert the estimate twice.
  const convertingRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Converting hits the invoice cap, duplicating hits the estimate cap.
  const [paywallFor, setPaywallFor] = useState<null | 'invoice' | 'estimate'>(null);
  // The signed moment (lib/soft-prompts.ts): shown once per estimate.
  const [moment, setMoment] = useState<SoftPrompt | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(inv.title ?? '');
  const titleCancelled = useRef(false);
  const sendingRef = useRef(false);
  const [preview, setPreview] = useState<PublicEstimate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // 4A edit-in-place: every edit is staged locally and ONE "Save changes" writes
  // them together, so bump_estimate_version bumps the version once per save.
  const [itemsDraft, setItemsDraft] = useState<LineItemRow[]>((estimate.line_items ?? []) as LineItemRow[]);
  const [saving, setSaving] = useState(false);

  const id = inv.id;
  const tz = profile.timezone ?? null;

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }

  // The signed card's data. One owner-readable row (RLS: own quote only).
  useEffect(() => {
    let cancelled = false;
    if (!inv.approved_at) {
      setSignature(null);
      return;
    }
    supabase
      .from('estimate_signatures')
      .select('signer_name, signature_type, signature_data, signed_at')
      .eq('estimate_id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSignature((data as SignatureRow | null) ?? null);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, inv.approved_at]);

  const state = ownerEstimateState(
    {
      status: inv.status,
      approvedAt: inv.approved_at,
      revokedAt: inv.revoked_at,
      validUntil: inv.valid_until,
      converted: Boolean(convertedToId),
    },
    new Date(),
    tz,
  );
  const editable = isOwnerEditable(state);
  const linked = isLinkLive(state);
  const totals = calculateInvoiceTotals(itemsDraft, Number(inv.tax_rate ?? 0));
  const taxRate = Number(inv.tax_rate ?? 0);
  const chip = CHIP[state];
  const validity = validityLabel(state, inv.valid_until);
  const title = (inv.title ?? '').trim();
  const heading = title || inv.client_name || 'Estimate';
  const clientFirst = firstName(inv.client_name);

  const sentRaw = inv.first_sent_at ?? inv.sent_at;
  const sentDateText = sentRaw ? sentOrApprovedDate(sentRaw, tz) : null;

  const subtitle = (() => {
    if (state === 'draft') return 'Draft';
    if (state === 'sent') {
      const sent = inv.first_sent_at ?? inv.sent_at;
      return sent ? `Sent ${sentOrApprovedDate(sent, tz)}` : 'Sent';
    }
    if (state === 'approved' && inv.approved_at) return `Approved ${sentOrApprovedDate(inv.approved_at, tz)}`;
    if (state === 'expired') return 'Expired';
    if (state === 'converted') return 'Converted';
    if (state === 'revoked') return 'Link deactivated';
    return 'Unavailable';
  })();

  const publicUrl = estimateLink(inv.public_token);

  // The moment this estimate came back signed: a non-paid owner gets one quiet
  // card, with the screen's own Convert as the primary action. Tier comes from
  // /api/access (the one access source) and it is marked seen when shown, so it
  // never returns for this estimate.
  useEffect(() => {
    if (state !== 'approved' || convertedToId) {
      setMoment(null);
      return;
    }
    const prompt = estimateApprovedPrompt(inv.client_name, id);
    if (!promptDue(prompt, inv.user_id)) return;
    let cancelled = false;
    fetch('/api/access', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((a: { tier?: string | null; subscriptionsEnabled?: boolean } | null) => {
        // Paid, unreachable, or no purchase path in this deployment: nothing to say.
        if (cancelled || !a || isPaidTier(a.tier) || a.subscriptionsEnabled === false) return;
        markSeen(inv.user_id, prompt.key);
        setMoment(prompt);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [state, convertedToId, id, inv.user_id, inv.client_name]);

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      showToast('Link copied');
    } catch {
      showToast(CLIPBOARD_BLOCKED_TEXT);
    }
  }

  async function shareLink() {
    if (!publicUrl) return;
    setActionError(null);
    const result = await shareEstimateLink({
      url: publicUrl,
      title: `Estimate ${estimateNumber(inv.invoice_number)}`,
      text: estimateShareText(profile.business_name),
    });
    if (result === 'copied') showToast('Link copied');
    if (result === 'failed') showToast(CLIPBOARD_BLOCKED_TEXT);
  }

  async function send() {
    // busy is state and lags a render; the ref makes a second tap in the same
    // frame a no-op so one tap can never send twice.
    if (busy || sendingRef.current) return;
    sendingRef.current = true;
    setBusy('send');
    setActionError(null);
    try {
      const outcome = await requestEstimateSend(id);
      if (!outcome.ok) {
        setActionError(outcome.message);
        return;
      }
      setInv((prev) => ({ ...prev, ...(outcome.estimate as Partial<EstimateDetailRow>) }));
      // Sending makes the link live and nothing else: there is no PDF and no
      // message goes out. The toast says so, so the owner knows the link is
      // theirs to copy or share.
      showToast(`Estimate is live. Copy or share the link with ${clientFirst}.`);
    } finally {
      sendingRef.current = false;
      setBusy(null);
    }
  }

  async function openPreview() {
    if (busy) return;
    setBusy('preview');
    setActionError(null);
    try {
      const outcome = await requestEstimatePreview(id);
      if (!outcome.ok) {
        setActionError(outcome.message);
        return;
      }
      setPreview(outcome.preview);
      setPreviewOpen(true);
    } finally {
      setBusy(null);
    }
  }

  // P-14: converting mints a numbered invoice, so it asks first (board C4).
  const [convertAsk, setConvertAsk] = useState(false);
  // A card's Convert button lands here with ?convert=1: open the SAME confirm
  // the screen's own button opens. Nothing converts on one tap, and the param
  // is dropped so a refresh does not reopen the sheet.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('convert') !== '1') return;
    if (state !== 'approved') return;
    setConvertAsk(true);
    router.replace(`/invoices/${inv.id}`);
  }, [state, inv.id, router]);

  // The confirm, not the action: opened by the Convert button and by the
  // approved nudge's CTA, so neither can create an invoice on one tap.
  function askConvert() {
    if (busy || convertingRef.current || state !== 'approved') return;
    setActionError(null);
    setConvertAsk(true);
  }

  async function convertToInvoice() {
    if (busy || convertingRef.current || state !== 'approved') return;
    convertingRef.current = true;
    setBusy('convert');
    setActionError(null);
    // Server-side idempotency reuses the invoice finalize_key (unique per user):
    // a retry after a lost response returns the same invoice instead of minting
    // a second numbered document.
    const idempotencyKey = `convert-${inv.id}`;
    try {
      const { data: created, error } = await supabase.from('invoices').insert({
        user_id: inv.user_id,
        client_id: inv.client_id,
        kind: 'invoice',
        client_name: inv.client_name,
        client_address: inv.client_address ?? null,
        client_phone: inv.client_phone ?? null,
        client_email: inv.client_email ?? null,
        line_items: inv.line_items,
        subtotal: inv.subtotal,
        tax_rate: inv.tax_rate,
        tax_amount: inv.tax_amount,
        total: inv.total,
        ...convertedDepositColumns(inv),
        notes: inv.notes,
        status: 'draft',
        converted_from: inv.id,
        due_date: defaultDueDate(),
        finalize_key: idempotencyKey,
      }).select('id, invoice_number').single();
      if (error) {
        if (error.hint === 'PAYWALL_LIMIT') {
          setPaywallFor('invoice');
          return;
        }
        if (error.code === '23505') {
          const { data: existing } = await supabase
            .from('invoices')
            .select('id, deleted_at, invoice_number')
            .eq('user_id', inv.user_id)
            .eq('finalize_key', idempotencyKey)
            .maybeSingle();
          if (existing?.id) {
            // A prior attempt created it. Restore it if that attempt rolled back
            // on an attachment failure, then land on the same invoice.
            if (existing.deleted_at) {
              await supabase.from('invoices').update({ deleted_at: null }).eq('id', existing.id);
            }
            setConvertAsk(false);
            postOwnerCard({
              title: existing.invoice_number != null
                ? `${formatDocNumber('invoice', existing.invoice_number)} is ready`
                : 'Your invoice is ready',
              invoiceId: existing.id,
            });
            router.push(`/invoices/${existing.id}`);
            return;
          }
        }
        console.error('convert estimate failed', error);
        throw error;
      }
      if (!created) return;
      const copy = await copyAttachments(supabase, inv.user_id, inv.id, created.id);
      if (!copy.ok) {
        await supabase.from('invoices').update({ deleted_at: new Date().toISOString() }).eq('id', created.id);
        throw new Error('attachment copy failed');
      }
      // The owner's outcome, not an event (RULES): a local card in the thread.
      postOwnerCard({
        title: created.invoice_number != null
          ? `${formatDocNumber('invoice', created.invoice_number)} is ready`
          : 'Your invoice is ready',
        invoiceId: created.id,
      });
      router.push(`/invoices/${created.id}`);
    } finally {
      convertingRef.current = false;
      setBusy(null);
    }
  }

  async function extend() {
    if (busy) return;
    setBusy('extend');
    setActionError(null);
    const next = extendValidity(inv.valid_until, new Date(), tz);
    try {
      const outcome = await requestEstimateExtend(id, next);
      if (!outcome.ok) {
        setActionError(outcome.message);
        return;
      }
      setInv((prev) => ({ ...prev, valid_until: outcome.validUntil }));
      showToast(`Valid until ${shortDate(outcome.validUntil) ?? 'the new date'}`);
    } finally {
      setBusy(null);
    }
  }

  // Runs inside the D7 sheet: a failure throws so the sheet shows its cause
  // ("The link still works.") and stays open for a retry. The sheet's own
  // synchronous ref blocks a second tap.
  async function revoke() {
    setBusy('revoke');
    setActionError(null);
    try {
      const outcome = await requestEstimateRevoke(id);
      if (!outcome.ok) throw new Error(outcome.message);
      setInv((prev) => ({ ...prev, revoked_at: outcome.revokedAt }));
      showToast('Link deactivated');
    } finally {
      setBusy(null);
    }
  }

  const pendingTitle = titleDraft.trim().slice(0, 120);
  const titleChanged = pendingTitle !== (inv.title ?? '');
  const itemsChanged = JSON.stringify(itemsDraft) !== JSON.stringify((inv.line_items ?? []) as LineItemRow[]);
  const dirty = editable && (titleChanged || itemsChanged);

  // One request, one UPDATE: the title and the line items (with recomputed
  // totals) land in the same statement, so the trigger bumps once.
  async function saveChanges() {
    if (!editable || !dirty || busy || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const outcome = await requestEstimateEdits(id, {
        title: titleChanged ? (pendingTitle || null) : undefined,
        lineItems: itemsChanged ? itemsDraft : undefined,
      });
      if (!outcome.ok) {
        setActionError(outcome.message);
        return;
      }
      const saved = outcome.estimate as Partial<EstimateDetailRow>;
      setInv((prev) => ({ ...prev, ...saved }));
      setTitleDraft((saved.title ?? '') as string);
      setItemsDraft((saved.line_items ?? []) as LineItemRow[]);
    } finally {
      setSaving(false);
    }
  }

  // Edits are staged, not written: the card's own Save changes sends them all
  // in one update. Totals stay live because they are recomputed from the draft.
  function stageLineItems(next: LineItemRow[]) {
    setItemsDraft(mergeLineItemEdits(itemsDraft, next));
  }

  const primaryButton =
    'flex min-h-touch w-full items-center justify-center gap-2 rounded-[16px] bg-primary-container px-4 py-3 text-[16px] font-bold text-on-background transition active:scale-[0.985] disabled:opacity-60';
  const tile =
    'flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-[14px] border border-outline-variant/40 bg-surface-container-lowest px-1 py-2 text-center text-[11px] font-semibold leading-tight text-on-surface-variant transition active:scale-[0.96] disabled:opacity-40 sm:text-[12px]';
  const quietAction =
    'flex min-h-[44px] items-center gap-1.5 px-1 text-[13px] font-semibold text-on-surface-variant underline decoration-outline-variant/60 decoration-dotted underline-offset-4 transition active:opacity-60 disabled:opacity-40';

  return (
    <div className="px-4 py-4">
      <PopSheet
        open={convertAsk && state === 'approved'}
        icon="autorenew"
        eyebrow="Signed estimate"
        title="Convert to an invoice?"
        sub={`This makes a real invoice you can send to ${inv.client_name || 'your client'}.`}
        figure={{
          label: `${estimateNumber(inv.invoice_number)} · ${inv.client_name || 'No client'}`,
          meta: 'Signed · ready to invoice',
          amount: money(totals.total),
        }}
        actions={[
          { label: convertActionLabel(money(totals.total)), kind: 'gold', go: true, busyLabel: 'Converting…' },
          { label: 'Cancel', kind: 'text', safe: true },
        ]}
        onDismiss={() => setConvertAsk(false)}
        // The sheet stays open while converting: a failure shows its cause here
        // with a retry, instead of closing and leaving a faint line below.
        onConfirm={async () => { await convertToInvoice(); }}
        consequence="Nothing was converted."
      />
      <PopSheet
        open={confirmRevoke && state === 'sent'}
        icon="link_off"
        iconTone="danger"
        destructive
        title="Deactivate this link?"
        sub={revokeLinkSub(clientFirst)}
        figure={{
          label: `${estimateNumber(inv.invoice_number)} · ${inv.client_name || 'No client'}`,
          meta: revokeLinkMeta(sentDateText),
          amount: money(totals.total),
        }}
        actions={[
          { label: 'Cancel', kind: 'text', safe: true },
          { label: 'Yes, deactivate', kind: 'danger', go: true, busyLabel: 'Deactivating…' },
        ]}
        onDismiss={() => setConfirmRevoke(false)}
        onConfirm={async () => { await revoke(); }}
        onSuccess={() => setConfirmRevoke(false)}
        retryLabel="Try again"
        consequence={REVOKE_LINK_CONSEQUENCE}
      />
      <div className="card relative mb-4 overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          <span className={`status-chip ${chip.className}`}>
            {chip.icon
              ? <Icon name={chip.icon} size={14} />
              : <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
            {chip.label}
          </span>
          <span className="text-right">
            <span className="block font-mono text-xs font-semibold tracking-wide text-on-surface-variant">
              {estimateNumber(inv.invoice_number)}
            </span>
            {validity && (
              <span className={`mt-0.5 block text-[12px] ${state === 'expired' ? 'font-semibold text-[#8A3B1E]' : 'text-on-surface-variant'}`}>
                {validity}
              </span>
            )}
          </span>
        </div>

        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            maxLength={120}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleCancelled.current) {
                titleCancelled.current = false;
                return;
              }
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
              if (e.key === 'Escape') {
                e.preventDefault();
                titleCancelled.current = true;
                setTitleDraft(inv.title ?? '');
                e.currentTarget.blur();
              }
            }}
            aria-label="Estimate title"
            className="mt-3 w-full rounded-md border border-primary/50 bg-surface-container-lowest px-2 py-1 font-display text-2xl font-bold text-on-background outline-none"
          />
        ) : (
          <button
            type="button"
            disabled={!editable}
            onClick={() => {
              setTitleDraft(inv.title ?? '');
              setEditingTitle(true);
            }}
            className="mt-3 flex w-full items-center gap-1.5 text-left disabled:pointer-events-none"
            aria-label={editable ? 'Edit estimate title' : undefined}
          >
            <span className="font-display text-2xl font-bold leading-tight text-on-background">{heading}</span>
            {editable && <Icon name="edit" size={15} className="shrink-0 text-on-surface-variant/70" />}
          </button>
        )}

        <div className="mt-0.5 text-sm text-on-surface-variant">
          Estimate · {inv.client_name || 'No client'} · {subtitle}
        </div>

        <div aria-hidden className="relative my-3.5 h-4">
          <span className="absolute left-0 top-0 h-4 w-4 -translate-x-1/2 rounded-full border border-outline-variant/30 bg-background" />
          <span className="absolute right-0 top-0 h-4 w-4 translate-x-1/2 rounded-full border border-outline-variant/30 bg-background" />
          <span className="absolute left-3 right-3 top-2 border-t border-dashed border-outline-variant" />
        </div>

        <div className="text-xs font-semibold text-on-surface-variant">Estimate total</div>
        <div className="mt-0.5 font-display text-4xl font-bold leading-none tracking-tight text-primary tabular-nums">
          {money(totals.total)}
        </div>

        {moment && (
          <div className="mt-4">
            <ChatNudgeCard
              className="w-full"
              icon="workspace_premium"
              eyebrow={moment.eyebrow}
              title={moment.title}
              body={moment.body}
              actions={[
                { label: moment.cta, variant: 'primary', onClick: () => setConvertAsk(true) },
                { label: 'Not now', variant: 'secondary', onClick: () => setMoment(null) },
                { label: 'Go Pro', variant: 'link', onClick: () => { setMoment(null); setPaywallFor('estimate'); } },
              ]}
            />
          </div>
        )}

        {/* Actions per state (design §3.2). */}
        <div className="mt-4">
          {state === 'draft' && (
            <button type="button" className={primaryButton} disabled={busy !== null} onClick={() => void send()}>
              <Icon name="send" size={18} />
              {busy === 'send' ? 'Sending…' : 'Send estimate'}
            </button>
          )}

          {state === 'approved' && (
            <button type="button" className={primaryButton} disabled={busy !== null} onClick={() => setConvertAsk(true)}>
              <Icon name="autorenew" size={18} />
              {busy === 'convert' ? 'Converting…' : 'Convert to Invoice'}
            </button>
          )}

          {(state === 'draft' || state === 'sent' || state === 'expired') && (
            <>
              <div className={`grid grid-cols-2 gap-2${state === 'draft' ? ' mt-2' : ''}`}>
                <button type="button" className={tile} onClick={() => void copyLink()} disabled={!publicUrl || state === 'draft'}>
                  <Icon name="link" size={20} /> Copy link
                </button>
                <button type="button" className={tile} onClick={() => void shareLink()} disabled={!publicUrl || state === 'draft'}>
                  <Icon name="share" size={20} /> Share
                </button>
              </div>
              {state === 'draft' && (
                <p className="mt-1.5 text-center text-xs text-on-surface-variant">The link goes live when you send.</p>
              )}
            </>
          )}

          {state === 'approved' && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button type="button" className={tile} onClick={() => void copyLink()} disabled={!publicUrl}>
                <Icon name="link" size={20} /> Copy link
              </button>
              <button type="button" className={tile} onClick={() => void shareLink()} disabled={!publicUrl}>
                <Icon name="share" size={20} /> Share
              </button>
              <button type="button" className={tile} disabled={busy !== null} onClick={() => void openPreview()}>
                <Icon name="visibility" size={20} /> Preview as client
              </button>
            </div>
          )}

          {(state === 'draft' || state === 'sent' || state === 'expired') && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4">
              <button type="button" className={quietAction} disabled={busy !== null} onClick={() => void openPreview()}>
                <Icon name="visibility" size={16} /> Preview as client
              </button>
              {linked && (
                <button type="button" className={quietAction} disabled={busy !== null} onClick={() => void extend()}>
                  <Icon name="schedule" size={16} /> {busy === 'extend' ? 'Extending…' : 'Extend validity'}
                </button>
              )}
              {state === 'sent' && !confirmRevoke && (
                <button type="button" className={quietAction} onClick={() => setConfirmRevoke(true)}>
                  <Icon name="link_off" size={16} /> Deactivate link
                </button>
              )}
            </div>
          )}

          {state === 'converted' && convertedToId && (
            <button
              type="button"
              onClick={() => router.push(`/invoices/${convertedToId}`)}
              className="flex min-h-touch w-full items-center justify-center gap-2 rounded-[16px] border border-paid/40 bg-paid-container px-4 py-3 text-[15px] font-bold text-paid"
            >
              <Icon name="check_circle" size={18} /> Converted to an invoice
            </button>
          )}

          {state === 'revoked' && (
            <p className="flex items-center gap-2 rounded-[14px] bg-surface-container px-3 py-2.5 text-[13px] font-semibold text-on-surface-variant">
              <Icon name="link_off" size={18} /> This estimate link is closed.
            </p>
          )}
        </div>

        {actionError && <div className="mt-2 text-xs font-semibold text-error">{actionError}</div>}
      </div>

      {state === 'approved' && (
        <div className="card mb-4">
          <div className="mb-3 flex items-center gap-1.5 text-label-lg font-semibold uppercase tracking-wide text-paid">
            <Icon name="verified" size={16} /> Signed
          </div>
          <div className="mb-3 overflow-hidden rounded-[14px] border border-outline-variant/40 bg-[#FFFDF8]">
            {signature?.signature_type === 'draw' && signature.signature_data ? (
              // A stored PNG data URL from sign_estimate.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signature.signature_data} alt="Signature" className="h-[124px] w-full object-contain p-3" />
            ) : (
              <div className="flex h-[124px] items-end px-4 pb-3">
                <span className="font-display text-3xl font-semibold italic text-on-background">
                  {signature?.signature_type === 'type' ? signature.signature_data : '—'}
                </span>
              </div>
            )}
          </div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-on-surface-variant">Signer</dt>
              <dd className="text-right font-semibold text-on-surface">{signature?.signer_name ?? '—'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-on-surface-variant">Signed</dt>
              <dd className="text-right font-semibold text-on-surface">
                {signature ? signedStamp(signature.signed_at, tz) : inv.approved_at ? signedStamp(inv.approved_at, tz) : '—'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-on-surface-variant">Method</dt>
              <dd className="text-right font-semibold text-on-surface">
                {signature ? signedMethodLabel(signature.signature_type) : '—'}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="card mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
            Line items
          </span>
          {editable && <span className="text-xs text-on-surface-variant/70">Tap a value to edit</span>}
        </div>

        {(state === 'approved' || state === 'converted') && (
          <div className="mb-3 flex items-center gap-2 rounded-[14px] bg-surface-container px-3 py-2.5">
            <Icon name="lock" size={16} className="shrink-0 text-on-surface-variant" />
            <span className="min-w-0 flex-1 text-[13px] font-semibold text-on-surface-variant">
              {state === 'approved'
                ? 'This estimate is signed and locked.'
                : 'This estimate was converted, so it is locked.'}
            </span>
          </div>
        )}

        <LineItemsEditor
          items={itemsDraft}
          editable={editable}
          onChange={stageLineItems}
        />

        <div className="mt-3 space-y-1 border-t border-outline-variant/30 pt-3 text-sm">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span>Subtotal</span>
            <span className="tabular-nums text-on-surface">{money(totals.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-on-surface-variant">
            <span>Tax ({taxRate}%)</span>
            <span className="tabular-nums text-on-surface">{money(totals.taxAmount)}</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="font-semibold text-on-surface">Total</span>
            <span className="font-display text-lg font-bold tabular-nums text-on-surface">{money(totals.total)}</span>
          </div>
        </div>
      </div>

      {editable && dirty && (
        <button
          type="button"
          onClick={() => void saveChanges()}
          disabled={saving}
          className={`${primaryButton} mb-4`}
        >
          <Icon name="check" size={18} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
      )}

      <EstimateAttachments estimateId={id} userId={inv.user_id} editable={editable} />

      {toast && (
        <div
          role="status"
          data-kb-lift=""
          className="fixed bottom-24 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-card bg-inverse-surface px-4 py-3 text-body-md text-inverse-on-surface shadow-card-raised"
        >
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}

      {paywallFor && <PaywallModal variant={paywallFor} returnTo="invoices" onClose={() => setPaywallFor(null)} />}

      {previewOpen && preview && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[80] flex items-end md:items-center md:p-6 justify-center" data-no-tab-swipe="true">
          <div className="absolute inset-0 bg-on-background/40" onClick={() => setPreviewOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Client preview"
            style={{ maxHeight: '88dvh' } as CSSProperties}
            className="onit-sheet-in relative w-full max-w-lg overflow-y-auto rounded-t-card md:rounded-card bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card-raised"
          >
            <div className="flex items-start gap-3 pb-1 pt-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl font-bold text-on-background">Client preview</h2>
                <p className="mt-0.5 text-[13px] text-on-surface-variant">This is exactly what your client sees.</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close preview"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-container text-on-surface-variant transition active:scale-95"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="mt-2 rounded-[14px] bg-[#1E1A15] px-3 py-2 text-[12px] font-semibold text-[#FDF8F0]">
              <span className="flex items-center gap-1.5"><Icon name="visibility" size={15} /> Preview — this is what your client sees</span>
            </div>

            <div className="mt-3 rounded-card border border-outline-variant/40 bg-[#FAF3E6] p-4">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-[#6B6256]">
                {preview.business.name || 'Your business'}
              </div>
              <div className="mt-1 font-display text-lg font-bold text-[#1E1A15]">
                Estimate {estimateNumber(preview.invoiceNumber)}
              </div>
              <div className="mt-2 text-sm text-[#4A4236]">
                Prepared for <span className="font-semibold text-[#1E1A15]">{preview.clientName || inv.client_name}</span>
              </div>
              {preview.title && <div className="text-sm text-[#4A4236]">{preview.title}</div>}
              <div className="mt-3 border-t border-dashed border-[#D9C9A8] pt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6256]">Estimate total</div>
                <div className="font-display text-3xl font-bold tabular-nums text-[#1E1A15]">{money(preview.total)}</div>
                <div className="text-[13px] text-[#6B6256]">
                  {preview.lineItems.length} {preview.lineItems.length === 1 ? 'item' : 'items'} · includes {money(preview.taxAmount)} tax
                </div>
              </div>
              {preview.validUntil && (
                <div className="mt-2 text-[13px] text-[#6B6256]">
                  {preview.state === 'expired'
                    ? `Expired ${shortDate(preview.validUntil)}`
                    : `Valid until ${shortDate(preview.validUntil)}`}
                </div>
              )}
              {preview.attachments.length > 0 && (
                <div className="mt-1 text-[13px] text-[#6B6256]">
                  Includes {preview.attachments.length} {preview.attachments.length === 1 ? 'attachment' : 'attachments'}
                </div>
              )}
            </div>

            <p className="mt-3 text-center text-[12px] text-on-surface-variant">Signing is turned off in preview.</p>

            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="mt-3 flex min-h-touch w-full items-center justify-center rounded-[16px] bg-primary-container px-4 py-3 text-[16px] font-bold text-on-background"
            >
              Close preview
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
