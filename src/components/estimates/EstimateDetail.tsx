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
  convertActionLabel, REVOKE_CONFLICT, REVOKE_LINK_CONSEQUENCE, revokeLinkMeta, revokeLinkSub,
} from '@/lib/popups/destructive';
import { PopupCauseError } from '@/lib/popups/failure';
import { CLIPBOARD_BLOCKED_TEXT } from '@/lib/popups/decision';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { badgeVersion, changeCount, changeLabel, editingLine, sameLinkNote, savedLine } from '@/lib/estimates/edit-view';
import '@/components/alive/alive.css';
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
  /** 4A: +1 on each content save once sent. Drafts stay at 1 and show no badge. */
  estimate_version?: number | null;
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

// Design 06 chips: bg / ink per state. Signed is green, Sent is the gold dot chip.
const CHIP_TINT: Record<OwnerEstimateState, { bg: string; fg: string }> = {
  draft: { bg: 'var(--al-neutral-bg)', fg: 'var(--al-ink2)' },
  sent: { bg: 'var(--al-gold-soft)', fg: 'var(--al-gold-text)' },
  expired: { bg: '#f1ece4', fg: '#9a9083' },
  approved: { bg: 'var(--al-green-bg)', fg: 'var(--al-green)' },
  converted: { bg: 'var(--al-neutral-bg)', fg: 'var(--al-ink2)' },
  revoked: { bg: 'var(--al-neutral-bg)', fg: 'var(--al-ink2)' },
  unavailable: { bg: 'var(--al-neutral-bg)', fg: 'var(--al-ink2)' },
};

const CHIP: Record<OwnerEstimateState, { label: string; icon: 'edit' | 'verified' | 'schedule' | 'lock' | 'link_off' | 'swap_horiz' | null; className: string }> = {
  draft: { label: 'Draft', icon: 'edit', className: 'bg-draft-container text-draft' },
  sent: { label: 'Sent', icon: null, className: 'bg-sent-container text-sent' },
  expired: { label: 'Expired', icon: 'schedule', className: 'bg-[#F4E2D8] text-[#8A3B1E]' },
  approved: { label: 'Signed', icon: 'verified', className: 'bg-paid-container text-paid' },
  converted: { label: 'Converted', icon: 'swap_horiz', className: 'bg-surface-container text-on-surface-variant' },
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
  // 6.2: right after a save the card says "Saved as vN" and offers Tell <name>.
  const [savedPrompt, setSavedPrompt] = useState<number | null>(null);
  // 6.4: Revise on the chat card lands here already in edit mode (?edit=1),
  // sliding in from the right in 320ms.
  const [slideIn, setSlideIn] = useState(false);
  const lineItemsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('edit') !== '1') return;
    setSlideIn(true);
    const t = window.setTimeout(() => {
      lineItemsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setSlideIn(false);
    }, 340);
    return () => window.clearTimeout(t);
  }, []);
  const [prevOpen, setPrevOpen] = useState(false);
  const [prevRow, setPrevRow] = useState<{ version: number; total: number | null; items: LineItemRow[]; title: string | null } | 'missing' | null>(null);

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
      if (!outcome.ok) {
        // A 409 means the estimate is signed or converted: nothing broke, and
        // a retry cannot work, so the sheet names the state, not a fault.
        if (outcome.conflict) throw new PopupCauseError(REVOKE_CONFLICT);
        throw new Error(outcome.message);
      }
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
      if (state !== 'draft') setSavedPrompt(Number(saved.estimate_version ?? 1));
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    setItemsDraft((inv.line_items ?? []) as LineItemRow[]);
    setTitleDraft(inv.title ?? '');
    setActionError(null);
  }

  // 6.x "Previous version": the newest snapshot below the current number, read
  // only. RLS scopes it to the owner.
  async function openPreviousVersion() {
    setPrevOpen(true);
    if (prevRow) return;
    const current = Number(inv.estimate_version ?? 1);
    const { data } = await supabase
      .from('estimate_versions')
      .select('version, total, content')
      .eq('estimate_id', id)
      .lt('version', current)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) { setPrevRow('missing'); return; }
    const content = (data.content ?? {}) as { line_items?: LineItemRow[]; title?: string | null };
    setPrevRow({
      version: Number(data.version),
      total: data.total == null ? null : Number(data.total),
      items: (content.line_items ?? []) as LineItemRow[],
      title: content.title ?? null,
    });
  }

  // Edits are staged, not written: the card's own Save changes sends them all
  // in one update. Totals stay live because they are recomputed from the draft.
  function stageLineItems(next: LineItemRow[]) {
    setItemsDraft(mergeLineItemEdits(itemsDraft, next));
  }

  const badge = badgeVersion(state !== 'draft', Number(inv.estimate_version ?? 1), dirty);
  const savedTotal = calculateInvoiceTotals((inv.line_items ?? []) as LineItemRow[], Number(inv.tax_rate ?? 0)).total;
  const changes = changeCount((inv.line_items ?? []) as LineItemRow[], itemsDraft, titleChanged);
  const editLine = editingLine(Number(inv.estimate_version ?? 1), dirty, sentDateText);
  const note = sameLinkNote(clientFirst || null);

  const primaryButton =
    'flex min-h-touch w-full items-center justify-center gap-2 rounded-[16px] bg-primary-container px-4 py-3 text-[16px] font-bold text-on-background transition active:scale-[0.985] disabled:opacity-60';
  const tile =
    'flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-[14px] border border-[#e6dac6] bg-white px-1 py-1.5 text-center text-[13.5px] font-semibold leading-tight text-[#2a251f] transition active:scale-[0.97] active:bg-[#f6eedf] disabled:opacity-40';
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
      <div
        className="al-card relative mb-4 overflow-hidden"
        style={{ padding: 18, animation: slideIn ? 'al-slide-in-right .32s cubic-bezier(.2,.8,.2,1) both' : undefined }}
      >
        <div className="flex items-start justify-between gap-2">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {savedPrompt != null ? (
              <span className="al-chip" style={{ background: 'var(--al-gold-soft)', color: 'var(--al-gold-text)' }}>
                <Icon name="refresh" size={14} />Updated
              </span>
            ) : (
              <span className="al-chip" style={{ background: CHIP_TINT[state].bg, color: CHIP_TINT[state].fg }}>
                {chip.icon
                  ? <Icon name={chip.icon} size={14} />
                  : <span aria-hidden>●</span>}
                {chip.label}
              </span>
            )}
            {badge != null && (
              <span
                key={badge}
                className="al-anim"
                style={{
                  height: 22, padding: '0 7px', borderRadius: 6, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center',
                  fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
                  background: badge >= 2 ? 'var(--al-ink)' : 'var(--al-neutral-bg)', color: badge >= 2 ? '#f4ecdd' : 'var(--al-ink)',
                  animation: savedPrompt != null ? 'al-badge-once .18s ease-out both' : undefined,
                }}
              >
                v{badge}
              </span>
            )}
          </div>
          <span className="text-right">
            <span className="block" style={{ fontFamily: 'var(--font-plex-mono), ui-monospace, monospace', fontSize: 14, fontWeight: 700 }}>
              {estimateNumber(inv.invoice_number)}
            </span>
            {validity && (
              <span className="block" style={{ fontSize: 13, color: state === 'expired' ? '#8a3b1e' : 'var(--al-mute)' }}>
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
            <span className="al-h" style={{ fontSize: 28, lineHeight: 1.15 }}>{heading}</span>
            {editable && <Icon name="edit" size={16} className="shrink-0 text-[#8a7f70]" />}
          </button>
        )}

        <div style={{ fontSize: 14, color: 'var(--al-mute)' }}>
          Estimate · {inv.client_name || 'No client'} · {subtitle}
        </div>

        <div aria-hidden style={{ borderTop: '1.5px dashed var(--al-rule)', margin: '14px 0 12px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ font: '600 13.5px var(--font-inter), system-ui', color: 'var(--al-ink2)' }}>Estimate total</div>
            <div className="al-h tabular-nums" style={{ fontSize: 34, color: 'var(--al-gold-num)', lineHeight: 1.1 }}>
              {money(totals.total)}
            </div>
          </div>
          {dirty && savedTotal !== totals.total && (
            <div style={{ fontSize: 12.5, color: 'var(--al-meta)', textDecoration: 'line-through', paddingBottom: 6 }}>{money(savedTotal)}</div>
          )}
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
                  <Icon name="link" size={18} /> Copy link
                </button>
                <button type="button" className={tile} onClick={() => void shareLink()} disabled={!publicUrl || state === 'draft'}>
                  <Icon name="ios_share" size={18} /> Share
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
                <Icon name="link" size={18} /> Copy link
              </button>
              <button type="button" className={tile} onClick={() => void shareLink()} disabled={!publicUrl}>
                <Icon name="ios_share" size={18} /> Share
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

        {/* Design 06: the reassurance sits right under Copy link / Share, where the
            worry about the link comes up. */}
        {(state === 'sent' || state === 'expired') && (
          <div style={{ marginTop: 10, background: 'var(--al-gold-soft)', borderRadius: 14, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--al-gold-text)', marginTop: 1, display: 'inline-flex' }}><Icon name="link" size={18} /></span>
            <div style={{ fontSize: 13, lineHeight: 1.4, color: '#3a342c' }}><b>{note.lead}</b> {note.rest}</div>
          </div>
        )}

        {savedPrompt != null && (
          <div className="al-fade-up">
            <div style={{ marginTop: 12, background: '#fff', border: '1px solid var(--al-ctl-line)', borderRadius: 14, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--al-gold)', display: 'grid', placeItems: 'center', flex: 'none' }}>
                <Icon name="check" size={15} />
              </div>
              <div style={{ flex: 1, fontSize: 13, lineHeight: 1.35 }}>{savedLine(savedPrompt, clientFirst || null)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {/* Reuses the estimate's Share action: no new reminder action. */}
              <button type="button" className="al-btn-g" style={{ height: 38, fontSize: 13.5, flex: 1 }} onClick={() => { void shareLink(); setSavedPrompt(null); }}>
                {clientFirst ? `Tell ${clientFirst}` : 'Tell them'}
              </button>
              <button type="button" className="al-btn-w" style={{ height: 38, fontSize: 13.5 }} onClick={() => setSavedPrompt(null)}>Not now</button>
            </div>
          </div>
        )}

        {(editLine || Number(inv.estimate_version ?? 1) >= 2) && state !== 'draft' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 13 }}>
            <span style={{ color: 'var(--al-mute)' }}>{editLine ?? `v${Number(inv.estimate_version ?? 1)}`}</span>
            {Number(inv.estimate_version ?? 1) >= 2 && (
              <button
                type="button"
                onClick={() => void openPreviousVersion()}
                style={{ display: 'flex', gap: 4, alignItems: 'center', fontWeight: 600, color: 'var(--al-ink2)', borderBottom: '1px dotted var(--al-faint)', background: 'none', borderTop: 0, borderLeft: 0, borderRight: 0, padding: 0, cursor: 'pointer', font: 'inherit' }}
              >
                <Icon name="history" size={16} />Previous version
              </button>
            )}
          </div>
        )}

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

      <div ref={lineItemsRef} className="al-card mb-4" style={{ padding: '16px 14px' }}>
        <div className="flex items-center justify-between" style={{ padding: '0 4px 10px' }}>
          <span className="al-meta" style={{ color: 'var(--al-ink2)' }}>
            Line items
          </span>
          {editable && <span style={{ fontSize: 12.5, color: '#7a7166' }}>Tap a value to edit</span>}
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
        // Design 06: slides up in 220ms on the first change. "1 change", the
        // total moving, Discard, and the gold Save changes.
        <div
          className="sticky bottom-0 z-10 -mx-4 mb-4"
          style={{
            padding: '10px 14px', background: 'var(--al-cream)', borderTop: '1px solid #e8dcc8',
            display: 'flex', gap: 10, alignItems: 'center', boxShadow: '0 -10px 24px -14px rgba(60,40,0,.25)',
            animation: 'al-save-bar-up 220ms cubic-bezier(.2,.8,.2,1) both',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ font: '700 14px var(--font-inter), system-ui' }}>{changeLabel(changes)}</div>
            <div style={{ fontSize: 12, color: 'var(--al-mute)' }}>
              {savedTotal !== totals.total ? `Total ${money(savedTotal)} → ${money(totals.total)}` : `Total ${money(totals.total)}`}
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={discardChanges}
            style={{ font: '600 14px var(--font-inter), system-ui', color: 'var(--al-ink2)', padding: '0 6px', background: 'none', border: 0, cursor: 'pointer', minHeight: 44 }}
          >
            Discard
          </button>
          <button type="button" className="al-btn-g" disabled={saving} aria-busy={saving || undefined} onClick={() => void saveChanges()}>
            {saving ? (<><span className="al-spinner" />Saving…</>) : 'Save changes'}
          </button>
        </div>
      )}

      <EstimateAttachments estimateId={id} userId={inv.user_id} editable={editable} clientFirstName={clientFirst} clientMayHaveSeen={state !== 'draft'} />

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

      {prevOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[80] flex flex-col" style={{ background: 'var(--al-cream)' }} data-no-tab-swipe="true">
          {/* Design 06: ink banner, "Viewing v1 · Nov 7" and Back to v2. */}
          <div style={{ background: 'var(--al-ink)', color: '#f4ecdd', padding: '9px 16px', font: '600 13px var(--font-inter), system-ui', display: 'flex', justifyContent: 'space-between', paddingTop: 'max(9px, env(safe-area-inset-top))' }}>
            <span>
              Viewing {prevRow && prevRow !== 'missing' ? `v${prevRow.version}` : 'the previous version'}{sentDateText ? ` · ${sentDateText}` : ''}
            </span>
            <button type="button" onClick={() => setPrevOpen(false)} style={{ color: '#e2c25a', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}>
              Back to v{Number(inv.estimate_version ?? 1)}
            </button>
          </div>
          <div style={{ padding: '14px 16px', overflowY: 'auto' }}>
            {prevRow === null && <div style={{ color: 'var(--al-mute)', fontSize: 14 }}>Loading…</div>}
            {prevRow === 'missing' && <div style={{ color: 'var(--al-mute)', fontSize: 14 }}>Couldn’t find an earlier version.</div>}
            {prevRow && prevRow !== 'missing' && (
              <div className="al-card" style={{ padding: 18, opacity: 0.85 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="al-chip" style={{ background: 'var(--al-neutral-bg)', color: 'var(--al-ink2)' }}>v{prevRow.version}</span>
                  <span style={{ color: 'var(--al-meta)', display: 'inline-flex' }}><Icon name="lock" size={16} /></span>
                </div>
                <div className="al-h" style={{ fontSize: 26, marginTop: 12 }}>{prevRow.title?.trim() || inv.client_name || 'Estimate'}</div>
                <div className="al-h" style={{ fontSize: 30, color: 'var(--al-gold-num)', marginTop: 6 }}>
                  {money(prevRow.total ?? calculateInvoiceTotals(prevRow.items, Number(inv.tax_rate ?? 0)).total)}
                </div>
                <div style={{ marginTop: 12 }}>
                  {prevRow.items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid var(--al-hair)', fontSize: 14 }}>
                      <span>{it.description}</span>
                      <b className="tabular-nums">{money(Number(it.qty) * Number(it.unit_price))}</b>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

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
