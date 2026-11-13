'use client';
/* ═══ The core loop ═══
   Speak or type a job → "On it!" → follow-up questions →
   invoice preview card → PDF → native share sheet → follow-up engine.
   Works for guests (5 free parses), saves for signed-in users.
   Text mode is silent. The gold circle is a "+": Mic starts a voice session
   (the circle is then the mic/stop button until the session ends).  */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Icon from '@/components/Icon';
import ChatNudgeCard from '@/components/ChatNudgeCard';
import EventCard, { AssistantAvatar, AssistantLine } from '@/components/chat/EventCard';
import ReadyEstimateCard from '@/components/chat/ReadyEstimateCard';
import RecapChatCard from '@/components/chat/RecapChatCard';
import { loadRecapRows } from '@/components/chat/recap-load';
import { buildRecap, isEmptyRecap, matchRecap, type RecapModel } from '@/lib/chat-recap';
import { decideAutoRecap, parseRecapState, recapStateAfterOpen, recapStateKey, type RecapState } from '@/lib/recap-schedule';
import { useChatEventFeed } from '@/components/chat/useChatEventFeed';
import { runConvert } from '@/components/alive/useConvert';
import EstimateLinkActions from '@/components/estimates/EstimateLinkActions';
import AssistantMark from '@/components/chat/AssistantMark';
import StreamText from '@/components/chat/StreamText';
import { estimateLink, requestEstimateSend } from '@/lib/estimates/owner-actions';
import ChatRestoreSkeleton from '@/components/ChatRestoreSkeleton';
import { holdSplash } from '@/lib/splash-gate';
import { createClient } from '@/lib/supabase/client';
import { shouldOfferTermsPrompt } from '@/lib/terms-prompt';
import { pickTip, type Tip } from '@/lib/tip-arbiter';
import { buildTheme, explicitColorRoles, BrandTheme } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey, InvoiceRenderData } from '@/lib/pdf/templates';
import { elementToPdf, invoiceFilename, downloadFile } from '@/lib/pdf/generate';
import { sharePdf, shareText, type ShareResult } from '@/lib/pdf/share';
import { docNoun, formatDocNumber } from '@/lib/documents';
import { clearFailures, upsertFailure } from '@/lib/chat/failures';
import { chatKey, historyKey, storageNamespace, dropLegacyChatStorage, adoptGuestChat } from '@/lib/chat-storage';
import { getPushSubscription, subscribeToPush, pushAvailability } from '@/lib/push';
import { PROMPT_MIN_DOCS, afterDismiss, afterShown, parsePromptState, shouldAskForFeedback } from '@/lib/feedback';
import { FEEDBACK_REPLY, isFeedbackIntent } from '@/lib/feedback-intent';
import { defaultDueDate, formatDate } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import { isGuest, signedOutGate } from '@/lib/chat-signed-out';
import { afterSignIn, classifySignInFailure, replayDecision, signInFailureMessage, type AskSource } from '@/lib/signed-out-replay';
import { claimPending, clearPending, readPending, writePending } from '@/lib/signed-out-storage';
import SignInChatButton from '@/components/chat/SignInChatButton';
import PaywallModal, { type PaywallVariant } from '@/components/PaywallModal';
import { PAYWALL_ENABLED } from '@/lib/paywall';
import { noteUpgradeReturn, recentlyUpgraded, subscribeAccess, waitForAccess } from '@/lib/upgrade-return';
import { fetchUsageLine, fetchUsageSnapshot, usageLine } from '@/lib/usage';
import { markSeen, promptDue, usageNudge as usageNudgeFor, type SoftPrompt } from '@/lib/soft-prompts';
import DepositValueInput from '@/components/DepositValueInput';
import { speak, primeSpeech } from '@/lib/tts';
import { newTurnId, traceTurn, redactText, namesDocType, redactPresence } from '@/lib/trace';
import { prepareReceipt, ReceiptError, type PreparedReceipt } from '@/lib/receipt';
import ExpenseCard from '@/components/ExpenseCard';
import ReceiptBubble from '@/components/ReceiptBubble';
import LoggedExpenseCard, { type LoggedExpense } from '@/components/LoggedExpenseCard';
import LineItemsEditor from '@/components/LineItemsEditor';
import { LedgerFrame, LedgerTotals, LedgerUsageMeter, SentLedgerRow } from '@/components/chat/LedgerCard';
import { morphSharedNodes } from '@/lib/morph-shared';
import AttachmentsEditor, { type EditorAttachment } from '@/components/AttachmentsEditor';
import {
  ATTACHMENT_BUCKET, deleteAttachment, listAttachmentRows, loadAttachmentCopies,
  materializeAttachments, renumberAttachments, signedAttachmentUrl, toPdfAttachments,
} from '@/lib/attachments-client';
import { materializeEstimateAttachments } from '@/lib/estimates/attachments-client';
import OnItSpinner from '@/components/OnItSpinner';
import CountUpMoney from '@/components/CountUpMoney';
import MicRings from '@/components/MicRings';
import TemplateCard from '@/components/template/TemplateCard';
import PopToast from '@/components/popups/PopToast';
import {
  unsentShareCopy, forgetUnsentShare, rememberUnsentShare, restoreUnsentShare,
  type UnsentShare, type UnsentShareRow,
} from '@/lib/popups/unsent-share';
import type { TemplateClient, TemplateKind } from '@/lib/template';
import { clearTemplate, loadTemplate, clearTemplateRow, loadTemplateRow, saveTemplateRow, unfinishedTitle, type StoredTemplate } from '@/lib/template-store';
import { escapeLike, templateSummary } from '@/lib/template-send';
import SavePromptCard, { type PromptSaveResult } from '@/components/SavePromptCard';
import PaymentCard, { UnattachedPaymentCard } from '@/components/chat/PaymentCard';
import { callUnattached } from '@/lib/unattached-client';
import { UNATTACHED_PAYMENT_TITLE, unattachedPaymentKey } from '@/lib/unattached-payment';
import PaymentProposalCard, { type PaymentProposal, type PickerData, type ProposalInvoice } from '@/components/chat/PaymentProposalCard';
import { normalizeSummary } from '@/lib/clients';
import { openPaymentCardTarget, paymentCardLoadError } from '@/lib/payment-card-picker';
import { buildPayCard, type PayCard } from '@/lib/payment-card';
import { looksLikePayment, parseAmount, parseMethod, parsePaidOn, resolvePayment } from '@/lib/payment-intent';
import { localDateString, localDateToIso, type PaymentMethod } from '@/lib/record-payment';
import { newPaymentKey, recordPaymentOnce } from '@/lib/payment-idempotency';
import { ledgerFrom } from '@/lib/payment-ledger-client';
import { enqueuePayment, paymentQueueStore } from '@/lib/payment-queue';
import { markNewEntry } from '@/lib/list-motion';
import { clientPrompt, enqueue, productPrompts, recurringPrompt, savedLine, type SavePrompt } from '@/lib/save-prompts';
import { anchorFor, localToday } from '@/lib/recurring';
import ComposerMenu, { MENU_CLOSE_MS, type ComposerPick } from '@/components/ComposerMenu';
import { clientNameKey } from '@/lib/client-name';
import { clientQuestionPending, matchOrCreateClient, updateClientContact, type ClientRecord } from '@/lib/services/clients';
import { calculateInvoiceTotals, money, type DepositType, type FinancialLineItem } from '@/lib/financials';
import PopSheet from '@/components/popups/PopSheet';
import PopInline from '@/components/popups/PopInline';
import { failedBubbleTitle, unsupportedReplyExtras, visibleChips } from '@/lib/popups/ai';
import { SHARE_NOT_OPENED_TEXT, UNREADABLE_PRICES_TEXT, signInCard, type SignInKind } from '@/lib/popups/status';
import { templateHasContent } from '@/lib/popups/destructive';
import {
  ALERTS_FAILED_TEXT, ALERTS_SETTINGS_HREF, MIC_STILL_BLOCKED, changeGuardCopy, changeGuardRows,
  clientChoiceCopy, isMicPermissionError, micBlockedCard, replaceTemplateCopy, reviseSheetCopy,
  unfinishedFigure, type MicBlocked,
} from '@/lib/popups/decision';
import { chatStartedAtFrom, eventContextLine, splitEventsByMessage, type EventAction, type EventRow } from '@/lib/events';
import CommandCard from '@/components/chat/CommandCard';
import { COMMAND_GROUPS, COMMAND_HINT, COMMAND_LEAD, isRecordPaymentChip, matchCommand, pickStarterChips, prefillFor } from '@/lib/chat-commands';
import { OWNER_CARD_EVENT, drainOwnerCards, type OwnerCard } from '@/lib/owner-cards';
import { CATEGORY_LABEL, isExpenseCategory, type ExpenseDraft } from '@/lib/expenses';
import type { ExtractResult, LineItem } from '@/lib/ai';
import { cardAvailableFor, fetchConnectEnabled } from '@/lib/connect-client';
import { getSharedUser } from '@/lib/auth-client';
import { AI_TOOLS, IN_APP_CAMERA } from '@/lib/feature-flags';
import { askQuestion } from '@/lib/ask-client';
import { bypassReason, decideRoute, looksLikeAnswer } from '@/lib/router/decide';
import { classifyTurn } from '@/lib/router/route-client';
import TemplateReply from '@/components/chat/templates/TemplateReply';
import type { ChatTemplateHandlers } from '@/components/chat/templates/ChatTemplate';
import { resolveTemplate } from '@/components/chat/templates/render-model';
import { UNSUPPORTED_REPLY } from '@/lib/tools/reply';

// The in-app receipt camera, behind NEXT_PUBLIC_IN_APP_CAMERA and loaded
// lazily: a flag-off build never asks for its chunk, so the composer keeps
// today's OS photo input and nothing extra is downloaded.
const ReceiptCameraScreen = IN_APP_CAMERA
  ? dynamic(() => import('@/components/camera/ReceiptCamera'), { ssr: false })
  : null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A failed assistant message carries what it takes to re-run the operation in
// place: the op, plus (for send) the user text to resend. finalize needs no
// payload — it re-reads draft/convoId from state, reusing the same finalize_key.
type Failure = { op: 'send'; text: string } | { op: 'finalize' };
interface Msg {
  /** When this message happened (epoch ms). Saved before this field existed
   *  means no timestamp, and no timestamp means nothing can be placed around
   *  it — an old thread reads exactly as it did. */
  at?: number;
  /** An owner outcome (RULES): a local assistant card, never an event and never
   *  a toast. Posted by the screen that finished the action. */
  ownerCard?: { title: string; invoiceId: string };
  /** Item 11: the "What I can do" card — a local assistant message, never an
   *  event and never anything /api/parse sees. */
  commandCard?: true;
  /** A daily or weekly recap (alive layer 07): a local assistant card built from
   *  the owner's own rows, never an event and never anything /api/parse sees. */
  recapCard?: RecapModel;
  /** AI Smart answer card (flag on only): the template id and props exactly as
   *  /api/ask sent them. Re-checked against lib/templates/props.ts on every render,
   *  so a stored card that no longer fits shows `fallbackText` instead. */
  template?: { id: string; props: unknown };
  /** The server's plain-text answer for the card above; shown when it cannot draw. */
  fallbackText?: string;
  /** Where the answer's full list lives (an in-app path the server declared). */
  destination?: { screen: string; path: string };
  /** Posted by the open-time dice, not asked for: never saved with the thread. */
  auto?: true;
  id: string; role: 'user' | 'assistant'; content: string; source?: 'voice' | 'typed'; failed?: Failure; action?: 'new-chat';
  /** Answer to "I have feedback": the bubble plus a button to Tell us about On It. */
  feedbackLink?: true;
  /** Signed-out answer: the bubble plus a Sign in button (lib/chat-signed-out.ts). */
  signInLink?: true;
  /** The guest question this prompt answered; the Sign in tap remembers the last one. */
  question?: string;
  /** Suggestion chips under an answer (A1): each sends that text as a question. */
  chips?: string[];
  /** Never sent to /api/parse as history or carried into a new chat (feedback talk is not job context). */
  skipHistory?: true;
  // A quiet status line (free-tier usage): secondary small text, no bubble,
  // and never sent to /api/parse as conversation history.
  quiet?: boolean;
  /** A receipt photo bubble: a small JPEG data URL. '' = a bubble whose image
   *  wasn't kept in storage (see forStorage) — it restores as a placeholder. */
  receipt?: string;
  /** A saved expense, shown as the compact logged card (content keeps the text
   *  confirmation for the model's context). Its thumbnail is the photo
   *  bubble's image, referenced by id — never a second copy. */
  logged?: Omit<LoggedExpense, 'thumb'> & { receiptMsgId?: string | null; viaTemplate?: true };
  /** Sent invoice summary card — rendered as a mini invoice chip after finalize. */
  sentCard?: { clientName: string; invoiceNo: string; amount: string; dueDate: string; kind: 'invoice' | 'quote' };
  /** Payouts nudge — shown after a sent invoice when no payment processor is connected. */
  payoutsNudge?: true;
  /** An owner-initiated payment moment (alive layer §04). Optional, so every
   *  entry written before this field existed still loads; no version bump. */
  payCard?: PayCard;
  /** A payment saved with no invoice behind it (POST /api/income/unattached). */
  unattachedCard?: { id: string; title: string; amount: number; method: string; paidOn: string; removed: boolean };
  /** A payment the parser proposed. Editable, and never written until Confirm. */
  payProposal?: PaymentProposal;
  /** A cancelled proposal, kept only so the one-line notice can offer Undo. */
  undoProposal?: PaymentProposal; }
interface SendResult { reply: string; ready: boolean; }
interface Profile {
  id: string; business_name: string; logo_url: string | null; website_url: string | null;
  slogan: string | null; brand_colors: string[]; background_color: string | null;
  color_roles_explicit?: boolean | null;
  invoice_template: TemplateKey; paypal_me: string | null; cashapp_tag: string | null;
  venmo_username: string | null;
  business_phone?: string | null; business_email?: string | null;
  terms?: string | null; // 20261024100000; undefined until the migration is applied
  terms_prompt_count?: number | null;
  access_tier?: string | null; // read only to decide the pre-build (skipPreBuild)
  // Connect flags (select(*)) — for the PDF card line only.
  stripe_account_id?: string | null; stripe_charges_enabled?: boolean | null;
  card_payments_enabled?: boolean | null;
  bank_transfer_enabled?: boolean | null; // PDF bank line flag (20261015200000)
}

const today = () => new Date().toISOString().slice(0, 10);
// Tiers the cap triggers never limit (must match src/lib/access.ts).
const UNLIMITED_TIERS = new Set(['founder', 'trialing', 'active', 'past_due']);

/** The chat reply when a capped user asks for a document over the free cap:
 *  the card still shows, but nothing is saved until they upgrade. The limit
 *  comes from /api/access (the SQL cap functions); 3/5 only if it's missing. */
function overCapReply(kind: 'invoice' | 'expense' | 'estimate', limit: unknown): string {
  const n = typeof limit === 'number' ? limit : kind === 'expense' ? 5 : 3;
  if (kind === 'invoice') return `Here's your invoice. You've used your ${n} free invoices, so start your free trial to send it.`;
  if (kind === 'estimate') return `Here's your estimate. You've used your ${n} free estimates, so start your free trial to send it.`;
  return `Here's your expense. You've used your ${n} free expenses, so start your free trial to save it.`;
}

// The document kind a draft renders as: 'quote' or 'invoice', handled
// explicitly. Every other intent (expense/question/other) and a missing one are
// unexpected on a document card — log loudly rather than let an unknown value
// masquerade as an invoice silently, then fall back so the caller still renders.
function docKind(draft: Partial<ExtractResult> | null | undefined): 'quote' | 'invoice' {
  const intent = draft?.intent;
  if (intent === 'quote') return 'quote';
  if (intent === 'invoice') return 'invoice';
  console.error('docKind: unexpected draft.intent, falling back to invoice:', intent);
  return 'invoice';
}

// Change-guard heuristic (Commit A): would applying `next` over the linked draft
// `prev` amount to a different document rather than an edit of the same one? True
// when the client name changes, or when every incoming line item is new (none of
// their descriptions match a current one). Conservative — it only raises the
// "update or start new?" question; it never mutates state. A single-line typo fix
// to the client name is the one false trigger, and it is safe (asks, never rewrites).
function wouldReplaceInvoice(
  prev: Partial<ExtractResult>,
  next: Partial<ExtractResult>,
): boolean {
  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
  const prevName = norm(prev.client_name);
  const nextName = norm(next.client_name);
  const nameChanged = Boolean(prevName) && Boolean(nextName) && prevName !== nextName;

  const prevItems = (prev.line_items ?? []) as LineItem[];
  const nextItems = (next.line_items ?? []) as LineItem[];
  const replacedAllItems =
    prevItems.length > 0 &&
    nextItems.length > 0 &&
    nextItems.every((n) => !prevItems.some((p) => norm(p.description) === norm(n.description)));

  return nameChanged || replacedAllItems;
}

// A linked row is locked once it leaves 'draft' (Commit B). null = not yet
// linked / status unknown = not locked (a fresh draft must stay editable).
function isLockedStatus(status: string | null): boolean {
  return status != null && status !== 'draft';
}

// Short read-only badge for a locked card. Paid and partly-paid read distinctly
// so the user knows money has landed; a sent-but-unpaid invoice just reads sent.
function lockBadgeText(status: string | null, amountPaid: number, kind: 'invoice' | 'quote' = 'invoice'): string {
  // Nothing has necessarily gone out for an estimate (the owner shares the link
  // themselves), so it is "ready to share", never "sent".
  if (kind === 'quote') return 'Ready to share';
  if (amountPaid > 0) return status === 'paid' ? 'Paid — locked' : 'Payment received — locked';
  return 'Sent — locked';
}

// The refusal shown when the user tries to edit a locked invoice from chat.
function lockEditNotice(status: string | null, amountPaid: number, kind: 'invoice' | 'quote' = 'invoice'): string {
  if (kind === 'quote') return "That estimate's link is ready, so I can't change it here. Send a new estimate instead.";
  if (amountPaid > 0) {
    return status === 'paid'
      ? "That invoice is paid, so it's locked. Start a new invoice (the compose button) for any changes."
      : "A payment has been received on that invoice, so it's locked. Start a new invoice for any changes.";
  }
  return "That invoice was already sent, so it's locked. Start a new invoice, or tap Revise on the card to edit a copy.";
}

// Rebuild a chat draft from a saved invoice row (Commit B). Finalized
// conversations store draft:null in history, so a locked card reopened from
// history is reconstructed from the DB row. Deposit columns ride on the draft as
// snake_case, read elsewhere via `as any`.
function draftFromRow(row: {
  kind?: string | null;
  client_name?: string | null;
  client_address?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  line_items?: unknown;
  tax_rate?: number | null;
  due_date?: string | null;
  notes?: string | null;
  private_notes?: string | null;
  deposit_type?: string | null;
  deposit_value?: number | null;
}): Partial<ExtractResult> {
  const d: Record<string, unknown> = {
    intent: row.kind === 'quote' ? 'quote' : 'invoice',
    intent_explicit: false,
    client_name: row.client_name ?? null,
    client_address: row.client_address ?? null,
    client_phone: row.client_phone ?? null,
    client_email: row.client_email ?? null,
    line_items: Array.isArray(row.line_items) ? row.line_items : [],
    tax_rate: row.tax_rate ?? null,
    due_date: row.due_date ?? null,
    notes: row.notes ?? null,
    private_notes: row.private_notes ?? null,
    deposit_type: row.deposit_type ?? 'none',
    deposit_value: row.deposit_value ?? null,
  };
  return d as Partial<ExtractResult>;
}

// Editable-field fingerprint: two drafts with the same fingerprint are the same
// document content (Commit B lock check — an incoming parse that matches the
// locked draft is a no-op question, not an edit, so it isn't refused).
function draftFingerprint(d: Partial<ExtractResult> | null): string {
  const items = ((d?.line_items ?? []) as LineItem[]).map((li) => [li.description, li.qty, li.unit_price, li.unit ?? null, li.detail ?? null]);
  return JSON.stringify({
    name: (d?.client_name ?? '').trim(),
    addr: (d?.client_address ?? '').trim(),
    phone: (d?.client_phone ?? '').trim(),
    items,
    tax: d?.tax_rate ?? null,
    depType: (d as any)?.deposit_type ?? 'none',
    depVal: (d as any)?.deposit_value ?? null,
    notes: d?.notes ?? null,
    privateNotes: d?.private_notes ?? null,
    due: d?.due_date ?? null,
  });
}

// Every message carries a stable id so the transcript renders by id (not array
// index) and a specific message can be replaced in place (retry). Factories
// stamp the id in one spot; `extra` is the seam for per-message fields.
const genMsgId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const aMsg = (content: string, extra?: Partial<Omit<Msg, 'id' | 'role' | 'content'>>): Msg =>
  ({ id: genMsgId(), at: Date.now(), role: 'assistant', content, ...extra });
const uMsg = (content: string, source?: Msg['source']): Msg =>
  ({ id: genMsgId(), at: Date.now(), role: 'user', content, source });

// Append a message, or — during a retry (retryId set) — replace the failed
// message in place by id. A successful retry leaves no dead error behind, and a
// repeat failure never stacks a duplicate (the failure sites skip the append
// entirely when retrying, leaving the existing message and its button intact).
const emitResult = (list: Msg[], msg: Msg, retryId?: string): Msg[] =>
  retryId ? list.map((m) => (m.id === retryId ? msg : m)) : [...list, msg];

// Auto-scroll follows new content only while the reader is within this many px
// of the bottom; scrolled up to read, they stay put.
const NEAR_BOTTOM_PX = 120;
// localStorage flag: the payment-alerts offer was answered (Yes or Not now).
const ALERTS_PROMPTED_KEY = 'onit_alerts_prompted';
const FEEDBACK_PROMPT_KEY = 'onit_feedback_prompt';

/** A denied mic permission gets the steps card (micBlockedCard), because the
 *  browser will not ask again; any other failure (no mic, busy) keeps this
 *  plain line. */
const MIC_FALLBACK_TEXT = "Couldn't use the mic. You can type instead.";
const isIosDevice = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
// localStorage flag: the payouts nudge was dismissed — never show again.
const PAYOUTS_NUDGE_DISMISSED_KEY = 'onit_payouts_nudge_dismissed';
// Layout effect in the browser (pin before paint, no one-frame jump); plain
// effect during SSR, where React 18 warns on useLayoutEffect.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Mobile browsers suspend/kill background tabs constantly — persist the
// conversation per-browser (and per-user, see chat-storage) so switching apps
// never loses a draft. The same storage layer feeds the "recent conversations"
// history (last 5). Keys are built per namespace via chatKey()/historyKey().
const HISTORY_MAX = 5;
// Bump when StoredChat's shape changes. An entry from an unmigratable older
// build is discarded on load rather than rehydrated into a broken draft. (v1
// was the original unversioned shape. v3 added finalizeSent — finalize
// step-completion, so a resumed finalize skips steps that already ran. v4 added
// Msg.id; a v3 entry is migrated in loadStoredChat, not dropped — see there.
// v5 added linkedStatus/linkedAmountPaid so a sent, locked conversation survives
// a reload as a locked card; v3/v4 entries lack them and simply restore unlocked
// until the DB status re-fetch runs — migrated, not dropped.)
const STORE_VERSION = 5;
// An in-progress invoice older than this is stale — don't resurrect a job the
// user started a day ago and forgot about. updatedAt is refreshed on every write.
const STORE_TTL_MS = 24 * 60 * 60 * 1000;

// Receipt shutter (MOTION-SPEC §8). The camera / photo sheet covers the page
// until it's dismissed, and a flash fired under it is never seen (on iPhone it
// read as no flash at all). So: wait until the page is visible again, then two
// animation frames for the sheet's dismissal to clear, then flash.
function afterSheetGone(): Promise<void> {
  return new Promise((resolve) => {
    const twoFrames = () => requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    if (document.visibilityState === 'visible') { twoFrames(); return; }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      twoFrames();
    };
    document.addEventListener('visibilitychange', onVisible);
  });
}
// The flash's peak: 40ms up + 80ms hold (.onit-shutter in globals.css). The
// photo's flight into its bubble starts here, as the white starts to fade.
const FLASH_PEAK_MS = 120;
// The opening line (release frames; §L Q10: time of day, no name). Built per
// conversation so the time of day is current. Never sent to /api/parse (the
// history starts after it).
function greeting(): Msg {
  const h = new Date().getHours();
  const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  return aMsg(`${part}! Snap a receipt, or tap + to start an invoice or estimate.`);
}

// The day label over the conversation ("TODAY", "YESTERDAY", or the date),
// from the first message's id, which carries its creation time.
function dayLabel(messages: Msg[]): string | null {
  const t = /^m-([0-9a-z]+)-/.exec(messages[0]?.id ?? '')?.[1];
  if (!t) return null;
  const d = new Date(parseInt(t, 36));
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}

const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// A "bare" affirmative: the WHOLE message is a confirmation (allowlist) with
// only light politeness/punctuation — nothing else. A message that merely
// starts with "yes" but carries more ("yes but make it $300") is NOT bare and
// must never finalize the stale draft.
const AFFIRMATIVE_WORDS = /^(?:y|ya|yes|yeah|yep|yup|sure|ok|okay|k|do it|go ahead|go for it|create it|send it|make it|another|another one|new one|correct|confirm|confirmed|absolutely|definitely|please|please do|yes please)[\s!.,]*$/i;

// Any invoice signal disqualifies an affirmative: a digit (dollar amount or
// quantity), or an edit word. A NEW CLIENT NAME is already excluded because it
// would break the whole-message "bare" match above.
const INVOICE_SIGNAL = /\d|\b(?:but|instead|change|actually|wait)\b/i;

// Affirmative requires BOTH: (1) a bare affirmative from the allowlist, AND
// (2) no invoice signal. Otherwise it is NOT affirmative.
const isAffirmative = (t: string) => {
  const s = t.trim();
  return AFFIRMATIVE_WORDS.test(s) && !INVOICE_SIGNAL.test(s);
};

// An expense already on file carrying the receipt image being offered again.
interface ExistingReceipt {
  id: string;
  amount: number;
  vendor: string | null;
  spent_on: string;
}

/** Names the expense we already have, so "duplicate" is checkable, not a claim. */
function duplicateMessage(e: ExistingReceipt): string {
  const where = e.vendor ? ` at ${e.vendor}` : '';
  // spent_on is a bare yyyy-mm-dd; parsing it directly would shift a day in
  // timezones behind UTC. Read the parts as local.
  const [y, m, d] = e.spent_on.split('-').map(Number);
  const when = new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString();
  return `You already logged this receipt — ${money(Number(e.amount))}${where} on ${when}. I didn't add it twice.`;
}

interface StoredChat {
  version: number;
  id?: string;
  messages: Msg[];
  draft: Partial<ExtractResult> | null;
  ready: boolean;
  // The invoice row already inserted this session but not yet marked sent (id +
  // number). Persisted so a send that resumes after a suspend/reload reuses this
  // row instead of inserting a second one with a fresh number.
  pendingInvoice?: { id: string; no: number } | null;
  // Finalize step-completion: true once the inserted row was marked sent. A
  // resumed finalize (suspend between "mark sent" and the reset) reads this and
  // finishes idempotently instead of re-sharing, re-marking, and re-archiving.
  finalizeSent?: boolean;
  // Live lock state of the linked invoice (Commit B/C), persisted so a sent,
  // locked conversation restores as a locked card with Revise after a reload —
  // and refuses further edits — instead of resurrecting an editable draft. The
  // DB status re-fetch on restore is still authoritative; these give an instant,
  // flash-free lock before it resolves. Absent on v3/v4 payloads.
  linkedStatus?: string | null;
  linkedAmountPaid?: number;
  // Id of the message the card renders after (see cardAfterId). Optional:
  // older payloads lack it and show the card after the last message.
  cardAfterId?: string | null;
  updatedAt: number;
}

interface HistoryEntry {
  id: string;
  title: string;
  date: number;
  finalized: boolean;
  messages: Msg[];
  draft: Partial<ExtractResult> | null;
  ready: boolean;
  cardAfterId?: string | null;
}

// Backfill a stable id onto any message that lacks one. v3 payloads (and any
// v4 written before this field existed) stored messages without ids; a restored
// chat must render by id like a fresh one. Pure — returns a new array and
// leaves the input untouched.
function withMessageIds(messages: Msg[]): Msg[] {
  return messages.map((m) => (m.id ? m : { ...m, id: genMsgId() }));
}

// Receipt thumbnails are ~40–50K characters each as data URLs, and
// localStorage holds ~5MB per origin (less in practice on iOS Safari). Only
// the newest few are written; older bubbles restore as a placeholder. Archived
// history keeps none. In memory (this session) every image stays.
const PERSIST_THUMBS = 8;
function forStorage(messages: Msg[], keep = PERSIST_THUMBS): Msg[] {
  let kept = 0;
  const out = messages.filter((m) => !m.auto);
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (!m.receipt) continue;
    if (kept < keep) kept++;
    else out[i] = { ...m, receipt: '' };
  }
  return out;
}

/** Write the live conversation. On a quota error, retry once with no images,
 *  so storage never silently keeps an older copy (a stale restore). A second
 *  failure throws to the caller, as before. */
function writeStoredChat(ns: string, payload: StoredChat) {
  try {
    localStorage.setItem(chatKey(ns), JSON.stringify({ ...payload, messages: forStorage(payload.messages) }));
  } catch {
    localStorage.setItem(chatKey(ns), JSON.stringify({ ...payload, messages: forStorage(payload.messages, 0) }));
  }
}

function loadStoredChat(ns: string): StoredChat | null {
  try {
    const raw = localStorage.getItem(chatKey(ns));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredChat;
    // v4 added Msg.id. Migrate a v3 payload rather than discard it, so an
    // in-progress conversation from the previous build survives the upgrade:
    // its messages get ids backfilled below and it's treated as current. Only
    // genuinely older/unrecognized shapes (< 3) are dropped — their fields
    // predate too much to rehydrate safely. The persist effect rewrites the
    // migrated payload as the current version on the next change.
    if (parsed.version !== STORE_VERSION && parsed.version !== 4 && parsed.version !== 3) return null;
    // Stale — a job left untouched past the TTL isn't "current" anymore.
    if (typeof parsed.updatedAt !== 'number' || Date.now() - parsed.updatedAt > STORE_TTL_MS) return null;
    if (!Array.isArray(parsed.messages) || parsed.messages.length < 2) return null;
    return { ...parsed, version: STORE_VERSION, messages: withMessageIds(parsed.messages) };
  } catch {
    return null;
  }
}

function loadHistory(ns: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(historyKey(ns));
    const list = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    if (!Array.isArray(list)) return [];
    // History carries no version field; entries written before Msg.id lack ids
    // on their messages. Backfill on read so opening an old entry renders by id
    // without key collisions. Non-destructive — only rewritten on next push.
    return list.map((e) => ({ ...e, messages: withMessageIds(e.messages ?? []) }));
  } catch {
    return [];
  }
}

function pushHistory(ns: string, entry: HistoryEntry) {
  try {
    // History is a nicety: archived conversations keep no receipt images.
    const slim = { ...entry, messages: forStorage(entry.messages, 0) };
    const list = [slim, ...loadHistory(ns).filter((e) => e.id !== entry.id)].slice(0, HISTORY_MAX);
    localStorage.setItem(historyKey(ns), JSON.stringify(list));
  } catch { /* storage full — history is a nicety */ }
}

function convoTitle(messages: Msg[], draft: Partial<ExtractResult> | null): string {
  if (draft?.client_name) return draft.client_name;
  const firstUser = messages.find((m) => m.role === 'user');
  return firstUser ? firstUser.content.slice(0, 40) : 'Conversation';
}

// One in-flight flag for the whole turn. Set synchronously at the TOP of each
// handler before any branching (so the controls disable together) and cleared in
// that handler's single finally. The guest wall is a card (signInAsk), not a
// phase: nothing stays locked while it waits. Each value titles the one visible
// processing indicator.
// Replaces the old busy / finalizing / preparing / savingExpense states and both
// guard refs. `recording` (mic open, awaiting speech) is separate and stays.
type Phase = null | 'thinking' | 'reading' | 'preparing' | 'building' | 'saving';

export default function Chat({ active = true }: { active?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(() => [greeting()]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>(null);
  // Synchronous double-send guard (state lags a render).
  const sendRef = useRef(false);
  // Failure + retry motion (MOTION-SPEC §7). Messages that arrived by restore
  // (reload / history) never shake on mount; a live failure does. retryShake
  // counts finished retries per message: bumping it re-keys the bubble, so a
  // retry that fails again shakes again (a success replaces the bubble).
  const restoredMsgIdsRef = useRef<Set<string>>(new Set());
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const retryingRef = useRef(false);
  const [retryShake, setRetryShake] = useState<Record<string, number>>({});
  // Failure haptic (MOTION-SPEC §7 / motion inventory "Failed action"): one
  // warning buzz per live failure, and again when a retry fails. Restored
  // failures stay quiet. Android only (iOS has no vibration API).
  const buzzedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const m of messages) {
      if (!m.failed || restoredMsgIdsRef.current.has(m.id)) continue;
      const key = `${m.id}:${retryShake[m.id] ?? 0}`;
      if (buzzedRef.current.has(key)) continue;
      buzzedRef.current.add(key);
      try { navigator.vibrate?.([10, 40, 10]); } catch { /* unsupported */ }
    }
  }, [messages, retryShake]);
  // Receipt capture (MOTION-SPEC §8): a white shutter flash when a photo comes
  // back. Keyed so every capture replays it; 0 = never shown.
  const [shutterKey, setShutterKey] = useState(0);
  // The in-app camera sheet (flag on only). Mounted means open; closing
  // unmounts it, and that unmount is what stops the stream.
  const [cameraOpen, setCameraOpen] = useState(false);
  // The receipt bubble captured in THIS session that should play its flight
  // (MOTION-SPEC §8). Never set for restored messages, so they render static.
  const liveReceiptRef = useRef<{ id: string; flashPeak: Promise<void> } | null>(null);
  // Same for the logged card a live save collapses into; and the expense
  // card's fold-away while that happens.
  const liveLoggedIdRef = useRef<string | null>(null);
  // The photo bubble of the receipt on the open expense card (its logged card
  // references it). Cleared with the card.
  const receiptBubbleIdRef = useRef<string | null>(null);
  const [expenseExiting, setExpenseExiting] = useState(false);
  const [draft, setDraft] = useState<Partial<ExtractResult> | null>(null);
  const [draftHistory, setDraftHistory] = useState<Array<Partial<ExtractResult>>>([]);
  const [ready, setReady] = useState(false);
  // One-shot card animation (MOTION-SPEC §3-5). Set only by LIVE events (a card
  // appearing from a parse, a send locking it, Revise); restores never set it,
  // so a reopened card never replays. Cleared by a timer once it has played, so
  // a later remount (the card moving under a new reply) doesn't replay either.
  const [cardAnim, setCardAnim] = useState<null | 'enter' | 'lock' | 'exit'>(null);
  const cardAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function playCardAnim(kind: 'enter' | 'lock' | 'exit', ms: number) {
    if (cardAnimTimerRef.current) clearTimeout(cardAnimTimerRef.current);
    setCardAnim(kind);
    cardAnimTimerRef.current = setTimeout(() => setCardAnim(null), ms);
  }
  useEffect(() => () => { if (cardAnimTimerRef.current) clearTimeout(cardAnimTimerRef.current); }, []);
  // Where the invoice/quote card sits in the transcript: right after this
  // message. Moved to the reply that last CHANGED the draft (or seeded the
  // card); card-only edits, finalize and later chat don't move it, so newer
  // messages render below the card. Null/stale → after the last message.
  const [cardAfterId, setCardAfterId] = useState<string | null>(null);
  // Change guard (Commit A): a parse that would rewrite the linked saved invoice
  // (different client, or all line items replaced) is held here instead of
  // applied, so the user can choose "update this one" vs "start a new invoice".
  // { no } is the linked invoice number for the prompt; { draft } is the merged
  // draft awaiting the decision. Null when there's nothing pending.
  const [pendingChange, setPendingChange] =
    useState<{ no: number; kind: 'quote' | 'invoice'; draft: Partial<ExtractResult> } | null>(null);
  // Client match (lib/services/clients): finalize() found close-but-not-exact
  // clients for the typed name and paused to ask which one. Nothing is created
  // until the user answers. `convo` ties it to this conversation.
  const [clientChoice, setClientChoice] =
    useState<{ typed: string; candidates: ClientRecord[]; convo: string | null; fp: string } | null>(null);
  // The same question, readable synchronously: finalize() must see it cleared
  // in the very handler that cleared it (a stale closure would block the resume).
  const clientAskRef = useRef<{ typed: string; convo: string | null } | null>(null);
  // The client this conversation's draft is already settled on (matched,
  // created, or picked), keyed by name: later edits skip matching entirely.
  const resolvedClientRef = useRef<{ id: string; key: string; convo: string | null } | null>(null);
  // "New client" was chosen for this typed name: create it despite the match.
  const forceNewClientRef = useRef<{ key: string; convo: string | null } | null>(null);
  // A pick just rewrote draft.client_name; send once that render has landed.
  const resumeAfterPickRef = useRef(false);
  // The send that reached finalize was spoken, so the question is spoken too.
  const voiceFinalizeRef = useRef(false);
  // Live status of the linked saved invoice (Commit B). Fetched on restore,
  // history open, and at save time so the card knows if it has left 'draft'. A
  // non-draft, non-null status locks the card read-only; amount_paid decides the
  // paid/partly-paid copy (and, in Commit C, whether Revise is offered).
  const [linkedStatus, setLinkedStatus] = useState<string | null>(null);
  // "+ Add tax" opened the (still empty) tax field.
  const [taxOpen, setTaxOpen] = useState(false);
  // Synchronous send-in-progress flag for finalize() (send / download).
  const finalizingRef = useRef(false);
  // A sent estimate's public token, read from its row so the locked card can
  // offer Copy link / Share even after a reload or a reopen from history.
  const [linkedToken, setLinkedToken] = useState<string | null>(null);
  const [linkedValidUntil, setLinkedValidUntil] = useState<string | null>(null);
  // The document's images (gold "+ Add attachment"): freshly-picked ones carry a
  // blob until the send uploads them, then the row id + storage path; ones loaded
  // from a saved invoice carry only the signed URL. Print order = list order.
  const [attachments, setAttachments] = useState<EditorAttachment[]>([]);
  const attachmentsRef = useRef<EditorAttachment[]>([]);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
  const [linkedAmountPaid, setLinkedAmountPaid] = useState<number>(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Capped tiers (free, canceled, anything not unlimited) get no background
  // pre-build for an INVOICE: it INSERTs the draft row before Send, which would
  // spend a free invoice slot on a card that may never be sent. Their Send
  // builds at tap time instead (the slow path). Estimates are capped too now,
  // so they skip it as well. Only while the paywall is on.
  const skipPreBuild = PAYWALL_ENABLED && !!profile
    && !UNLIMITED_TIERS.has(profile.access_tier ?? 'free');
  // Connect on in this deployment? (PDF card line; fails closed.)
  const [connectOn, setConnectOn] = useState(false);
  useEffect(() => {
    // Prewarmed (inactive) Chat should not call the deployment endpoint; it
    // fetches when the tab becomes active.
    if (!active) return;
    let cancelled = false;
    void fetchConnectEnabled().then((on) => { if (!cancelled) setConnectOn(on); });
    return () => { cancelled = true; };
  }, [active]);
  // Distinguishes "profile fetch still in flight" from "genuinely no profile
  // (a guest)". finalize() must not bounce an authed user to login just because
  // the fetch hasn't resolved yet (audit B2); only a true guest sees the
  // sign-in prompt (audit A3).
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Render-only fail-safe for the restore skeleton. If getSession() hangs (a
  // documented stall — settings/page.tsx carries an 8s timeout for the same
  // call), the mount effect's `setHydrated(true)` never runs and the message
  // list, gated on `hydrated`, would sit on the skeleton forever. After 4s we
  // stop showing the skeleton and render whatever messages we have (the
  // greeting, or a restored convo if it arrived). This NEVER sets `hydrated`, so
  // the persist and resume effects keep waiting for a real restore — we never
  // write a greeting payload over the user's saved conversation.
  const [skeletonTimedOut, setSkeletonTimedOut] = useState(false);
  const [finished, setFinished] = useState(false); // invoice sent — stop persisting this convo
  // One-time payment-alerts offer after a sent invoice: 'ask' (push works here)
  // or 'install' (iPhone Safari tab: Home Screen hint). See showRemindersCard.
  const [reminderPrompt, setReminderPrompt] = useState<{ client: string; onlinePay: boolean } | null>(null);
  // P-52: the OS said no (or push is unavailable). The card says so and offers
  // the one way back: the in-app payment-alerts switch.
  const [alertsFailed, setAlertsFailed] = useState(false);
  // Board L2/L3/S5: the guest or signed-out wall is a card. Sign-in is a tap.
  // Design 08 starter chips: a fresh random three from the full "What I can do"
  // list each time a greeting starts (a new chat has a new greeting id).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const starterChips = useMemo(() => pickStarterChips(), [messages[0]?.id]);
  // A chip or a "What I can do" row starts the message; it never sends. The input
  // takes the text, the caret goes to the end and the field is focused inside the
  // tap, so the keyboard opens and the owner can just type.
  const fillComposer = (text: string) => {
    setInput(text);
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    requestAnimationFrame(() => el.setSelectionRange(text.length, text.length));
  };
  const [signInAsk, setSignInAsk] = useState<{ kind: SignInKind; headline?: string | null } | null>(null);
  // "Got a minute?" card (FEEDBACK-SPEC.md section 4); see showFeedbackCard.
  const [feedbackPrompt, setFeedbackPrompt] = useState(false);
  // "Add your terms" tip after a first send (lib/terms-prompt.ts); see showTermsCard.
  const [termsPrompt, setTermsPrompt] = useState(false);
  // Soft upgrade prompts (lib/soft-prompts.ts). Nothing is blocked: the walls
  // are the paywall; `softWall` is the paywall a prompt opened (a separate
  // state: nothing was blocked, so the send gate's paywallFor must not be
  // involved). The usage nudge itself lives on the saved document's card.
  const [softWall, setSoftWall] = useState<SoftPrompt | null>(null);
  // Upgraded while the card is up (checkout finished, code redeemed): it has nothing left to say.
  useEffect(() => subscribeAccess(() => { setSoftWall(null); }), []);
  const [convoId, setConvoId] = useState('');
  // The (i) note under "Download draft" (chat invoice card).
  const [draftInfoOpen, setDraftInfoOpen] = useState(false);
  // Tracks whether the empty-state payouts nudge has been dismissed this session.
  const [payoutsNudgeDismissed, setPayoutsNudgeDismissed] = useState(
    () => { try { return !!localStorage.getItem(PAYOUTS_NUDGE_DISMISSED_KEY); } catch { return false; } }
  );
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Passive duplicate indicator: the server flagged a similar recent invoice
  // (duplicateWarning). Rendered as a badge on the invoice card, not a blocking
  // prompt — the card stays fully actionable, no confirmation required. Set from
  // the parse result on every turn, so it self-clears when the match goes away.
  const [duplicateHint, setDuplicateHint] = useState(false);
  // Send readiness. There is no confirm step: one tap on "Looks right — send it"
  // shares. The card's PDF is pre-built in the background as soon as the card
  // renders (and rebuilt after every edit/undo), so that tap can call
  // navigator.share() with nothing awaited. `prepState` is the outcome of the
  // latest finished build, keyed by the draft signature it was built from:
  // 'ready' enables the button for the synchronous share; 'failed' enables it
  // for the slow path, so an error surfaces instead of the button hanging on
  // "Preparing…". `preparing` serializes builds (never two DB writes in flight).
  const [prepState, setPrepState] = useState<{ sig: string; status: 'ready' | 'failed' } | null>(null);
  // A send that built the file but whose share sheet didn't open (iOS drops the
  // tap's permission to share after the slow-path awaits): the signature of the
  // draft whose file is waiting. While it matches, the button reads "Share
  // invoice" so the second tap is a deliberate step, not a retry of an error.
  const [shareWaiting, setShareWaiting] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  // Push-to-talk voice session: mic toggles a session (X ends it). Reply speech
  // now follows per-message input modality (voice vs typed), not session state.
  const [voiceSession, setVoiceSession] = useState(false);
  const [recording, setRecording] = useState(false);
  // A finished take is uploading/being transcribed (ring spinner in the field).
  const [transcribing, setTranscribing] = useState(false);
  // Inline mic problem (denied permission, no mic, no support) — shown above the
  // field, never as a chat bubble.
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // P-47: a denied mic is a card with steps, not a sentence. `still` is set when
  // Try again was tapped and the browser did not ask a second time.
  const [micBlocked, setMicBlocked] = useState<{ card: MicBlocked; still: boolean } | null>(null);
  const micRetryRef = useRef(false);

  // The bank popup holds off while the mic owns the screen (CHANGES.md · item
  // 10): the shell cannot see this state, so it is mirrored onto the body.
  useEffect(() => {
    document.body.dataset.onitRecording = voiceSession ? '1' : '';
    return () => { delete document.body.dataset.onitRecording; };
  }, [voiceSession]);
  // Receipt capture: the compressed image waits here between "picked" and
  // "parsed", so the user can back out before anything is uploaded or read.
  const [receipt, setReceipt] = useState<PreparedReceipt | null>(null);
  // Two receipt inputs sharing one handler: the camera input carries
  // `capture="environment"` so it opens the rear camera directly on mobile
  // (Android/Brave was ignoring the choice and going straight to the gallery);
  // the gallery input omits `capture` so an existing photo can still be picked.
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  // The parsed expense awaiting confirmation. Never auto-saved — the user
  // always sees the four fields and presses save.
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null);
  // Record expense (the + menu) opens the same card in the composer's template
  // slot. It is deliberately outside TemplateKind: an expense must never run
  // openTemplate's archive/clear path, which belongs to invoices and quotes.
  const [expenseTemplate, setExpenseTemplate] = useState(false);
  const [discardAsk, setDiscardAsk] = useState(false); // confirm-on-discard for the template
  const [expenseError, setExpenseError] = useState<string | null>(null);
  // TODO: sessionRef unused — per-message `source` replaced the speak gate.
  // Left in place intentionally; remove in a dedicated cleanup.
  const sessionRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recAbortRef = useRef(false);           // X pressed mid-record → drop the take
  const cancelSpeechRef = useRef<(() => void) | null>(null);
  // The message list is the chat screen's ONE scroll owner (the shell's main
  // doesn't scroll on /chat). nearBottomRef: was the reader at the bottom as of
  // the last scroll? Starts true so the first render lands on the latest.
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const printRef = useRef<HTMLDivElement>(null);
  // A draft invoice row already inserted this session but not yet marked sent
  // (share pending / cancelled). A retry reuses it instead of inserting a
  // second row (audit B1). Cleared whenever the draft content changes (a fresh
  // parse) so we never mark a stale row sent. Now persisted into the chat store
  // and restored on mount, so a send that resumes after a suspend/reload reuses
  // the same row instead of creating a duplicate with a new number.
  const pendingInvoiceRef = useRef<{ id: string; no: number } | null>(null);
  // Pre-built invoice PDF for the synchronous file-share on press 2 (Option B).
  // Built in the background on press 1 (and rebuilt on card edits) so the send
  // tap can call navigator.share({ files:[file] }) with NOTHING awaited between
  // the tap and share() — the fix for the user-activation failures. `signature`
  // ties the file to the exact draft it was built from; a mismatch (or no file)
  // makes press 2 fall back to the link share, never a download.
  const preBuiltRef = useRef<{ file: File; signature: string; token: string; id: string; no: number } | null>(null);
  // The card outlives the conversation (P-66 S1b), so its state is declared
  // above the pre-build effect that decides whether a build is needed.
  const [unsentShare, setUnsentShare] = useState<(UnsentShare & { file: File | null; token: string | null }) | null>(null);
  // A rebuilt card has no File in hand, so the PDF is built in the background
  // while it waits. "Retry the share" reads "Preparing…" and stays disabled until
  // the file for THIS invoice is ready, so the tapped share still calls
  // navigator.share() synchronously. Mark as sent needs no file.
  const s1bNeedsFile = !!unsentShare && !unsentShare.file;
  // §04 Retry: drop the failed build so the pre-build effect runs again for the
  // current draft (the effect's only skip conditions are a matching signature
  // and an in-flight build).
  function retryPrebuild() {
    preBuiltRef.current = null;
    setPrepState(null);
  }
  const preBuildIdRef = useRef(0);            // latest-wins guard across overlapping builds
  const preBuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // edit debounce
  const preparingRef = useRef(false);         // a pre-build is in flight (sync guard)
  const preparePromiseRef = useRef<Promise<void> | null>(null); // settles when it ends
  // The AI's original line-item descriptions from the latest parse, captured
  // BEFORE any inline edit. On send we record original_description on a line
  // only when the shipped text differs (passive training data; an unedited line
  // stays null — the positive signal). In-memory only: a description edited
  // after a suspend/restore simply logs no original, which is acceptable.
  const originalDescriptionsRef = useRef<string[]>([]);
  // Whether the pending invoice row was already marked sent this finalize. A ref
  // (no re-render) mirrored into StoredChat.finalizeSent, so a suspend between
  // "mark sent" and the reset resumes into an idempotent finish, not a re-share.
  const finalizeSentRef = useRef(false);
  // Namespace for this session's localStorage keys — the signed-in user's id, or
  // 'guest'. Resolved once auth returns (before hydrated flips true) and read
  // imperatively by every store read/write, so the conversation is scoped to the
  // right person and can't bleed across accounts on a shared browser.
  const storageNsRef = useRef<string | null>(null);
  // updatedAt of the payload we last wrote/applied, so a visibilitychange
  // restore is a no-op when nothing actually changed while we were hidden.
  const appliedUpdatedAtRef = useRef<number>(0);
  // Current turn's trace id (one per user message), held in a ref so finalize()
  // and finishFinalize() log under the same id as the send() that started the
  // turn. See src/lib/trace.ts — silent unless NEXT_PUBLIC_TRACE === 'true'.
  const turnIdRef = useRef<string>('');

  // Apply a restored conversation into state. Shared by the mount restore and
  // the visibilitychange restore. Only ever called with a payload that already
  // passed loadStoredChat's version/TTL/shape checks.
  function applyStoredChat(stored: StoredChat) {
    stored.messages.forEach((m) => restoredMsgIdsRef.current.add(m.id));
    setMessages(stored.messages);
    setDraft(stored.draft);
    setDraftHistory([]);
    setReady(Boolean(stored.ready));
    setCardAfterId(stored.cardAfterId ?? null);
    // Reuse an invoice row inserted before the suspend instead of starting a
    // new one on the next send (prevents a duplicate with a fresh number).
    pendingInvoiceRef.current = stored.pendingInvoice ?? null;
    finalizeSentRef.current = Boolean(stored.finalizeSent);
    void restoreS1b(stored.pendingInvoice?.id ?? null);
    setConvoId(stored.id ?? genId());
    // Restore the lock state up front (v5+) so a sent conversation shows its
    // locked card and refuses edits immediately on reload — no flash of an
    // editable card before the DB re-fetch below resolves. A locked convo is
    // already archived to history, so mark it finished to prevent re-archiving as
    // a draft; an unlocked one stays live (finished=false).
    const restoredStatus = stored.linkedStatus ?? null;
    setLinkedStatus(restoredStatus);
    setLinkedAmountPaid(Number(stored.linkedAmountPaid ?? 0));
    setFinished(isLockedStatus(restoredStatus));
    appliedUpdatedAtRef.current = stored.updatedAt;
    // Commit B: the linked invoice may have been sent or paid in another session
    // since this draft was suspended. Re-read its live status (authoritative) so
    // the restored card locks if it has left 'draft'. Fire-and-forget.
    void loadLinkedStatus(stored.pendingInvoice?.id ?? null);
  }

  // Read the linked invoice's live status + amount_paid into state (Commit B).
  // Scoped by RLS to the caller's own rows; a soft-deleted row is treated as no
  // link. Failures leave the lock state unchanged rather than falsely unlocking.
  async function loadLinkedStatus(id: string | null | undefined) {
    if (!id) { setLinkedStatus(null); setLinkedAmountPaid(0); setAttachments([]); return; }
    try {
      const { data } = await supabase
        .from('invoices')
        .select('status, amount_paid')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
      setLinkedStatus((data?.status as string) ?? null);
      setLinkedAmountPaid(Number(data?.amount_paid ?? 0));
    } catch { /* keep prior lock state on a transient failure */ }
    void loadLinkedAttachments(id);
  }

  // P-66 S1b, restored: a returned conversation asks the row whether its card
  // still applies. The row is the authority — a row that is gone, soft-deleted
  // or no longer a draft clears the record and shows nothing.
  async function restoreS1b(invoiceId: string | null) {
    if (!invoiceId) return;
    const { data } = await supabase
      .from('invoices')
      .select('id, status, kind, invoice_number, client_name, total, due_date, public_token, deleted_at')
      .eq('id', invoiceId)
      .maybeSingle();
    const row = data && !data.deleted_at
      ? (data as UnsentShareRow & { public_token?: string | null })
      : null;
    const restored = restoreUnsentShare(invoiceId, row);
    if (!restored) return;
    setUnsentShare({ ...restored, file: null, token: row?.public_token ?? null });
    setUnsentShareOpen(false); // the CARD only — the sheet was already answered
  }
  /** Saved rows → editor items (short-lived signed URLs). The stored order is
   *  the print order; `pending` items (still to upload) are appended after. */
  async function syncAttachments(invoiceId: string, pending: EditorAttachment[]) {
    const rows = await listAttachmentRows(supabase, invoiceId);
    const saved = await Promise.all(rows.map(async (r) => {
      const url = await signedAttachmentUrl(supabase, r.storage_path);
      return url ? ({ id: r.id, previewUrl: url, storagePath: r.storage_path, rowId: r.id } as EditorAttachment) : null;
    }));
    setAttachments([...(saved.filter(Boolean) as EditorAttachment[]), ...pending]);
  }

  /** Load a linked invoice's attachments into the editor (empty for none). */
  async function loadLinkedAttachments(id: string | null | undefined) {
    if (!id) { setAttachments([]); return; }
    try { await syncAttachments(id, []); } catch { /* keep what's on screen */ }
  }

  /** Seed a revision card with COPIES of the original's images: thumbnails from
   *  signed URLs now, bytes duplicated into the new invoice at the first build
   *  (materializeAttachments). Reads only on the original. */
  async function seedRevisionAttachments(sourceInvoiceId: string) {
    try {
      const copies = await loadAttachmentCopies(supabase, sourceInvoiceId);
      // Only fill an empty list — never clobber an image the user already picked.
      setAttachments((cur) => (cur.length ? cur : copies));
    } catch {
      setMessages((m) => [...m, aMsg("Couldn't load the original's pictures. Add them again, or go back and tap Revise once more.")]);
    }
  }

  /** Remove a SAVED attachment: drop its row + object, then renumber the rest so
   *  positions stay 0..n-1 (delete + re-insert, never sequential updates). Only
   *  reachable from an editable (draft) card — a locked one renders no remove. */
  async function removeSavedAttachment(item: EditorAttachment) {
    const inv = pendingInvoiceRef.current;
    if (!inv || !item.storagePath || !profile) return;
    // The delete throws to the D8 sheet (cause + "still attached"); once the file
    // is gone, a failed renumber/sync is swallowed because the removal happened.
    if (item.rowId) await deleteAttachment(supabase, { id: item.rowId, storage_path: item.storagePath, position: 0 });
    else {
      const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).remove([item.storagePath]);
      if (error) throw error;
    }
    try {
      const rows = await listAttachmentRows(supabase, inv.id);
      await renumberAttachments(supabase, profile.id, inv.id, rows);
      await syncAttachments(inv.id, attachmentsRef.current.filter((a) => !a.storagePath));
    } catch { /* the file is already removed */ }
  }

  // Shared restore: re-read the namespaced store and apply it when it's newer
  // than what we last wrote/applied. The single entry point for every trigger
  // (mount, visibilitychange, pageshow), so the recovery logic can't drift
  // between them. Safe to call repeatedly — it no-ops when nothing changed and
  // never overwrites live state with an equal/older payload. Returns whether it
  // applied anything, so the caller can decide to start a fresh conversation.
  function restoreFromStore(): boolean {
    const ns = storageNsRef.current;
    if (!ns) return false; // namespace unresolved — never read a guessed slot
    const stored = loadStoredChat(ns);
    if (!stored || stored.updatedAt === appliedUpdatedAtRef.current) return false;
    applyStoredChat(stored);
    return true;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Resolve the storage namespace from the PERSISTED session, not getUser().
      // getSession() reads localStorage with no network round-trip, so restore
      // is not gated on — and cannot be broken by — a slow or failed auth call
      // on resume/remount (the regression behind the lost conversations). A
      // stored session yields the user id; its genuine absence is a real guest.
      // On error we leave the namespace unresolved (null) so the persist effect
      // writes nothing to a guessed slot and never orphans the real draft.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        const uid = session?.user?.id;
        // Move a guest draft into this account's slot before the namespace is
        // read below, so restoreFromStore() picks it up on the normal path — a
        // guest who signed in at the finalize wall keeps the work they built.
        adoptGuestChat(uid);
        storageNsRef.current = storageNamespace(uid);
      } catch {
        if (cancelled) return; // unresolved — storageNsRef stays null
      }
      // Restore is best-effort, but hydration MUST complete no matter what:
      // the message list is gated on `hydrated`, so if this block threw and
      // left it false the UI would sit on the restore skeleton forever. The
      // helpers below are each already internally try/catch-guarded (localStorage
      // blocked in private mode, corrupt JSON, v3 payloads); the finally is a
      // belt-and-braces guarantee that no future change here can strand the UI.
      try {
        dropLegacyChatStorage(); // one-time cleanup of pre-namespacing keys
        // Restore an in-progress conversation (mobile tab suspends wipe React
        // state) now that we know whose namespace to read — before, and
        // independent of, the server auth check below. Nothing (or a stale/
        // malformed payload) → start a fresh conversation.
        if (!restoreFromStore()) setConvoId(genId());
      } finally {
        if (!cancelled) setHydrated(true);
      }

    })();
    // header history icon lives in the shared layout — it signals us here
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth/profile gating is route-coupled (it can redirect to /onboarding), so
  // it only runs while Chat is the active tab. The local restore above stays
  // active-independent: a hidden Chat must restore its draft, but must never
  // redirect the user away from the tab they are actually on.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await getSharedUser();
      if (cancelled) return;
      if (!user) {
        setProfileLoaded(true); // resolved: genuine guest
        return;
      }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (cancelled) return;
      if (!data) { router.push('/onboarding'); return; }
      setProfile(data as Profile);
      setProfileLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Chat-owned global affordances: the follow-up service worker and the header
  // history icon (which only exists while Chat is on screen).
  useEffect(() => {
    if (!active) return;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const openHistory = () => {
      setHistory(loadHistory(storageNsRef.current ?? 'guest'));
      setShowHistory(true);
    };
    window.addEventListener('onit-history', openHistory);
    return () => window.removeEventListener('onit-history', openHistory);
  }, [active]);

  // Splash gate (lib/splash-gate): on a cold start the splash stays up until
  // this screen has its critical data — the conversation restored AND auth/
  // profile resolved — so it exits onto real content, not the skeleton. The
  // hold is advisory: Splash caps the wait, and unmount (e.g. the /onboarding
  // redirect) releases it.
  const releaseSplashRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!active) return;
    const release = holdSplash();
    releaseSplashRef.current = release;
    return release;
  }, [active]);
  useEffect(() => {
    if (!active) return;
    if (hydrated && profileLoaded) releaseSplashRef.current?.();
  }, [active, hydrated, profileLoaded]);

  // Render-only skeleton timeout (see skeletonTimedOut). Independent of the
  // restore effect so a hung getSession() can't take the timer down with it.
  // Deliberately does not touch `hydrated` — persistence still waits for a real
  // restore. Cleared on unmount.
  useEffect(() => {
    const t = setTimeout(() => setSkeletonTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, []);

  // persist on every change so nothing is lost when the browser suspends us
  useEffect(() => {
    if (!hydrated) return;
    const ns = storageNsRef.current;
    if (!ns) return;
    try {
      // A sent, locked conversation IS persisted even though it's "finished", so
      // a reload restores the locked card + Revise and keeps refusing edits. A
      // finished-but-unlocked convo (e.g. a new-chat reset) is cleared as before.
      const locked = isLockedStatus(linkedStatus);
      if ((finished && !locked) || messages.length < 2) {
        localStorage.removeItem(chatKey(ns));
      } else {
        // Twin of the explicit write in finalize() after the row is inserted —
        // keep the two payloads in sync. pendingInvoiceRef is a ref (no effect
        // fires on its change), so it rides along on the next state-driven write.
        const payload: StoredChat = {
          version: STORE_VERSION,
          id: convoId, messages, draft, ready,
          pendingInvoice: pendingInvoiceRef.current,
          finalizeSent: finalizeSentRef.current,
          linkedStatus,
          linkedAmountPaid,
          cardAfterId,
          updatedAt: Date.now(),
        };
        writeStoredChat(ns, payload);
        appliedUpdatedAtRef.current = payload.updatedAt; // our own write — don't re-restore it
      }
    } catch { /* storage full or blocked — nothing to do */ }
  }, [messages, draft, ready, hydrated, finished, convoId, linkedStatus, linkedAmountPaid, cardAfterId]);

  // Recover a conversation the OS dropped behind an app switch. Two triggers,
  // one shared restore (restoreFromStore):
  //   visibilitychange — Android and desktop (and an iOS freeze/resume) surface
  //     the tab again WITHOUT a reload, so mount never re-runs; re-read the
  //     store in case the heap was trimmed while hidden.
  //   pageshow — fires on bfcache restore and on load, covering resumes that
  //     arrive as a navigation rather than a visibility change.
  // restoreFromStore no-ops when nothing changed and never clobbers live state
  // with an equal/older payload, so wiring both triggers is safe.
  useEffect(() => {
    if (!hydrated) return;
    function onVisible() {
      if (document.visibilityState === 'visible') restoreFromStore();
    }
    function onPageShow() {
      restoreFromStore();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Explicit "New chat" from the header (see layout — dispatches 'onit-new-chat').
  // Archive the live conversation to history, then reset to a clean greeting. No
  // confirmation: history makes it recoverable. Re-bound as the conversation
  // changes so the closure always archives the current state, never a stale one.
  useEffect(() => {
    if (!active) return;
    function onNewChat() {
      // Empty conversation (just the greeting) — nothing to archive or reset.
      if (messages.length < 2) return;
      // A finalized convo is already in history (pushed by finalize); re-pushing
      // would replace its "Sent" entry with a draft one. Only archive live drafts.
      if (!finished) {
        pushHistory(storageNsRef.current ?? 'guest', {
          id: convoId || genId(),
          title: convoTitle(messages, draft),
          date: Date.now(),
          finalized: false,
          messages, draft, ready, cardAfterId,
        });
      }
      clearPending(); // cancel: a new chat drops a remembered signed-out question
      setMessages([greeting()]);
      setInvoiceUsage(null);
      setDraft(null);
      setDraftHistory([]);
      setReady(false);
      setCardAfterId(null);
      preBuiltRef.current = null;
      preBuildIdRef.current++; // invalidate any in-flight prepare's stash
      setPendingChange(null);
      setLinkedStatus(null);
      setLinkedAmountPaid(0);
      setAttachments([]);
      pendingInvoiceRef.current = null;
      finalizeSentRef.current = false;
      discardExpense();
      setFinished(false);
      setConvoId(genId());
    }
    window.addEventListener('onit-new-chat', onNewChat);
    return () => window.removeEventListener('onit-new-chat', onNewChat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, messages, draft, ready, finished, convoId, cardAfterId]);

  // /chat?new=1 — the recap's "Make an invoice": start a fresh conversation
  // (the live one is archived to history, as with the header's New chat).
  // After hydration, so the restored conversation is what gets archived; the
  // event fires a tick later, once the listener above holds that state.
  const newFromParam = useRef(false);
  useEffect(() => {
    if (!active || !hydrated || newFromParam.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('new') !== '1') return;
    const t = setTimeout(() => {
      newFromParam.current = true;
      url.searchParams.delete('new');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      window.dispatchEvent(new Event('onit-new-chat'));
    }, 0);
    return () => clearTimeout(t);
  }, [active, hydrated]);

  // Auto-scroll: follow new content only if the reader is already at the
  // bottom. It sets the list's own scrollTop, never scrollIntoView (which also
  // scrolls every scrollable ancestor, the page included), and is always
  // instant: iOS swallows the first tap on a control while a SMOOTH scroll is
  // in flight (the "Looks right — send it" needed-two-taps bug).
  function onListScroll() {
    const el = listRef.current;
    if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
  }
  function pinToBottom() {
    const el = listRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }
  // New content: messages, the card (appearing or edited), prompts, the
  // thinking row.
  useIsoLayoutEffect(pinToBottom, [messages, ready, draft, phase, pendingChange, expenseDraft, expenseTemplate, reminderPrompt, alertsFailed, signInAsk, feedbackPrompt, termsPrompt]);
  // The list itself shrinking (composer growing, Android keyboard) would hide
  // the latest line; stay pinned if the reader was at the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(pinToBottom);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The "Record a payment" button (chip and "What I can do" row). It adds the
  // record-payment card; it never sends a message and never reaches /api/parse.
  // payCardPendingRef is the synchronous guard (interaction rule 2): a second tap
  // in the same frame, before the card is in state, adds nothing. With a card
  // already open, a tap scrolls to it. It clears when no card is open any more
  // (confirmed, cancelled, or removed), so the next tap starts a fresh one.
  const payCardPendingRef = useRef<string | null>(null);
  // The no-invoice save's key per proposal message: minted at the first Confirm tap.
  const unattachedKeysRef = useRef(new Map<string, string>());
  function openPaymentCard() {
    const target = openPaymentCardTarget(messages, payCardPendingRef.current);
    if (target.action === 'ignore') return;
    if (target.action === 'scroll') {
      const list = listRef.current;
      const card = list?.querySelector<HTMLElement>('[data-pay-card]');
      if (list && card) {
        const below = card.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom;
        const above = list.getBoundingClientRect().top - card.getBoundingClientRect().top;
        if (below > 0) list.scrollTop += below;
        else if (above > 0) list.scrollTop -= above;
      }
      return;
    }
    const msg = aMsg('Who paid you?', {
      skipHistory: true,
      payProposal: {
        amount: null, method: null, clientName: '', paidOn: localDateString(new Date()),
        invoiceId: null, invoices: [], clients: [], picker: true,
      },
    });
    payCardPendingRef.current = msg.id;
    nearBottomRef.current = true;
    setMessages((m) => [...m, msg]);
  }
  useEffect(() => {
    if (payCardPendingRef.current && !messages.some((x) => x.payProposal != null)) payCardPendingRef.current = null;
  }, [messages]);

  // What the button's card loads on arrival: the client list and the open
  // invoices. A failure names its cause (signed out, offline, ours).
  async function loadPaymentPicker(): Promise<PickerData> {
    try {
      const { data: { user: u } } = await getSharedUser();
      if (!u) return { ok: false, message: paymentCardLoadError(null, false) };
      const [clientsRes, invoicesRes] = await Promise.all([
        supabase.rpc('client_summaries'),
        supabase
          .from('invoices')
          .select('id, invoice_number, client_name, total, amount_paid, kind, created_at')
          .eq('user_id', u.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .limit(200),
      ]);
      const failed = clientsRes.error ?? invoicesRes.error;
      if (failed) {
        console.error('[payment card] load failed', failed);
        return { ok: false, message: paymentCardLoadError(failed, true) };
      }
      return {
        ok: true,
        clients: ((clientsRes.data ?? []) as Record<string, unknown>[]).map(normalizeSummary),
        invoices: ((invoicesRes.data ?? []) as Array<Record<string, unknown>>)
          .filter((r) => String(r.kind ?? 'invoice') === 'invoice')
          .map((r) => ({
            id: String(r.id),
            invoiceNo: r.invoice_number == null ? null : Number(r.invoice_number),
            clientName: String(r.client_name ?? ''),
            total: Number(r.total ?? 0),
            amountPaid: Number(r.amount_paid ?? 0),
            kind: 'invoice' as const,
            createdAt: String(r.created_at ?? ''),
          })),
      };
    } catch (e) {
      console.error('[payment card] load threw', e);
      return { ok: false, message: paymentCardLoadError(e, true) };
    }
  }

  /** Shared parse flow for typed and spoken input. The reply always renders as
   *  text first; it is spoken (TTS) only when THIS message was entered by voice
   *  — per-message modality, so typed messages stay silent. */
  async function send(text: string, source: 'voice' | 'typed' = 'typed', retryId?: string): Promise<SendResult | null> {
    const trimmed = text.trim();
    // Single in-flight guard. `phase` is state and lags a render, so a sub-frame
    // double-tap can still slip one through (accepted). It fixes the reported
    // repeat-tap bug because it is set before ANY branch. Cleared in the one
    // outer finally below.
    if (!trimmed || phase || sendRef.current) return null;
    sendRef.current = true;
    setPhase('thinking');
    // One turn_id per user message; finalize()/finishFinalize() read it from the
    // ref so all four trace points share it. Point 1: the user message — a
    // length/shape summary by default (the raw text holds client PII; it is
    // logged only under NEXT_PUBLIC_TRACE_VERBOSE, via redactText).
    const turnId = newTurnId();
    turnIdRef.current = turnId;
    traceTurn(turnId, 'input', { source, retry: Boolean(retryId), namesDocType: namesDocType(trimmed), ...redactText(trimmed) });
    try {
    // On a retry we don't re-echo the user's text (it's already in the
    // transcript) and we build the parse history WITHOUT the failed bubble; the
    // bubble stays put until the outcome replaces it (success) or leaves it
    // (failure). A normal send echoes the user message and clears the input.
    // Feedback talk ("I have a suggestion") gets a button to the feedback page and
    // never reaches the AI (lib/feedback-intent.ts); it stays out of job history.
    const feedbackAsk = !retryId && isFeedbackIntent(trimmed);
    // Item 11: "?", "help" and the "what can you do" family are answered here.
    // No AI call and no document; the question itself stays out of job history.
    const commandAsk = !retryId && matchCommand(trimmed);
    const recapAsk = !retryId && !commandAsk ? matchRecap(trimmed) : null;
    const next: Msg[] = retryId
      ? messages.filter((m) => m.id !== retryId)
      : [...messages, feedbackAsk || commandAsk || recapAsk ? { ...uMsg(trimmed, source), skipHistory: true as const } : uMsg(trimmed, source)];
    if (!retryId) {
      // The reader just acted: follow their message and the reply to it, even
      // if they had scrolled up.
      nearBottomRef.current = true;
      setMessages(next);
      setInput('');
    }

    // Signed out: one short answer with a Sign in button, before ANY local card
    // (recap, commands, feedback) or AI call, so a guest never sees empty
    // graphics. A retry of a failed send is never gated (it has its own bubble).
    const gate = retryId ? ({ block: false } as const) : signedOutGate({ guest: isGuest({ profileLoaded, hasProfile: !!profile }) });
    if (gate.block) {
      // Remember the question (last one wins) so it runs once, after sign-in.
      writePending(trimmed, source, Date.now());
      setMessages((m) => [...m, aMsg(gate.reply, { signInLink: true, skipHistory: true, question: trimmed })]);
      return null;
    }

    if (feedbackAsk) {
      setMessages((m) => [...m, aMsg(FEEDBACK_REPLY, { feedbackLink: true, skipHistory: true })]);
      return null;
    }

    if (recapAsk) {
      // "How did today go?" / "How'd I do this week?": answered from the owner's
      // own rows, no AI call. A failed read says so; it never posts a card of zeros.
      const rows = await loadRecapRows(supabase);
      if (!rows) {
        setMessages((m) => [...m, aMsg('I couldn’t read your numbers just now. Check your connection and ask again.', { skipHistory: true })]);
        return null;
      }
      const model = buildRecap({ now: new Date(), kind: recapAsk, mode: 'now', ...rows });
      setMessages((m) => [...m, aMsg(model.title, { recapCard: model, skipHistory: true })]);
      return null;
    }

    if (commandAsk) {
      setMessages((m) => [...m, aMsg(COMMAND_LEAD, { commandCard: true, skipHistory: true })]);
      if (source === 'voice') {
        // Voice asks the same question; the answer is spoken, like any reply.
        cancelSpeechRef.current?.();
        cancelSpeechRef.current = speak(COMMAND_LEAD);
      }
      return null;
    }

    // Locked conversation (Commit B/C, live flow): the linked invoice has left
    // 'draft' — most commonly it was just sent, and finishFinalize now KEEPS the
    // conversation linked and locked instead of resetting it. Refuse any further
    // message here so /api/parse is never called and no new card is rebuilt from
    // the prior transcript (the reported near-duplicate #21 bug). Revise makes an
    // editable copy; a new chat starts a new job. Runs before setFinished(false)
    // so the sent conversation stays marked finished (not re-archived as a draft).
    if (pendingInvoiceRef.current && isLockedStatus(linkedStatus)) {
      const label = formatDocNumber(docKind(draft), pendingInvoiceRef.current.no);
      // "Revise" is a real button on the card; make "New chat" a real control too
      // (action: 'new-chat' renders the button below the bubble) so the user
      // isn't sent hunting for the header compose icon. It fires the same reset.
      setMessages((m) => [...m, aMsg(
        docKind(draft) === 'quote'
          ? `${label} is ready to share. Tap Revise on the card to change it, or start a new job.`
          : `${label} is sent and locked. Tap Revise on the card to change it, or start a new job.`,
        { action: 'new-chat' }
      )]);
      return null;
    }

    setFinished(false); // a new message means a live conversation again

    // A bare affirmative ("yes", "send it") while the preview card is up sends
    // it. Voice users just say it; no tap needed (decision: button + text).
    if (draft && ready && isAffirmative(trimmed)) {
      voiceFinalizeRef.current = source === 'voice';
      try {
        await finalize(true); // internal: we already hold the turn, skip its guard
      } finally {
        voiceFinalizeRef.current = false;
      }
      return null;
    }

    // ═══ Slice 2 router ═══
    // One small model call decides what this message IS. `bypass` means it is
    // never asked at all — a staged receipt, an answer to an open question
    // ("$40"), a dictated follow-up inside a job — and those go straight to
    // /api/parse exactly as before. A timeout, an error, bad output or the flag
    // being off falls back to the pre-Slice-2 regex gate and then parse, so a
    // broken router can only cost a question, never an invoice. 'unsupported' is
    // answered here from the server's shared copy; it never reaches /api/parse.
    const bypass = bypassReason({
      // Photos never enter send(): the attachment handler posts them to
      // /api/parse-receipt directly, so this guard is for a staged receipt only.
      imageAttached: false,
      clarificationOpen: clientQuestionOpen || Boolean(draft && looksLikeAnswer(trimmed)),
      voiceFollowUp: source === 'voice' && Boolean(draft),
    });
    // Phase already reads "thinking" from the top of send(), so the pending state
    // is on screen before this await; sendRef keeps a rage-tap to one request.
    const asked = bypass || !AI_TOOLS ? null : await classifyTurn(trimmed, turnId);
    const decision = decideRoute({
      flagOn: AI_TOOLS,
      bypass,
      classified: asked?.route ?? null,
      text: trimmed,
    });
    if (decision.route === 'unsupported') {
      const reply = asked?.reply ?? UNSUPPORTED_REPLY;
      setMessages((m) => {
        // Account talk stays out of the job history parse reads later.
        const at = m.map((x) => x.role === 'user' && x.content === trimmed).lastIndexOf(true);
        const marked = at < 0 ? m : m.map((x, i) => (i === at ? { ...x, skipHistory: true as const } : x));
        return [...marked, aMsg(reply, unsupportedReplyExtras())];
      });
      if (source === 'voice') {
        cancelSpeechRef.current?.();
        cancelSpeechRef.current = speak(reply);
      }
      return null;
    }
    // 'ask' keeps the old block below: it owns the signed-out, rate-limited and
    // feature-off outcomes, and a 404 still falls through to the parse path.
    if (decision.route === 'ask') {
      const out = await askQuestion(trimmed, fetch, turnId);
      if (out.kind !== 'off') {
        if (out.kind === 'ok' || out.kind === 'signed-out') {
          // A card is kept only when it can be drawn; otherwise the server's plain
          // fallback is the answer (never a makeshift card). `reply` is what voice speaks.
          const card = out.kind === 'ok' && resolveTemplate(out.template) ? out.template : undefined;
          const replyMsg = out.kind === 'ok' && (card || out.fallback)
            ? aMsg(card ? out.reply : (out.fallback as string), {
                skipHistory: true,
                ...(card ? { template: card, ...(out.fallback ? { fallbackText: out.fallback } : {}), ...(out.destination ? { destination: out.destination } : {}) } : {}),
              })
            : aMsg(out.reply, { skipHistory: true });
          setMessages((m) => {
            // Keep the Q&A out of the job history parse reads later.
            const at = m.map((x) => x.role === 'user' && x.content === trimmed).lastIndexOf(true);
            const marked = at < 0 ? m : m.map((x, i) => (i === at ? { ...x, skipHistory: true as const } : x));
            return emitResult(marked, replyMsg, retryId);
          });
          if (out.kind === 'ok' && source === 'voice') {
            cancelSpeechRef.current?.();
            cancelSpeechRef.current = speak(out.reply);
          }
          return out.kind === 'ok' ? { reply: out.reply, ready: false } : null;
        }
        // A failure names its cause and reuses the failed bubble: a repeat
        // failure of a retry leaves the existing one instead of stacking another.
        if (!retryId) setMessages((m) => [...m, aMsg(
          out.kind === 'network'
            ? (navigator.onLine ? "Connection hiccup — that didn't go through." : "You're offline — that didn't send.")
            : out.reply,
          { failed: { op: 'send', text: trimmed } },
        )]);
        return null;
      }
    }

    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Role + text only: a receipt bubble's photo stays on the device;
        // quiet usage lines are never sent as history.
        body: JSON.stringify({ history: next.slice(1).filter((m) => !m.quiet && !m.skipHistory).map(({ role, content }) => ({ role, content })), draft }),
      });
      const data = await res.json();
      if (res.status === 401 && data.authRequired) {
        // Board L2: a card with a Sign in button, not an auto-redirect. The draft
        // and the controls stay as they were until the user chooses.
        setSignInAsk({ kind: 'send', headline: data.reply });
        return null;
      }
      // Paying is not a document (item 5). The parser only PROPOSES: the card
      // below has no write path until the owner taps Confirm, and every field
      // on it is editable. Returning here keeps a payment out of the draft, the
      // totals and the duplicate check entirely.
      if (data.intent === 'record_payment') {
        const reply = typeof data.reply === 'string' && data.reply.trim() ? data.reply : 'Got it. Check this payment.';
        setMessages((m) => emitResult(m, aMsg(reply), retryId));
        if (source === 'voice') {
          cancelSpeechRef.current?.();
          cancelSpeechRef.current = speak(reply);
        }
        // The model's fields win only where present; the words fill the rest, so
        // a model miss cannot invent money. The card shows the result either way.
        const fromWords = {
          amount: parseAmount(trimmed),
          method: parseMethod(trimmed),
          paidOn: parsePaidOn(trimmed, new Date()),
          clientName: (data.payment?.client_name as string | null | undefined) ?? null,
        };
        const amount = typeof data.payment?.amount === 'number' ? data.payment.amount : fromWords.amount;
        const method = (data.payment?.method as PaymentMethod | null | undefined) ?? fromWords.method;
        if (!looksLikePayment(trimmed, { amount, method })) {
          setMessages((m) => [...m, aMsg("Did someone pay you? Name the client and how much, and I'll set it up for you to confirm.")]);
          return { reply, ready: false };
        }
        const { data: { user: payerUser } } = await getSharedUser();
        if (!payerUser) {
          setMessages((m) => [...m, aMsg('Sign in and I can record that payment.')]);
          return { reply, ready: false };
        }
        try {
          const { data: rows } = await supabase
            .from('invoices')
            .select('id, invoice_number, client_name, total, amount_paid, kind, created_at')
            .eq('user_id', payerUser.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
            .limit(200);
          const openInvoices = ((rows ?? []) as Array<Record<string, unknown>>)
            .filter((r) => String(r.kind ?? 'invoice') === 'invoice' && Number(r.amount_paid ?? 0) < Number(r.total ?? 0))
            .map((r) => ({
              id: String(r.id),
              invoiceNo: r.invoice_number == null ? null : Number(r.invoice_number),
              clientName: String(r.client_name ?? ''),
              total: Number(r.total ?? 0),
              amountPaid: Number(r.amount_paid ?? 0),
              kind: 'invoice' as const,
              createdAt: String(r.created_at ?? ''),
            }));
          const resolution = resolvePayment({ parsed: fromWords, invoices: openInvoices });
          // The picker shows this client's open invoices; with no client match
          // it falls back to what is actually open, so the owner chooses rather
          // than us picking someone else's invoice.
          const choices = resolution.invoiceChoices.length > 0 ? resolution.invoiceChoices : openInvoices;
          const candidateInvoices: ProposalInvoice[] = choices.slice(0, 8).map((i) => ({
            id: i.id, invoiceNo: i.invoiceNo, clientName: i.clientName, total: i.total, amountPaid: i.amountPaid,
          }));
          setMessages((m) => [...m, aMsg('Check this and confirm.', {
            payProposal: {
              amount,
              method,
              clientName: resolution.clientName ?? '',
              paidOn: fromWords.paidOn ?? localDateString(new Date()),
              invoiceId: resolution.invoice?.id ?? null,
              invoices: candidateInvoices,
              clients: resolution.clientChoices,
            },
          })]);
        } catch (e) {
          console.error('[payment] could not build the proposal', e);
          setMessages((m) => [...m, aMsg("I couldn't line that up with an invoice. Tell me the client and the amount.")]);
        }
        return { reply, ready: false };
      }

      // Point 2: the parsed result.
      traceTurn(turnId, 'parsed', {
        intent: data.intent ?? null,
        intent_explicit: data.intent_explicit ?? null,
        ready: Boolean(data.ready),
        // The warning text names the client — presence only by default.
        duplicateWarning: redactPresence(data.duplicateWarning),
      });
      // The duplicate warning is now a passive card badge (see duplicateHint),
      // not a spoken/blocking reply — so the reply is always the normal one.
      // Over the free cap? The model's reply ("You're all set") can't know, and
      // nothing is saved until Send/Save, so it must not claim success. Checked
      // only for a capped tier's new, ready invoice or estimate, or a complete
      // expense; fails open like the Send gate.
      const effIntent = data.intent_explicit === false && draft?.intent ? draft.intent : data.intent;
      const isReady = Boolean(data.ready) && data.intent !== 'expense';
      const expenseComplete = data.intent === 'expense' && typeof data.expense?.amount === 'number' && data.expense.amount > 0;
      const cappedTier = PAYWALL_ENABLED && !!profile && !UNLIMITED_TIERS.has(profile.access_tier ?? 'free');
      const readyDoc = isReady && (effIntent === 'invoice' || effIntent === 'quote') && !pendingInvoiceRef.current;
      let overCap: null | 'invoice' | 'expense' | 'estimate' = null;
      if (cappedTier && (readyDoc || expenseComplete)) {
        try {
          const gate = await (await fetch('/api/access')).json();
          if (expenseComplete) {
            if (gate?.canExpense === false) overCap = 'expense';
          } else if (effIntent === 'quote') {
            if (gate?.canEstimate === false) overCap = 'estimate';
          } else if (gate?.hasAccess === false) {
            overCap = 'invoice';
          }
          if (overCap) {
            const limit = overCap === 'invoice' ? gate.invoiceLimit : overCap === 'estimate' ? gate.estimateLimit : gate.expenseLimit;
            data.reply = overCapReply(overCap, limit);
          }
        } catch { /* unreachable — fail open, keep the model's reply */ }
      }
      const reply: string = data.reply ?? 'Say that again?';
      const replyMsg = aMsg(reply);
      setMessages((m) => emitResult(m, replyMsg, retryId));
      // Text renders first (above); speech is additive and follows the input
      // modality of THIS message — voice in, voice out; typed in, silent.
      if (source === 'voice') {
        cancelSpeechRef.current?.();
        cancelSpeechRef.current = speak(reply);
      }
      // A duplicate no longer forces the card closed — it shows, ready and
      // actionable, with a passive badge (duplicateHint) instead of a prompt.
      if (data.intent) {
        // The AI's own output for contact, BEFORE we enrich — it's either what
        // the user spoke this turn or a value carried through the draft.
        const aiAddress = data.client_address ?? null;
        const aiPhone = data.client_phone ?? null;
        const aiEmail = data.client_email ?? null;
        // No stored client email is merged here (clients.email is not wired):
        // keep one already on the draft when this turn did not state it.
        data.client_email = aiEmail ?? draft?.client_email ?? null;
        // Returning client? Pull the address/phone we already have on file so a
        // repeat customer never re-enters them — and the confirmation gate sees
        // them as present. Anything the user stated THIS turn wins over the
        // stored value; signed-in users only (guests have no client records).
        if (profile && data.client_name && (data.intent === 'invoice' || data.intent === 'quote')
          && (aiAddress == null || aiPhone == null)) {
          const { data: known } = await supabase
            .from('clients')
            .select('address, phone')
            .eq('user_id', profile.id)
            // Exact match on the case-insensitive key (an ilike pattern would
            // treat % and _ in a name as wildcards).
            .eq('name_key', clientNameKey(data.client_name))
            .limit(1)
            .maybeSingle();
          if (known) {
            data.client_address = aiAddress ?? known.address ?? null;
            data.client_phone = aiPhone ?? known.phone ?? null;
          }
        }
        // Snapshot the AI's descriptions for THIS parse before the user can edit
        // them on the card, so finalize can tell edited from unedited (per line).
        originalDescriptionsRef.current = Array.isArray(data.line_items)
          ? (data.line_items as LineItem[]).map((li) => li.description)
          : [];
        // Intent is re-emitted fresh on every parse. When the user did NOT name
        // the document type this turn (intent_explicit false), keep the
        // in-progress draft's intent so a bare "send it" or "just make it"
        // can't silently flip a quote into an invoice.
        // Intent preservation (as before): keep the in-progress draft's intent
        // when the user didn't name a document type this turn.
        const base: Partial<ExtractResult> =
          data.intent_explicit === false && draft?.intent
            ? { ...data, intent: draft.intent }
            : { ...data };

        // Card-set fields the parse result doesn't reliably carry. The model
        // reports these ONLY for what THIS message said, so we merge rather than
        // replace — otherwise the whole-draft swap silently wiped a deposit or
        // note set on the card the moment the next chat message parsed.
        //   deposit_type: null → not mentioned, keep the draft's; 'none' → the
        //     user declined a deposit, clear it; 'percentage'/'fixed' + a value
        //     > 0 → stated, set it. (A bare type with no usable value is treated
        //     as unstated — never guess, and never let a model echo of the
        //     draft's type without its value zero out the amount.)
        //   notes: null → not mentioned, keep; '' → explicitly removed, clear;
        //     any other string → set.
        const dDepType = (data as { deposit_type?: unknown }).deposit_type;
        const dDepVal = Number((data as { deposit_value?: unknown }).deposit_value);
        const depositStated =
          dDepType === 'percentage' || dDepType === 'fixed'
            ? Number.isFinite(dDepVal) && dDepVal > 0
            : dDepType === 'none';
        const mergedDraft = {
          ...base,
          deposit_type: depositStated
            ? (dDepType as DepositType)
            : (((draft as { deposit_type?: DepositType } | null)?.deposit_type) ?? 'none'),
          deposit_value: depositStated
            ? (dDepType === 'none' ? null : dDepVal)
            : (((draft as { deposit_value?: number | null } | null)?.deposit_value) ?? null),
          notes:
            data.notes == null
              ? (draft?.notes ?? null)
              : (typeof data.notes === 'string' && data.notes.trim() === '' ? null : data.notes),
          // Owner-only notes from a pasted work card: same merge rule.
          private_notes:
            data.private_notes == null
              ? (draft?.private_notes ?? null)
              : (typeof data.private_notes === 'string' && data.private_notes.trim() === '' ? null : data.private_notes),
        } as Partial<ExtractResult>;

        // Commit B lock: the linked invoice has left 'draft' (sent/paid) and is
        // read-only. Refuse a chat edit that would change it — but let a no-op
        // parse (a question that reproduces the same draft) through silently, so
        // "what's the total?" still works. Revising is offered on the card.
        if (pendingInvoiceRef.current && isLockedStatus(linkedStatus) && draft
          && draftFingerprint(draft) !== draftFingerprint(mergedDraft)) {
          setMessages((m) => [...m, aMsg(lockEditNotice(linkedStatus, linkedAmountPaid, docKind(draft)))]);
          return { reply, ready: isReady };
        }

        // Change guard (Commit A): one conversation = one invoice. Once a row is
        // linked (first save done), a parse that would change the client or
        // replace every line item is most likely a NEW job spoken into the same
        // chat — applying it would rewrite the saved invoice. Hold it and ask;
        // the buttons (below the card) resolve it. The heuristic only raises the
        // question — it never rotates the conversation or drops the link itself.
        if (pendingInvoiceRef.current && draft && wouldReplaceInvoice(draft, mergedDraft)) {
          setPendingChange({
            no: pendingInvoiceRef.current.no,
            kind: docKind(draft),
            draft: mergedDraft,
          });
          setMessages((m) => [...m, aMsg(
            `This would change ${formatDocNumber(docKind(draft), pendingInvoiceRef.current!.no)}. Update it, or start a new invoice?`
          )]);
          // Leave the current draft/card untouched until the user decides.
          return { reply, ready: isReady };
        }

        setDraft((prev) => {
          if (prev) {
            setDraftHistory((hist) => [...hist.slice(-19), prev]);
          }
          return mergedDraft;
        });
        // The card moves under this reply when the reply changed the draft (or
        // the card is appearing now). A no-op parse ("what's the total?") leaves
        // it where it is. Over the cap it always moves: asking again after the
        // wall (often the same job) must put the unsent card right under the
        // reply, where the next Send tap reopens the wall.
        if (overCap || !draft || !ready || draftFingerprint(draft) !== draftFingerprint(mergedDraft)) {
          setCardAfterId(replyMsg.id);
        }
        // NOTE: pendingInvoiceRef is deliberately NOT cleared here anymore. One
        // conversation = one invoice, so an ordinary edit keeps the link and the
        // next finalize UPDATES the same row (the P1 fix). A genuinely new
        // document comes only from the new-chat button or the change guard above.
        // Only a real parse result moves the card in or out of "ready". A
        // no-intent response (rate limit, a transient error, a bare reply)
        // leaves the current preview intact instead of collapsing it.
        setReady(isReady);
        // The card is appearing now (not an edit to one already up), or moving
        // under an over-cap reply: build it in.
        if (isReady && (overCap || !(ready && draft))) playCardAnim('enter', 1800);
        // Reflect the server's duplicate signal as a passive card badge. Set on
        // every parse (self-clearing), never a blocking prompt.
        setDuplicateHint(Boolean(data.duplicateWarning));
        // The card is appearing now (it wasn't up before this parse): post the
        // non-blocking summary under it. A contact field counts as "saved" when
        // the AI produced nothing for it and we filled it from the record above.
        // Later edits don't repeat it; the card itself shows the changes.
        if (isReady && !(ready && draft) && (mergedDraft.intent === 'invoice' || mergedDraft.intent === 'quote')) {
          const summary = cardSummary(
            mergedDraft,
            aiAddress == null && !!mergedDraft.client_address,
            aiPhone == null && !!mergedDraft.client_phone,
          );
          setMessages((m) => [...m, aMsg(summary)]);
        }
      }

      // Expenses used to insert silently here, with the user never seeing what
      // got saved or able to correct it. They now go to the SAME confirmation
      // card as a photographed receipt — one review step, one save.
      // No amount yet means the AI is still asking for it; leave the card shut.
      if (data.intent === 'expense' && data.expense && typeof data.expense.amount === 'number' && data.expense.amount > 0) {
        setReceipt(null); // a typed expense carries no photo
        setExpenseDraft({
          amount: data.expense.amount,
          category: isExpenseCategory(data.expense.category) ? data.expense.category : 'other',
          vendor: typeof data.expense.vendor === 'string' ? data.expense.vendor : null,
          occurred_on: typeof data.expense.occurred_on === 'string' ? data.expense.occurred_on : today(),
        });
        setExpenseError(null);
      }
      return { reply, ready: isReady };
    } catch {
      // Repeat failure of a retry leaves the existing failed bubble (and its
      // button) in place — don't stack a second error.
      if (!retryId) setMessages((m) => [...m, aMsg(
        navigator.onLine
          ? "Connection hiccup — that didn't go through."
          : "You're offline — that didn't send. Your work is saved.",
        { failed: { op: 'send', text: trimmed } },
      )]);
      return null;
    }
    } finally {
      sendRef.current = false;
      setPhase(null);
    }
  }

  // ── Finalize: save → render → PDF → share sheet ─────────────
  const theme: BrandTheme | null =
    profile?.background_color && profile.brand_colors.length >= 2
      ? buildTheme(
        profile.brand_colors,
        profile.background_color,
        profile.color_roles_explicit
          ? explicitColorRoles(profile.brand_colors, profile.background_color)
          : undefined,
      )
      : { background: '#FFFFFF', text: '#000000', primary: '#1A1A1A', accent: '#D4A017', heading: '#000000', surface: '#E6E6E6', muted: '#666666', rule: '#CCCCCC', accentInk: '#735c00' };

    function buildRenderData(invoiceNumber: number): InvoiceRenderData | null {
    if (!draft || !profile) return null;
    const items = (draft.line_items ?? []) as LineItem[];
    const taxRate = draft.tax_rate ?? 0;

    // One math path for card, saved row, and PDF (Jules F4). subtotal, tax, and
    // total all come from calculateInvoiceTotals — the SAME helper the preview
    // card (previewTotals) and Commit E's Subtotal/Tax rows use — instead of a
    // second inline formula that could drift a sub-cent from what's on screen.
    // The draft stores deposit_type / deposit_value (snake_case DB columns);
    // InvoiceRenderData reads camelCase and needs the derived figures too.
    const depositType = ((draft as any).deposit_type as DepositType) ?? 'none';
    const depositValue = Number((draft as any).deposit_value ?? 0);
    const totals = calculateInvoiceTotals(items, taxRate, depositType, depositValue);
    const { subtotal, taxAmount, total } = totals;
    if (!Number.isFinite(subtotal) || !Number.isFinite(total)) return null;
    const hasDeposit = totals.depositAmount > 0;

    return {
      kind: docKind(draft),
      invoiceNumber,
      businessName: profile.business_name,
      logoUrl: profile.logo_url,
      websiteUrl: profile.website_url,
      businessPhone: profile.business_phone ?? null,
      businessEmail: profile.business_email ?? null,
      slogan: profile.slogan,
      clientName: draft.client_name ?? 'Client',
      clientAddress: draft.client_address ?? null,
      clientPhone: draft.client_phone ?? null,
      clientEmail: draft.client_email ?? null,
      lineItems: items,
      subtotal, taxRate, taxAmount,
      total,
      depositType: hasDeposit ? (depositType as 'percentage' | 'fixed') : 'none',
      depositValue: hasDeposit ? depositValue : undefined,
      depositAmount: hasDeposit ? totals.depositAmount : undefined,
      remaining: hasDeposit ? totals.remaining : undefined,
      amountDueNow: totals.amountDueNow,
      notes: draft.notes ?? null,
      // A chat document is always unsent here, so it carries the current terms;
      // the send route freezes them onto the row.
      terms: profile.terms ?? null,
      // Both dates go through formatDate() so issued and due read as one format
      // (M/D/YYYY) on the PDF — Jules F8. These are display strings; the ISO
      // due_date written to the DB is set separately in finalize().
      issuedDate: formatDate(new Date()),
      // No stated due date → default to issue date + 30 days. The AI never
      // asks for one; the user can still edit it on the invoice detail page.
      dueDate: formatDate(draft.due_date ?? defaultDueDate()),
      cashappTag: profile.cashapp_tag,
      paypalMe: profile.paypal_me,
      venmoUsername: profile.venmo_username,
      // Live, like Zelle; the template shows it only when payUrl is set (send).
      cardAvailable: cardAvailableFor(profile, connectOn),
      // Flag only; the bank details stay on the pay page, never on the PDF.
      bankTransferAvailable: profile?.bank_transfer_enabled === true,
    };
  }

  const [renderData, setRenderData] = useState<InvoiceRenderData | null>(null);
  // Free-tier cap hit: which wall to show (invoice or expense), or none.
  const [paywallFor, setPaywallFor] = useState<null | PaywallVariant>(null);
  // "1 of 3 free invoices used" under the card after a free-tier invoice is
  // saved (lib/usage.ts), plus the 2-of-3 upgrade nudge (lib/soft-prompts.ts)
  // when that moment is due. Tied to the invoice row so it never outlives it.
  const [invoiceUsage, setInvoiceUsage] =
    useState<{ id: string; text: string; nudge?: SoftPrompt } | null>(null);
  // Back from Stripe Checkout (?upgraded=1): remember it so the gates below
  // wait out the webhook instead of re-showing the wall.
  useEffect(() => {
    if (!active) return;
    noteUpgradeReturn();
  }, [active]);

  /** The card summary, posted once when the card first appears: what we have,
   *  any contact pulled from the saved client record (so a stale one can be
   *  caught), and what's still missing. Information only — it never gates the
   *  send; the one-tap send works immediately. Plain sentences, no lists. */
  function cardSummary(d: Partial<ExtractResult>, savedAddress: boolean, savedPhone: boolean): string {
    const items = (d.line_items ?? []) as LineItem[];
    const depositType = ((d as any).deposit_type as DepositType) ?? 'none';
    const depositValue = Number((d as any).deposit_value ?? 0);
    const totals = calculateInvoiceTotals(items, d.tax_rate ?? 0, depositType, depositValue);
    const kind = docNoun(docKind(d)).toLowerCase();
    const who = d.client_name ?? 'this client';
    const out: string[] = [
      totals.depositAmount > 0
        ? `Here's your ${kind} for ${who}: ${money(totals.total)} total, ${money(totals.depositAmount)} deposit due now.`
        : `Here's your ${kind} for ${who}: ${money(totals.total)}.`,
    ];

    const saved: string[] = [];
    if (savedAddress && d.client_address) saved.push(`the address ${d.client_address}`);
    if (savedPhone && d.client_phone) saved.push(`the phone number ${d.client_phone}`);
    if (saved.length) out.push(`I'm using ${saved.join(' and ')} from last time — tell me if that's changed.`);

    const missing: string[] = [];
    if (!d.client_address) missing.push('an address');
    if (!d.client_phone) missing.push('a phone number');
    if (missing.length) out.push(`I don't have ${missing.join(' or ')} yet — want to add ${missing.length > 1 ? 'either' : 'it'}?`);

    out.push(`Say "send it" when you're ready, or tell me what to change.`);
    return out.join(' ');
  }

  // Write the current conversation + finalize progress (inserted row, sent flag)
  // to the store immediately. Called at the two points a ref changes without a
  // state update — after the insert and after mark-sent — so a suspend right
  // then still resumes with the right progress. Twin of the persist effect.
  function persistProgress() {
    try {
      const ns = storageNsRef.current;
      if (!ns) return;
      const payload: StoredChat = {
        version: STORE_VERSION,
        id: convoId, messages, draft, ready,
        pendingInvoice: pendingInvoiceRef.current,
        finalizeSent: finalizeSentRef.current,
        linkedStatus,
        linkedAmountPaid,
        cardAfterId,
        updatedAt: Date.now(),
      };
      writeStoredChat(ns, payload);
      appliedUpdatedAtRef.current = payload.updatedAt;
    } catch { /* storage blocked — the persist effect retries on the next change */ }
  }

  // Shared completion tail: append the done message and archive the finished
  // conversation to history. It no longer resets the chat — one conversation =
  // one invoice, so after a send the conversation STAYS linked to its now-sent
  // row and shows a locked card (with Revise). Any further message is refused in
  // send(). Used by a normal finalize and by an idempotent resume that finds the
  // invoice already sent.
  // `tip` is the one card this send won from lib/tip-arbiter (or null). It only
  // arbitrates: the payouts nudge still checks its own conditions below.
  function finishFinalize(doneMsg: Msg, retryId?: string, tip?: Tip | null) {
    // Point 4: the final confirmation string — summarized like the input, since
    // it embeds the client name; raw text only under NEXT_PUBLIC_TRACE_VERBOSE.
    traceTurn(turnIdRef.current, 'confirm', { ...redactText(doneMsg.content) });
    // A template send (2·12b) adds the user-turn summary bubble first, as a real
    // message, so history and recaps read the same as a chat-made document.
    const summary = template && draft && !retryId ? uMsg(templateSummary(draft), 'typed') : null;
    // On a finalize retry the done message replaces the failed bubble in place,
    // so neither the transcript nor the archived history keeps a dead error.
    // An estimate says nothing after its card: nothing has gone to the client
    // until the owner copies or shares the link, and the locked card already
    // carries the link, Copy link and Share. So no confirmation bubble, no sent
    // chip, no tips; a failed-send bubble being retried is simply removed.
    const isEstimate = !!draft && docKind(draft) === 'quote';
    // A stale failed-send bubble from an earlier tap is dropped once a send lands
    // (the one being retried is replaced in place below).
    const live = clearFailures(messages, 'finalize', retryId);
    const base = summary ? [...live, summary] : live;
    const archived = isEstimate
      ? (retryId ? base.filter((m) => m.id !== retryId) : base)
      : emitResult(base, doneMsg, retryId);
    // Sent invoice summary card + optional payouts nudge — appended after the
    // done message so they appear right below the confirmation bubble.
    // Only for invoices/quotes (not downloads), and only when a real invoice number
    // is known. The payouts nudge fires when Connect is on but the pro has no
    // payment processor connected yet — one tap takes them to /settings/payouts.
    const pi = pendingInvoiceRef.current;
    const sentKind = draft ? docKind(draft) : null;
    const withCards: Msg[] = (() => {
      if (!pi || !draft || !sentKind || isEstimate) return archived;
      const items = (draft.line_items ?? []) as LineItem[];
      const taxRate = draft.tax_rate ?? 0;
      const depositType = ((draft as any).deposit_type as DepositType) ?? 'none';
      const depositValue = Number((draft as any).deposit_value ?? 0);
      const totals = calculateInvoiceTotals(items, taxRate, depositType, depositValue);
      const cardMsg = aMsg('', {
        sentCard: {
          clientName: draft.client_name ?? 'Client',
          invoiceNo: formatDocNumber(sentKind, pi.no),
          amount: money(totals.amountDueNow),
          dueDate: formatDate(draft.due_date ?? defaultDueDate()),
          kind: sentKind,
        },
      });
      const result: Msg[] = [...archived, cardMsg];
      // Nudge only when this send's arbitration picked payouts, Connect is on, no
      // payment processor is set up, and the user hasn't dismissed it before.
      // Invoices only: the tip is about getting paid, which an estimate isn't.
      if (tip === 'payouts' && sentKind === 'invoice' && connectOn && profile && !cardAvailableFor(profile, connectOn) && !payoutsNudgeDismissed) {
        result.push(aMsg('', { payoutsNudge: true }));
      }
      return result;
    })();
    setMessages(withCards);
    // Archive to history as sent. draft:null / ready:false is what the history
    // list stores; reopening rebuilds the locked card from the DB row (Commit B).
    pushHistory(storageNsRef.current ?? 'guest', {
      id: convoId || genId(),
      title: convoTitle(messages, draft),
      date: Date.now(),
      finalized: true,
      messages: archived,
      draft: null,
      ready: false,
      cardAfterId,
    });
    // KEEP the link and the draft: pendingInvoiceRef, convoId, and draft stay so
    // the conversation shows the sent invoice as a locked, read-only card with
    // Revise — the fix for the post-send near-duplicate. finalizeSent is cleared
    // (the send is done; the lock, not this flag, guards against re-finalize).
    finalizeSentRef.current = false;
    preBuiltRef.current = null;     // the send is done; drop the pre-built file
    preBuildIdRef.current++;        // invalidate any in-flight prepare's stash
    setDraftHistory([]);            // no undo on a sent card
    setReady(true);                 // show the (locked) card
    setPendingChange(null);
    setLinkedStatus('sent');        // locks the card; enables Revise (unpaid)
    setLinkedAmountPaid(0);
    setRenderData(null);
    playCardAnim('lock', 1200);     // chip springs in, padlock settles (MOTION-SPEC §4)
    if (summary) setCardAfterId(summary.id); // the sent card sits under its summary    // Sent: the builder's job is done — but it morphs into the card first
    // (design 1a/1b). Nothing about the send changes here: this is after the
    // server confirmed, and the builder is only held on screen for the beat.
    if (template) {
      setMorphing(true);
      clearTimeout(morphTimerRef.current);
      morphTimerRef.current = setTimeout(() => {
        dropTemplate();
        setMorphing(false);
      }, 700);
    }
    // Count each line's item for saved products (fire-and-forget; never blocks
    // or changes the send); it returns the save-prompt candidates (2·13).
    // Template sends only for now: chat lines carry the AI's free-form wording,
    // which would fill Products' "used before" with sentences (PUNCH-LIST).
    const sentLines = ((draft?.line_items ?? []) as LineItem[]);
    const productNames: PromiseLike<unknown> = template && profile && sentLines.length
      ? supabase.rpc('record_product_use', {
        p_items: sentLines.slice(0, 50).map((li) => ({ name: li.description, unit: li.unit ?? null, unit_price: li.unit_price })),
      }).then(({ data }) => data, () => null)
      : Promise.resolve(null);
    // Save prompts (2·13) — after the share, never inside its gesture; signed
    // in only (guests have no rows).
    if (profile && draft?.client_name) void queueSavePrompts(String(draft.client_name), sentLines, productNames);
    // finished=true keeps this conversation from being re-archived as a draft by
    // a later new-chat / history-open. It is NOT cleared from storage: because
    // it's locked (linkedStatus='sent'), the persist effect keeps it, so a reload
    // restores the locked card + Revise and keeps refusing edits (v5 StoredChat).
    // The "New chat" button still resets to a fresh conversation.
    setFinished(true);
  }

  // `internal` is true when send() delegates here after an affirmative — it has
  // already claimed the turn (phase set), so we skip the direct-entry guard to
  // avoid self-blocking. A direct card tap passes nothing → guard applies. Phase
  // is cleared in the one outer finally (unless a redirect path left it set).
  // A stable fingerprint of everything the invoice PDF renders from, so a
  // pre-built file can be matched to the current on-screen draft. If they differ
  // at send time the file is stale and press 2 falls back to the link share.
  const draftSignature = (d: NonNullable<typeof draft>): string => {
    const r = d as Record<string, unknown>;
    return JSON.stringify({
      kind: docKind(d),
      no: pendingInvoiceRef.current?.no ?? null,
      client: [r.client_name ?? null, r.client_address ?? null, r.client_phone ?? null, r.client_email ?? null],
      items: r.line_items ?? null,
      tax: r.tax_rate ?? null,
      depType: r.deposit_type ?? null,
      depVal: r.deposit_value ?? null,
      notes: r.notes ?? null,
      due: r.due_date ?? null,
      // Attachments change the PDF (extra pages), so they belong in the
      // signature: adding/removing one invalidates a pre-built file.
      att: attachmentsRef.current.map((a) => a.id).join(','),
    });
  };

  // Pre-build the card's PDF as soon as the card renders, and rebuild it after
  // every edit/undo (any draft change moves the signature). Debounced; builds are
  // serialized (`preparing`) and wait while a turn holds `phase` — a later change
  // re-fires this. Signed-in only: a guest has no row to build against.
  useEffect(() => {
    if (!active || !ready || !draft || !profile) return;
    // An estimate shares a link, so there is no PDF worth building (§04).
    if (docKind(draft) === 'quote') return;
    // A restored S1b has nothing to share yet, so it needs a build even on a tier
    // that otherwise builds at the tap.
    if (skipPreBuild && !s1bNeedsFile) return;
    if (isLockedStatus(linkedStatus) || finalizeSentRef.current) return;
    if (phase !== null || preparing) return;
    if (prepState && prepState.sig === draftSignature(draft)) return;
    if (preBuildTimerRef.current) clearTimeout(preBuildTimerRef.current);
    preBuildTimerRef.current = setTimeout(() => { void finalize(true, undefined, 'prepare'); }, 400);
    return () => { if (preBuildTimerRef.current) clearTimeout(preBuildTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, draft, ready, profile, linkedStatus, phase, preparing, prepState, skipPreBuild, attachments, s1bNeedsFile]);

  // mode 'prepare': the background pre-build above — it runs the SAME persist +
  // PDF build as a send but, instead of sharing, stashes the File in preBuiltRef
  // for the send tap to attach synchronously. It never shares, marks sent, posts
  // a message, shows the paywall, or touches `phase` (so the composer stays
  // usable); a failure just records prepState 'failed'.
  async function finalize(internal = false, retryId?: string, mode: 'send' | 'download' | 'prepare' = 'send') {
    if (mode === 'prepare') {
      if (preparingRef.current || finalizeSentRef.current || isLockedStatus(linkedStatus) || !profile) return;
      // Estimates never build a PDF (they share a link), so a prepare can only
      // be a stray call from a card that just switched kind.
      if (draft && docKind(draft) === 'quote') return;
      // A restored S1b has nothing to share yet, so it needs a build even on a
      // tier that otherwise builds at the tap.
      if (skipPreBuild && !s1bNeedsFile) return;
      preparingRef.current = true;
      setPreparing(true);
      // The DB row is about to be rewritten from the current draft, so an older
      // stashed file may no longer match it. Drop it until this build lands.
      preBuiltRef.current = null;
    } else {
      // A client question is already waiting on its card: asking again would
      // repeat the message, the card and the speech. Do nothing.
      if (clientQuestionPending({ question: clientAskRef.current, convo: convoId || null, draftName: draft?.client_name })) {
        scrollToClientQuestion(); // a re-tap just shows the card that is already waiting
        return;
      }
      if (!internal && phase) return;
      // `phase` is state and lags a render, so two taps inside one frame both
      // read it as null. This ref flips synchronously: the second tap (or a typed
      // "send it" racing a tap) is ignored until the first one settles.
      if (finalizingRef.current) return;
      finalizingRef.current = true;
    }
    // A direct card tap (not delegated from a send()) is its own user action:
    // mint a fresh turn id so this finalize and finishFinalize trace under their
    // own id instead of inheriting the previous send()'s turn. An internal call
    // already carries the id from the send() that delegated here.
    if (!internal) turnIdRef.current = newTurnId();
    if (mode !== 'prepare') setPhase('building');
    // Latest-wins id for this build; a newer prepare supersedes an older one's stash.
    const buildId = mode === 'prepare' ? ++preBuildIdRef.current : 0;
    let prepared = false;
    let prepareDone: () => void = () => {};
    if (mode === 'prepare') preparePromiseRef.current = new Promise<void>((r) => { prepareDone = r; });
    try {
    if (!draft) return;

    // ── Fast path: attach the PRE-BUILT PDF via a SYNCHRONOUS share.
    // There must be NOTHING awaited between the tap and navigator.share() — the
    // pre-build already did all the slow work, so the tap's user activation is
    // still valid (iOS drops it after async work, and share() then throws
    // NotAllowedError). sharePdf() calls share() inside this same tick. A
    // stale/absent file (signature mismatch, unfinished build) skips to the slow
    // path below.
    if (
      mode === 'send' && profile && preBuiltRef.current &&
      preBuiltRef.current.signature === draftSignature(draft)
    ) {
      const pb = preBuiltRef.current;
      const kind = docKind(draft);
      const payUrl = kind === 'invoice' && pb.token ? `${window.location.origin}/pay/${pb.token}` : null;
      await settleShare(
        sharePdf(pb.file, shareText(docNoun(kind), draft.client_name ?? 'your client', payUrl)),
        pb,
        retryId,
      );
      return;
    }

    // A3 / B2: no profile in hand — decide WHY before doing anything.
    //  - fetch still in flight → don't bounce an authed user to login over a
    //    timing window; ask them to tap again in a moment.
    //  - fetch resolved with no profile → a genuine guest: friendly sign-in
    //    nudge (mirrors the parse route's 401 copy), THEN route to login.
    if (!profile) {
      if (mode === 'prepare') return;
      if (!profileLoaded) {
        setMessages((m) => [...m, aMsg('One sec — still loading your business info. Tap send again in a moment.')]);
        return;
      }
      setSignInAsk({ kind: 'send' });
      return;
    }

    // Paywall gate — only for a brand-new invoice. A retry of an already-created
    // draft (pendingInvoiceRef set, e.g. after a cancelled share) is exempt, so
    // we never block an invoice the user already made and is entitled to finish.
    // hasAccess() encodes the rules: founder/trialing/active/past_due pass;
    // free and canceled pass under the cap and are gated at/over it. The
    // server-side trigger enforces the same rules even if this gate is bypassed.
    // Fail OPEN if /api/access is unreachable — a transient blip must not block
    // a legitimate invoice (matches the rate-limiter's fail-open stance).
    // A send/download that lands while a pre-build is mid-flight (typed "send
    // it", Download) waits for it, so the two never write the row concurrently.
    if (mode !== 'prepare' && preparePromiseRef.current) await preparePromiseRef.current;

    // A new invoice is gated by hasAccess, a new estimate (kind 'quote') by
    // canEstimate — for every tier the trigger caps, canceled included.
    if (!pendingInvoiceRef.current) {
      const isEstimate = docKind(draft) === 'quote';
      const field = isEstimate ? 'canEstimate' : 'hasAccess';
      try {
        let gate = await (await fetch('/api/access')).json();
        // Just back from Checkout? The webhook may not have landed yet: give it
        // a few seconds before showing the wall again (lib/upgrade-return).
        if (gate && gate[field] === false && recentlyUpgraded()) {
          gate = (await waitForAccess((a) => a[field] === true)) ?? gate;
        }
        if (gate && gate[field] === false) {
          if (mode !== 'prepare') setPaywallFor(isEstimate ? 'estimate' : 'invoice'); // the send tap shows it
          return;
        }
      } catch { /* access check unreachable — fail open, allow the document */ }
    }

    try {
      // ── 1. Persist the invoice as a DRAFT (not "sent" until it actually is).
      //    First save INSERTS; every later save in the same conversation UPDATES
      //    that same row in place, so an edit made after the first Download/Send
      //    actually reaches the DB (the P1 bug fix). The row is identified by
      //    pendingInvoiceRef, which now survives ordinary edits — one conversation
      //    = one invoice; a new document comes only from the new-chat button or
      //    the change guard. buildRenderData(no) reuses the stashed number.
      let invoiceId = pendingInvoiceRef.current?.id ?? null;
      let no = pendingInvoiceRef.current?.no ?? null;
      // The row's public pay token, captured from whichever persistence await runs
      // below (insert / 23505-recovery / update) — NEVER a fresh fetch right before
      // the share, which would sit between the user's tap and navigator.share and
      // drop the transient user activation (share() then throws NotAllowedError).
      let publicToken: string | null = null;

      // buildRenderData needs a number to shape the payload; on the first insert
      // the real number is trigger-assigned and read back, so a 0 placeholder is
      // fine there. invoice_number is never written from here (pinned by
      // lock_document_identity on update, trigger-assigned on insert).
      const rd0 = buildRenderData(no ?? 0);
      if (!rd0) throw new Error('incomplete');

      // Remember contact on the client record for next time (idempotent upsert),
      // for both a fresh insert and an edit — a corrected address is stored too.
      // Only write a field we have: omitting a column leaves any stored value
      // intact, so an invoice that didn't restate the address never wipes one.
      // One service decides which client this is (lib/services/clients): an
      // exact case-insensitive name is the same client as before (address and
      // phone refreshed, nothing duplicated); close-but-not-exact ("Maria" vs
      // "Maria Gonzalez") PAUSES here and asks, creating nothing. A lookup
      // failure stays soft, as the old upsert's did: the invoice saves unlinked.
      let client: { id: string } | null = null;
      const typedKey = clientNameKey(rd0.clientName);
      try {
        const settled = resolvedClientRef.current;
        if (settled && settled.convo === (convoId || null) && settled.key === typedKey) {
          // Already resolved for this name: no re-matching on later edits.
          await updateClientContact(supabase, settled.id, { address: rd0.clientAddress, phone: rd0.clientPhone });
          client = { id: settled.id };
        } else {
          const forced = forceNewClientRef.current;
          const found = await matchOrCreateClient(
            supabase,
            profile.id,
            { name: rd0.clientName, phone: rd0.clientPhone, address: rd0.clientAddress },
            { createIfAmbiguous: !!forced && forced.convo === (convoId || null) && forced.key === typedKey },
          );
          if (found.status === 'ambiguous') {
            // The background pre-build never asks; the Send tap does.
            if (mode === 'prepare') return;
            const names = found.candidates.map((c) => c.name);
            const question = names.length === 1
              ? `I have ${names[0]} on file. Is this ${names[0]}, or a new client?`
              : `I have a few clients that match ${rd0.clientName}. Which one is it?`;
            clientAskRef.current = { typed: rd0.clientName, convo: convoId || null };
            setClientChoice({ typed: rd0.clientName, candidates: found.candidates, convo: convoId || null, fp: draftFingerprint(draft) });
            setMessages((m) => [...m, aMsg(question, { skipHistory: true })]);
            if (voiceFinalizeRef.current) {
              cancelSpeechRef.current?.();
              cancelSpeechRef.current = speak(question);
            }
            return; // outer finally clears phase; draft + ready untouched
          }
          if (found.status === 'matched' || found.status === 'created') {
            client = { id: found.client.id };
            resolvedClientRef.current = { id: found.client.id, key: typedKey, convo: convoId || null };
            forceNewClientRef.current = null;
          }
        }
      } catch (clientErr) {
        console.error('client match failed', clientErr);
      }

      // Record the AI's original wording on any line whose description the user
      // edited; an unedited line carries no original_description (null is the
      // positive signal). rd0.lineItems preserves draft order, so it aligns with
      // the parse-time snapshot. line_items stays writable while the row is a
      // draft (lock_line_items carve-out) and pins once it leaves draft.
      const lineItemsForSave = rd0.lineItems.map((li, idx) => {
        const original = originalDescriptionsRef.current[idx];
        return original != null && original !== li.description
          ? { ...li, original_description: original }
          : li;
      });

      // Shared draft-column payload for both insert and update — one source
      // (buildRenderData) so the stored row, the card, and the PDF can never
      // disagree. Excludes identity (invoice_number/kind — pinned by
      // lock_document_identity) and status (managed by the send step below).
      const draftCols = {
        client_name: rd0.clientName,
        // Snapshot contact onto the row — a later change to the client record
        // must not rewrite what this invoice actually went out with.
        client_address: rd0.clientAddress ?? null,
        client_phone: rd0.clientPhone ?? null,
        client_email: rd0.clientEmail ?? null,
        line_items: lineItemsForSave,
        subtotal: rd0.subtotal,
        tax_rate: rd0.taxRate,
        tax_amount: rd0.taxAmount,
        total: rd0.total,
        deposit_type: rd0.depositType ?? 'none',
        deposit_value: rd0.depositValue ?? null,
        deposit_amount: rd0.depositAmount ?? null,
        notes: rd0.notes,
        // Owner-only (pasted card names/narrative). Not in rd0: the PDF and
        // pay page never render it.
        private_notes: draft?.private_notes ?? null,
        // rd0.dueDate is now a formatted display string (M/D/YYYY, Jules F8);
        // the DB column is a `date`, so write the raw ISO value instead.
        due_date: draft?.due_date ?? defaultDueDate(),
      };

      if (!invoiceId) {
        // ── INSERT: first save of this conversation's invoice. The number is
        // assigned server-side by assign_document_number and read back — the
        // client never sends it, so it can't be forged and the sequence only
        // advances on a real insert.
        const { data: saved, error: insErr } = await supabase.from('invoices').insert({
          user_id: profile.id,
          client_id: client?.id ?? null,
          kind: rd0.kind,
          ...draftCols,
          status: 'draft', // becomes 'sent' only after a real share (B1)
          // Server-side idempotency key, unique per draft (the conversation id).
          // A resumed finalize whose local pendingInvoice was lost re-inserts
          // with the SAME key and hits the (user_id, finalize_key) unique index
          // instead of burning a second number — we read the existing row back
          // below. This is the durable guarantee a client-only guard can't give.
          finalize_key: convoId || null,
        }).select('id, invoice_number, public_token').single();

        // Point 3: the Supabase insert result — row id, or the error code.
        traceTurn(turnIdRef.current, 'finalize', {
          insertId: saved?.id ?? null,
          error: insErr ? (insErr.code ?? insErr.message ?? String(insErr)) : null,
        });

        let newId: string;
        let newNo: number;
        if (insErr || !saved?.id) {
          // Server-side cap (enforce_free_invoice_limit trigger). The /api/access
          // gate above normally catches this first, but the trigger is the real
          // boundary and fires even if the gate failed open or was bypassed —
          // surface the paywall, never a generic error.
          if (insErr?.hint === 'PAYWALL_LIMIT' || insErr?.hint === 'PAYWALL_LIMIT_ESTIMATE') {
            if (mode !== 'prepare') setPaywallFor(insErr.hint === 'PAYWALL_LIMIT_ESTIMATE' ? 'estimate' : 'invoice');
            return; // draft + ready untouched — upgrade, then tap send again
          }
          // 23505 on finalize_key: THIS conversation's row already exists (the
          // idempotency guard firing across a suspend/reload that lost
          // pendingInvoice). finalize_key = convoId and one conversation = one
          // invoice, so the recovered row is ALWAYS this conversation's own
          // invoice — never a different document. Read it back, then UPDATE it
          // with the current draft so edits made before the reload still land.
          if (insErr?.code === '23505' && convoId) {
            // NOT filtered by deleted_at on purpose: this recovers from a
            // finalize_key unique-violation, so it must still match a
            // soft-deleted row already holding this key — otherwise we'd mint a
            // duplicate invoice number for the same finalize.
            const { data: existing } = await supabase
              .from('invoices')
              .select('id, invoice_number, status, amount_paid, public_token')
              .eq('user_id', profile.id)
              .eq('finalize_key', convoId)
              .maybeSingle();
            if (!existing?.id) {
              console.error('invoice insert conflict but no matching row', insErr);
              if (!retryId && mode !== 'prepare') setMessages((m) => upsertFailure(m, aMsg(
                navigator.onLine
                  ? "Couldn't save that invoice just now. Your draft is safe."
                  : "You're offline — the invoice didn't send. Your draft is safe.",
                { failed: { op: 'finalize' } },
              )));
              return;
            }
            newId = existing.id as string;
            newNo = existing.invoice_number as number;
            publicToken = (existing.public_token as string) ?? null;
            // Persist the current draft onto the recovered row so a reload between
            // an edit and the save doesn't drop that edit — but only while it's a
            // draft (Commit B). If it was sent/paid elsewhere, lock instead of
            // overwriting.
            if (isLockedStatus((existing.status as string) ?? null)) {
              setLinkedStatus((existing.status as string) ?? null);
              setLinkedAmountPaid(Number(existing.amount_paid ?? 0));
              if (mode !== 'prepare') setMessages((m) => [...m, aMsg(lockEditNotice((existing.status as string) ?? null, Number(existing.amount_paid ?? 0), docKind(draft)))]);
              return;
            }
            await supabase.from('invoices').update(draftCols).eq('id', newId);
          } else {
            console.error('invoice insert failed', insErr);
            if (!retryId && mode !== 'prepare') setMessages((m) => upsertFailure(m, aMsg(
              navigator.onLine
                ? "Couldn't save that invoice just now. Your draft is safe."
                : "You're offline — the invoice didn't send. Your draft is safe.",
              { failed: { op: 'finalize' } },
            )));
            return; // outer finally clears phase; draft + ready untouched
          }
        } else {
          newId = saved.id as string;
          newNo = saved.invoice_number as number; // trigger-assigned, authoritative
          // Free-tier usage line (null for paid tiers / paywall off), and the
          // 2-of-3 nudge that rides the same counters — one /api/access read,
          // no recount. Shown once per kind; marked when shown.
          {
            const savedId = newId;
            const usageKind = rd0.kind === 'quote' ? 'estimate' : 'invoice';
            void fetchUsageSnapshot().then((snap) => {
              const text = usageLine(usageKind, snap);
              // No purchase path in this deployment (STRIPE_SUBSCRIPTIONS_ENABLED
              // off) → the "See plans" nudge would be a nag with nowhere to go.
              const nudge = snap?.subscriptionsEnabled === false ? null : usageNudgeFor(usageKind, snap);
              const uid = profile?.id;
              const due = nudge && uid && promptDue(nudge, uid) ? nudge : null;
              if (due && uid) markSeen(uid, due.key);
              if (text || due) {
                setInvoiceUsage({ id: savedId, text: text ?? '', nudge: due ?? undefined });
              }
            });
          }
          publicToken = (saved.public_token as string) ?? null;
        }
        invoiceId = newId;
        no = newNo;
        pendingInvoiceRef.current = { id: newId, no: newNo };
        // A template's conversation isn't in the chat store (no messages yet),
        // so its row link is kept with the template (2·12c).
        if (template && convoId) saveTemplateRow(templateUidRef.current, { convoId, id: newId, no: newNo });
        // Freshly persisted as a draft — mirror that into the lock state so the
        // card stays editable (Commit B). A 23505-recovered non-draft row already
        // returned above, so reaching here means the row is a draft.
        setLinkedStatus('draft');
        setLinkedAmountPaid(0);
        // The row exists but isn't marked sent yet, and setting a ref fires no
        // persist effect. Write now so a suspend while the share sheet is open
        // resumes with the row + progress intact.
        persistProgress();
      } else {
        // ── UPDATE: a later save of the same conversation's draft (Commit A) —
        // the core P1 fix. Edits after the first save now reach the DB. Only the
        // draft columns move; identity is pinned by lock_document_identity.
        //
        // Commit B hard guard: read the live status at save time — the row may
        // have been sent or paid in another session since this card opened. If it
        // has left 'draft', refuse the write and lock the card. This is the real
        // backstop (the DB has no draft-only trigger yet — see PUNCH-LIST); the
        // read-only UI is the courtesy layer in front of it.
        const { data: live } = await supabase
          .from('invoices')
          .select('status, amount_paid, public_token')
          .eq('id', invoiceId)
          .maybeSingle();
        if (live && isLockedStatus((live.status as string) ?? null)) {
          setLinkedStatus((live.status as string) ?? null);
          setLinkedAmountPaid(Number(live.amount_paid ?? 0));
          if (mode !== 'prepare') setMessages((m) => [...m, aMsg(lockEditNotice((live.status as string) ?? null, Number(live.amount_paid ?? 0), docKind(draft)))]);
          return; // outer finally clears phase; the locked card stays put
        }
        publicToken = (live?.public_token as string) ?? null;
        const { error: updErr } = await supabase.from('invoices')
          .update(draftCols)
          .eq('id', invoiceId);
        traceTurn(turnIdRef.current, 'finalize', {
          updateId: invoiceId,
          error: updErr ? (updErr.code ?? updErr.message ?? String(updErr)) : null,
        });
        if (updErr) {
          console.error('invoice update failed', updErr);
          if (!retryId && mode !== 'prepare') setMessages((m) => upsertFailure(m, aMsg(
            navigator.onLine
              ? "Couldn't save your changes just now. Your draft is safe."
              : "You're offline — your changes didn't save. Your draft is safe.",
            { failed: { op: 'finalize' } },
          )));
          return;
        }
      }

      // Invariant after step 1: the row exists. Narrows the nullable locals for
      // the update/archive below (both are set on the insert and the reuse path).
      if (!invoiceId || no == null) throw new Error('invoice not persisted');

      // Idempotent resume: a prior attempt already marked this row sent
      // (finalizeSent persisted across the suspend). The share already happened —
      // don't re-render, re-share, or re-archive. Finish once and reset.
      if (finalizeSentRef.current) {
        const kind = docNoun(docKind(draft)).toLowerCase();
        // Same tip question as a normal send, through the arbiter. This path only
        // ever offered the payouts nudge (it never asked about terms, alerts or
        // feedback), so that is the only candidate it passes.
        finishFinalize(
          aMsg(`All set — your ${kind} for ${draft.client_name ?? 'your client'} is sent.`),
          retryId,
          pickTip({ payouts: payoutsEligible() }),
        );
        return;
      }

      // ── 1b. Attachments: duplicate every pending entry (a picked blob, or a
      //    seed-time copy of an original's image) into THIS invoice's folder and
      //    record its row, so a later save never re-uploads. Runs in prepare mode
      //    too — the pre-build already writes the draft row, and the send tap's
      //    fast path shares that pre-built file with NO awaits, so the images
      //    must be stored by then. A failure ABORTS the turn (retry bubble)
      //    rather than sending without a picture the card showed.
      //    A QUOTE goes through the estimate routes: the public /e page and
      //    estimate_content_hash only publish rows with a server-computed
      //    checksum + mime, which a direct table insert never has (the bug where
      //    the card showed a photo and the client page showed no attachments).
      const materialized = docKind(draft) === 'quote'
        ? await materializeEstimateAttachments(supabase, invoiceId, attachmentsRef.current)
        : await materializeAttachments(supabase, profile.id, invoiceId, attachmentsRef.current);
      if (materialized.failedId) throw new Error('attachment materialization failed');
      if (materialized.saved.size) setAttachments(materialized.items);

      // Estimates are delivered as their public /e/<token> link only: no PDF is
      // rendered, stored or shared. The pre-build just keeps the draft row current
      // (done above), so it is "ready" as soon as that lands.
      if (docKind(draft) === 'quote') {
        if (mode === 'prepare') {
          if (buildId === preBuildIdRef.current) prepared = true;
          return;
        }
        if (mode === 'download') return; // no PDF to download for an estimate
        await settleEstimateSend(invoiceId, retryId);
        return;
      }

      // ── 2. Build render data (reuse the stashed number on a retry).
      const rd = buildRenderData(no);
      if (!rd) throw new Error('incomplete');

      // The public pay link (invoices only — a quote isn't payable). Available
      // now from the public_token captured during the persist step above, so it
      // needs NO await here. Origin-relative so a preview deploy links to itself.
      const payUrl =
        rd.kind === 'invoice' && publicToken
          ? `${window.location.origin}/pay/${publicToken}`
          : undefined;

      // Embed the pay link into the PDF itself (the whole "How to pay" block
      // becomes one silent tappable annotation) — but only on a real SEND, which
      // marks the invoice sent so its pay page resolves. A Download stays a draft
      // (no usable pay page), so leave rd.payUrl unset there and the block stays
      // link-free until the draft is later sent.
      if (mode !== 'download') rd.payUrl = payUrl ?? null;

      // Zelle is encrypted at rest — the server route is the only reader.
      try {
        const z = await (await fetch('/api/zelle?full=1')).json();
        if (z?.value) rd.zelle = z.value;
      } catch { /* invoice simply prints without Zelle */ }

      // ── 3. Render offscreen → PDF. For a send or download the PDF IS the
      // deliverable, so a failure fails the turn; a prepare failure is silent
      // (it records prepState 'failed' and the tap takes the slow path).
      let file: File | null = null;
      try {
        setRenderData(rd);
        await new Promise((r) => setTimeout(r, 350)); // let the template paint
        if (!printRef.current) throw new Error('render failed');
        file = await elementToPdf(
          printRef.current,
          invoiceFilename(rd.kind, no, rd.clientName, profile.business_name),
          // Attachments print after every invoice page (payment block included).
          { attachments: await toPdfAttachments(supabase, attachmentsRef.current) },
        );
      } catch (pdfErr) {
        if (mode !== 'prepare') throw pdfErr;
        console.error('PDF render failed', pdfErr);
      }

      // PREPARE mode: stash the freshly built file for the send tap's synchronous
      // share, then stop — no share, no mark-sent, no archive. Latest-wins: skip
      // the stash if a newer prepare has already superseded this build.
      if (mode === 'prepare') {
        if (file && buildId === preBuildIdRef.current) {
          preBuiltRef.current = { file, signature: draftSignature(draft), token: publicToken ?? '', id: invoiceId, no };
          prepared = true;
        }
        setRenderData(null);
        return;
      }

      // Download-only exit (Commit 3): hand over the PDF without sending. The
      // draft row was created above and stashed in pendingInvoiceRef, so it shows
      // in the invoices list as a draft and a later "send" reuses the SAME row and
      // number (no duplicate). Deliberately NOT marked sent and NOT archived to the
      // Vault — the archive/snapshot only happen on a real send. The card stays so
      // the user can still send.
      if (mode === 'download') {
        if (file) downloadFile(file);
        setRenderData(null);
        setMessages((m) => [...m, aMsg('Downloaded — it’s saved as a draft. Tap send whenever you’re ready.')]);
        return;
      }

      // ── 4. Slow-path share: no pre-built file was ready at tap time (a failed
      // pre-build, or a typed "send it"). The SAME share call as the fast path,
      // but after the awaits above iOS has usually dropped the tap's activation,
      // so it can come back 'failed' (NotAllowedError). settleShare then keeps
      // this file ready, so Retry or the next tap shares it synchronously.
      if (!file) throw new Error('render failed');
      setRenderData(null);
      const built = { file, signature: draftSignature(draft), token: publicToken ?? '', id: invoiceId, no };
      await settleShare(sharePdf(file, shareText(docNoun(rd.kind), rd.clientName, payUrl)), built, retryId);
    } catch (e) {
      console.error(e);
      // A row may already exist as a draft (stashed) — the retry reuses it, so
      // the draft is genuinely safe and no duplicate is created. A repeat
      // failure of a retry leaves the existing failed bubble and its button.
      // A background prepare fails silently (press 2 falls back to link share).
      if (!retryId && mode !== 'prepare') setMessages((m) => upsertFailure(m, aMsg(
        navigator.onLine
          ? "Couldn't finish that one. Your draft is safe."
          : "You're offline — the invoice didn't send. Your draft is safe.",
        { failed: { op: 'finalize' } },
      )));
    }
    } finally {
      if (mode === 'prepare') {
        // Record the outcome against the draft this build ran on (read after the
        // insert, so the signature carries the assigned number). A superseded
        // build (new chat, send finished) records nothing.
        if (draft && buildId === preBuildIdRef.current) {
          setPrepState({ sig: draftSignature(draft), status: prepared ? 'ready' : 'failed' });
        }
        preparingRef.current = false;
        preparePromiseRef.current = null;
        prepareDone();
        setPreparing(false);
      } else {
        finalizingRef.current = false;
        setPhase(null);
      }
    }
  }

  // After the ONE share call (lib/pdf/share.ts), for both the pre-built fast
  // path and the slow path. A cancel is silent (no message, no status change;
  // the row stays a draft). A failure says so with the error name and keeps the
  // file ready, so Retry or the next tap re-shares it synchronously. A completed
  // share (or a download where the platform has no file share) marks it sent
  // and archives it to the Vault.
  async function settleShare(
    pending: Promise<ShareResult>,
    pb: NonNullable<typeof preBuiltRef.current>,
    retryId?: string,
  ) {
    const r = await pending;
    if (r.status === 'cancelled') return;
    if (r.status === 'failed') {
      preBuiltRef.current = pb;
      setPrepState({ sig: pb.signature, status: 'ready' });
      setShareWaiting(pb.signature);
      // NotAllowedError is the expected iOS outcome of a build-at-tap send: the
      // file is ready, the next tap shares it instantly. Say that calmly; only
      // a real failure gets the error bubble with Retry.
      if (!retryId) setMessages((m) => upsertFailure(m, r.name === 'NotAllowedError'
        ? aMsg(`Your ${docNoun(docKind(draft)).toLowerCase()} is ready. Tap Share ${docNoun(docKind(draft)).toLowerCase()} to send it.`)
        : aMsg(
          SHARE_NOT_OPENED_TEXT,
          { failed: { op: 'finalize' } },
        )));
      return;
    }
    setShareWaiting(null);
    if (!profile || !draft) return;
    const downloaded = r.status === 'unsupported';
    if (downloaded) downloadFile(pb.file);
    // The row was persisted from this exact draft before the file was built (the
    // signature matches). The server owns the status transition and snapshot:
    // a draft becomes sent; a resend only bumps sent_at, so paid/overdue can
    // never regress; deleted and void rows are refused.
    const sendRes = await fetch(`/api/invoices/${pb.id}/send`, { method: 'POST' }).catch(() => null);
    if (!sendRes?.ok) {
      if (sendRes) {
        console.error('invoice send failed', sendRes.status, await sendRes.text().catch(() => ''));
      }
      // The client already has the PDF, so this is not a normal failure bubble:
      // S1 interrupts with both truths (it went out / it is still a draft).
      const sharedAt = new Date().toISOString();
      const offline = navigator.onLine === false;
      setUnsentShare({
        id: pb.id,
        kind: docKind(draft),
        number: formatDocNumber(docKind(draft), pb.no),
        client: draft.client_name ?? null,
        total: previewTotals.total,
        dueDate: draft.due_date ?? defaultDueDate(),
        sharedAt,
        offline,
        file: pb.file,
        token: pb.token,
      });
      setUnsentShareOpen(true);
      // The card outlives this conversation: remember it for the next visit.
      rememberUnsentShare(pb.id, { sharedAt, offline });
      return;
    }
    finalizeSentRef.current = true;
    persistProgress();
    // A completed send retires any earlier S1/S1b state from this conversation.
    setUnsentShare(null);
    setUnsentShareOpen(false);
    forgetUnsentShare(pb.id);
    const firstSend = await sendRes.json().then((j: { firstSend?: unknown }) => j?.firstSend === true).catch(() => false);
    // Archive in the Vault — best-effort; a storage hiccup must not undo the send.
    try {
      const path = `${profile.id}/${pb.file.name}`;
      await supabase.storage.from('vault').upload(path, pb.file, { upsert: true });
      await supabase.from('vault_documents').insert({
        user_id: profile.id, title: pb.file.name, doc_type: docKind(draft),
        storage_path: path, invoice_id: pb.id,
      });
    } catch (archiveErr) { console.error('vault archive failed', archiveErr); }
    preBuiltRef.current = null;
    const who = draft.client_name ?? 'your client';
    // Only promise a payment notification when this send has both a live pay
    // link and an online card path. Quotes and offline-only invoices omit it;
    // manual/offline payments never push.
    const paidOnline = docKind(draft) === 'invoice' && pb.token && cardAvailableFor(profile, connectOn)
      ? ` You'll also get a notification when ${who} pays online.`
      : '';
    // One nudge per send (lib/tip-arbiter.ts): terms > payouts > alerts >
    // feedback. The eligibility rules themselves are unchanged — terms-prompt.ts,
    // the payouts conditions, push availability and feedback.ts — the arbiter
    // only picks the single card that gets this moment, so payouts no longer
    // rides along with a second card. Cheap candidates are checked first; a
    // higher-priority winner makes the slower checks irrelevant.
    const terms = termsEligible(firstSend);
    const payouts = payoutsEligible();
    const alerts = terms || payouts ? false : await alertsEligible();
    const feedback = terms || payouts || alerts ? false : await feedbackEligible();
    const tip = pickTip({ terms, payouts, alerts, feedback });
    // On a retry the done message replaces the failed bubble instead of appending.
    finishFinalize(aMsg(downloaded
      ? `Downloaded! Send it to ${who} however you like. I'll keep an eye on it.`
      : `Sent! I'll notify you if ${who} hasn't paid in 2 days.${paidOnline}`), retryId, tip);
    // Payouts is a chat card, appended by finishFinalize. The other three are
    // prompt cards; showing one clears any card left over from an earlier send.
    if (tip === 'terms') showTermsCard();
    else {
      setTermsPrompt(false);
      if (tip === 'alerts') showRemindersCard(who);
      else if (tip === 'feedback') showFeedbackCard();
    }
  }

  // Eligibility for the "Add your terms" tip (rules in lib/terms-prompt.ts).
  // Pure: showing the card is showTermsCard's job, and only a shown card counts.
  function termsEligible(firstSend: boolean): boolean {
    if (!profile) return false;
    const blocked = sessionRef.current || template !== null || paywallFor !== null;
    return shouldOfferTermsPrompt(profile, { firstSend, blocked: !!blocked });
  }

  // The "Add your terms" card. The count goes up in the database the moment the
  // card is shown (best-effort), so a second device or a reload can't show it a
  // third time.
  function showTermsCard() {
    if (!profile) return;
    const next = (profile.terms_prompt_count ?? 0) + 1;
    setProfile((p) => (p ? { ...p, terms_prompt_count: next } : p));
    void supabase.from('profiles').update({ terms_prompt_count: next }).eq('id', profile.id)
      .then(({ error }) => { if (error) console.error('terms prompt count failed', error.code); });
    setTermsPrompt(true);
  }

  // Payouts nudge eligibility: invoices only (the tip is about getting paid,
  // which an estimate isn't), Connect on in this deployment, no processor
  // connected yet, and never after a "Not now".
  function payoutsEligible(): boolean {
    return !!draft && docKind(draft) === 'invoice' && connectOn && !!profile
      && !cardAvailableFor(profile, connectOn) && !payoutsNudgeDismissed;
  }

  function addTermsFromPrompt() {
    setTermsPrompt(false);
    router.push('/settings/business-info#terms');
  }

  // "Not now" is stored on the profile, not in the browser.
  function dismissTermsPrompt() {
    setTermsPrompt(false);
    if (!profile) return;
    void supabase.from('profiles').update({ terms_prompt_dismissed_at: new Date().toISOString() }).eq('id', profile.id)
      .then(({ error }) => { if (error) console.error('terms prompt dismiss failed', error.code); });
  }

  // Estimate send: the server flips the row to sent (and fills valid_until), and
  // the client gets only the /e/<token> link, so there is no share-sheet race to
  // protect and no file to build. The link and its Copy link / Share actions go
  // straight into the confirmation. Mirrors the estimate detail screen.
  async function settleEstimateSend(id: string, retryId?: string) {
    if (!profile || !draft) return;
    // The date the user asked for ("Valid for 14 days", or a due date a chat
    // parse carried) is the estimate's valid-until date, so the link, the sent
    // card and the notes can never disagree. A date already past is ignored and
    // the server's +30 days applies.
    const asked = typeof draft.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(draft.due_date) ? draft.due_date : null;
    const today = new Date();
    const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const out = await requestEstimateSend(id, asked && asked >= todayYmd ? asked : null);
    if (!out.ok) {
      if (!retryId) setMessages((m) => upsertFailure(m, aMsg(out.message, { failed: { op: 'finalize' } })));
      return;
    }
    const token = typeof out.estimate.public_token === 'string' ? out.estimate.public_token : null;
    finalizeSentRef.current = true;
    persistProgress();
    setLinkedToken(token);
    // No confirmation bubble for an estimate (see finishFinalize); the locked
    // card shows the link with Copy link / Share.
    finishFinalize(aMsg(''), retryId);
    // One nudge per send, through the same arbiter. An estimate can only ever
    // get the feedback card: terms is its own document rule, and payouts and
    // alerts are invoice-only.
    const tip = pickTip({ feedback: await feedbackEligible() });
    if (tip === 'feedback') showFeedbackCard();
  }

  // Re-run the operation behind a failed message, in place. The message's id is
  // passed down so the outcome replaces THIS bubble (success) or leaves it as-is
  // (repeat failure). finalize reuses the same convoId/finalize_key, so the
  // server-side 23505 read-back guarantees no duplicate invoice on a retry.
  // Taps on a template card in the thread. Show all, a row and a link open the
  // destination the server declared (none declared, nothing to open); Try again
  // re-runs the question this answer replied to, in place of the answer.
  function templateHandlers(m: Msg, mi: number): ChatTemplateHandlers {
    const path = m.destination?.path;
    const open = path ? () => router.push(path) : undefined;
    const asked = messages[mi - 1]?.role === 'user' ? messages[mi - 1].content : null;
    return {
      onRowTap: open, onShowAll: open, onOpen: open,
      onRetry: asked ? () => { void send(asked, 'typed', m.id); } : undefined,
    };
  }

  function retry(msg: Msg) {
    if (phase || !msg.failed) return; // a turn is in flight, or nothing to retry
    // Synchronous guard: state lags a render, so a rage-tap would re-run the op.
    if (retryingRef.current) return;
    retryingRef.current = true;
    setRetryingId(msg.id);
    const run: Promise<unknown> = msg.failed.op === 'send'
      ? send(msg.failed.text, 'typed', msg.id)
      : finalize(false, msg.id);
    void run.finally(() => {
      retryingRef.current = false;
      setRetryingId(null);
      setRetryShake((s) => ({ ...s, [msg.id]: (s[msg.id] ?? 0) + 1 }));
    });
  }

  // Payment-alerts eligibility, offered once after a completed invoice send
  // (never on load). Replaces the old "first invoice only" count check, which
  // drafts now inflate (a card creates its draft row on render), so it could
  // never fire. A new storage key, so people who dismissed the old
  // reminders-only card are asked once about payment alerts. On an iPhone in a
  // Safari tab (no web push there) it becomes a Home Screen hint instead;
  // blocked or unsupported browsers get nothing.
  async function alertsEligible(): Promise<boolean> {
    if (!profile || !draft || docKind(draft) !== 'invoice') return false;
    try {
      if (localStorage.getItem(ALERTS_PROMPTED_KEY)) return false;
      // 'needs-install' too: an iPhone/iPad in a Safari tab gets web push only
      // from a Home Screen install, and nothing in the app guides that any more,
      // so there is no card to offer there.
      const avail = pushAvailability();
      if (avail !== 'ready') return false;
      if (avail === 'ready' && (await getPushSubscription())) return false; // already on
      return true;
    } catch { return false; /* never block the send flow */ }
  }

  function showRemindersCard(clientName: string) {
    setReminderPrompt({
      client: clientName,
      // With no online-pay path there is no card payment to notify about, so the
      // ask (and its confirmation) is only the 2-day unpaid nudge.
      onlinePay: cardAvailableFor(profile, connectOn),
    });
  }

  // Eligibility for the "Got a minute?" card, right after a quote or invoice
  // goes out. Rules live in lib/feedback.ts (shouldAskForFeedback): 3+ documents
  // sent, a 30-day check-in window after the newest feedback row (read from the
  // table, so it holds across devices), 21-day snooze, 60 days after two dismissals.
  // Skipped during a voice session, an open template or the paywall. The
  // walkthrough is on-demand and runs on sample data, so it can't overlap a
  // real send. Best-effort: any failure means no card.
  async function feedbackEligible(): Promise<boolean> {
    if (!profile) return false;
    try {
      if (sessionRef.current || template !== null || paywallFor !== null) return false;
      const state = parsePromptState(localStorage.getItem(FEEDBACK_PROMPT_KEY));
      const now = Date.now();
      // Cheap local gate first so most sends never touch the database.
      if (!shouldAskForFeedback({ now, docsSent: PROMPT_MIN_DOCS, moment: true, lastSubmittedAt: null, blocked: false, state })) return false;
      const [{ data: latest }, { count: sent }] = await Promise.all([
        supabase.from('feedback').select('created_at').order('created_at', { ascending: false }).limit(1),
        supabase.from('invoices').select('id', { count: 'exact', head: true })
          .is('deleted_at', null).neq('status', 'draft'),
      ]);
      const lastSubmittedAt = latest?.[0]?.created_at ? Date.parse(latest[0].created_at) : null;
      return shouldAskForFeedback({
        now,
        docsSent: sent ?? 0,
        moment: true,
        lastSubmittedAt: Number.isNaN(lastSubmittedAt as number) ? null : lastSubmittedAt,
        blocked: false,
        state,
      });
    } catch { return false; /* never block the send flow */ }
  }

  // Shown: the storage stamp is what keeps it from coming back for 21 days.
  function showFeedbackCard() {
    try {
      const state = parsePromptState(localStorage.getItem(FEEDBACK_PROMPT_KEY));
      localStorage.setItem(FEEDBACK_PROMPT_KEY, JSON.stringify(afterShown(state, Date.now())));
      setFeedbackPrompt(true);
    } catch { /* never block the send flow */ }
  }

  function openFeedback() {
    setFeedbackPrompt(false);
    router.push('/settings/help/feedback?src=chat_prompt&from=/chat');
  }

  function dismissFeedback() {
    setFeedbackPrompt(false);
    try {
      const state = parsePromptState(localStorage.getItem(FEEDBACK_PROMPT_KEY));
      localStorage.setItem(FEEDBACK_PROMPT_KEY, JSON.stringify(afterDismiss(state, Date.now())));
    } catch { /* ignore */ }
  }

  // Straight from the Yes tap: subscribeToPush() asks permission before
  // anything else is awaited (the iOS gesture rule).
  async function enableReminders() {
    if (!profile || !reminderPrompt) return;
    const who = reminderPrompt.client;
    // Only promise what push can actually do for this pro: the paid-online
    // notification needs a connected payment processor.
    const onlinePay = reminderPrompt.onlinePay;
    try { localStorage.setItem(ALERTS_PROMPTED_KEY, '1'); } catch { /* ignore */ }
    // Board M3: the card stays up, locked, while the OS prompt is on top of it
    // (PopInline holds the pending state). It closes when the OS answers.
    const ok = await subscribeToPush();
    setReminderPrompt(null);
    if (!ok) { setAlertsFailed(true); return; }
    setMessages((m) => [...m, aMsg(onlinePay
      ? `You're set. I'll notify you when ${who} pays online, and again if an invoice sits unpaid for 2 days.`
      : `You're set. I'll nudge you if ${who} hasn't paid in 2 days.`)]);
  }

  function dismissReminders() {
    setReminderPrompt(null);
    try { localStorage.setItem(ALERTS_PROMPTED_KEY, '1'); } catch { /* ignore */ }
  }

  // ── Receipt capture ─────────────────────────────────────────
  // Two inputs feed this one handler (see cameraRef/galleryRef): a camera
  // button (`capture="environment"`, rear camera direct) and a gallery button
  // (no `capture`, pick an existing photo). Relying on a single capture-less
  // input to surface the OS "Take Photo / Photo Library" sheet proved
  // unreliable — some Android browsers (Brave) jumped straight to the gallery —
  // so the choice is now two explicit buttons.
  async function onPickReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately so picking the SAME file twice still fires onChange.
    e.target.value = '';
    if (!file) return;
    await handleReceiptFile(file);
  }

  /** The composer camera button: the in-app screen when the flag is on, the OS
   *  camera input (unchanged behaviour) when it is off. */
  function openCamera() {
    if (!IN_APP_CAMERA) { cameraRef.current?.click(); return; }
    setCameraOpen(true);
  }

  // The one receipt-photo path, shared by the two file inputs and the in-app
  // camera. A captured frame is just a File, so everything below — prepare,
  // dedup, parse, upload, expense row — is exactly the flow that already ships.
  async function handleReceiptFile(file: File) {
    if (phase) return; // a turn is already in flight
    discardExpense();
    // Own the phase for the whole pick→prepare→dedup→read flow in ONE outer
    // finally, so there is no gap where the controls re-enable mid-flow and no
    // path (incl. an unexpected throw in findDuplicate) can leave it stuck.
    // readReceipt advances it to 'reading'.
    setPhase('preparing');
    try {
      // Over the free expense cap? Show the wall now — before the shutter, the
      // upload and the vision call — so nothing is spent on an expense that
      // can't be saved. /api/parse-receipt refuses with 402 as the backstop.
      if (!(await expenseAllowed())) return;

      let prepared: PreparedReceipt;
      try {
        prepared = await prepareReceipt(file);
        setReceipt(prepared);
        // Flash once the camera sheet is gone; resolves at the flash's peak.
        const flashPeak = afterSheetGone().then(() => {
          setShutterKey((k) => k + 1);
          return new Promise<void>((r) => setTimeout(r, FLASH_PEAK_MS));
        });
        // The photo joins the thread as the user's message. It stays even if
        // the read then fails or turns out to be a duplicate.
        if (prepared.thumbUrl) {
          const bubble: Msg = { ...uMsg('Receipt photo'), receipt: prepared.thumbUrl };
          liveReceiptRef.current = { id: bubble.id, flashPeak };
          receiptBubbleIdRef.current = bubble.id;
          nearBottomRef.current = true; // follow the photo, even if scrolled up
          setMessages((m) => [...m, bubble]);
        }
      } catch (err) {
        // ReceiptError messages are written for the user; anything else isn't.
        setMessages((m) => [...m, aMsg(err instanceof ReceiptError
          ? err.message
          : "Couldn't read that photo — try taking it again.")]);
        return;
      }

      // Dedup BEFORE the vision call, not just before the insert: re-reading a
      // receipt we already have costs vision tokens to arrive at a row we're
      // going to refuse anyway.
      const already = await findDuplicate(prepared.hash);
      if (already) {
        setReceipt(null);
        setMessages((m) => [...m, aMsg(duplicateMessage(already))]);
        return;
      }

      // Straight into the read — no second tap. The user's intent was complete
      // the moment they chose the photo.
      await readReceipt(prepared);
    } finally {
      setPhase(null);
    }
  }

  /** False (and the expense wall opens) when the free expense cap is reached.
   *  Guests pass: the receipt read answers them with 401 + sign-in. Fails OPEN
   *  if /api/access is unreachable; the DB trigger is the real enforcement. */
  async function expenseAllowed(): Promise<boolean> {
    if (!profile) return true;
    try {
      let gate = await (await fetch('/api/access')).json();
      if (gate && gate.canExpense === false && recentlyUpgraded()) {
        gate = (await waitForAccess((a) => a.canExpense === true)) ?? gate;
      }
      if (gate && gate.canExpense === false) {
        setPaywallFor('expense');
        return false;
      }
    } catch { /* access check unreachable — fail open */ }
    return true;
  }

  /** An existing expense for this user with the same receipt image, if any. */
  async function findDuplicate(hash: string): Promise<ExistingReceipt | null> {
    if (!profile) return null;
    const { data, error } = await supabase
      .from('expenses')
      .select('id, amount, vendor, spent_on')
      .eq('user_id', profile.id)
      .is('deleted_at', null)
      .eq('receipt_hash', hash)
      .maybeSingle();
    // A failed lookup must not block a legitimate save — the unique index is
    // the real guarantee, and saveExpense() handles the violation it raises.
    if (error) { console.error('dedup lookup failed', error); return null; }
    return (data as ExistingReceipt) ?? null;
  }

  // Called only from onPickReceipt, which owns the phase lifecycle (its finally
  // clears it). We advance the phase to 'reading' for the vision call; the guest
  // 401 raises the sign-in card instead.
  async function readReceipt(prepared: PreparedReceipt) {
    setPhase('reading');
    try {
      const body = new FormData();
      body.append('image', prepared.blob, 'receipt.jpg');
      const res = await fetch('/api/parse-receipt', { method: 'POST', body });
      const data = await res.json();

      if (res.status === 402 && data.paywall === 'expense') {
        // Server-side backstop (the client pre-check failed open or raced).
        setReceipt(null);
        setPaywallFor('expense');
        return;
      }
      if (res.status === 401 && data.authRequired) {
        setSignInAsk({ kind: 'receipt', headline: data.reply });
        setReceipt(null);
        return;
      }
      if (!res.ok) {
        // 413 (too big), 415 (not a photo), 429 (capped) and 500 (ours) each
        // have a cause of their own; the server's reply is only the payload.
        setMessages((m) => [...m, aMsg(userMessage({ status: res.status, code: data.error ?? null, message: data.reply ?? null }))]);
        setReceipt(null);
        return;
      }

      // A receipt we couldn't get an amount off is not a saveable expense —
      // say so plainly rather than opening a card full of blanks.
      if (typeof data.amount !== 'number' || data.amount <= 0) {
        setMessages((m) => [...m, aMsg("I couldn't make out the total on that one. Tell me the amount and I'll log it.")]);
        setReceipt(null);
        return;
      }

      setExpenseDraft({
        amount: data.amount,
        category: isExpenseCategory(data.category) ? data.category : 'other',
        vendor: typeof data.vendor === 'string' ? data.vendor : null,
        // No legible date on the receipt → today, which is right far more often
        // than it's wrong for a photo taken at the counter.
        occurred_on: typeof data.occurred_on === 'string' ? data.occurred_on : today(),
        // What was bought (the reader's short phrase); editable on the card.
        description: typeof data.description === 'string' ? data.description : null,
      });
    } catch (err) {
      // A thrown upload is offline or ours — the classifier can tell which.
      setMessages((m) => [...m, aMsg(userMessage(err))]);
      setReceipt(null);
    }
    // No finally here — onPickReceipt's finally owns clearing the phase.
  }

  // ── Saving an expense ───────────────────────────────────────
  async function saveExpense() {
    if (!expenseDraft) return;
    if (phase) return; // a turn is already in flight
    setPhase('saving');
    try {
    if (!profile) {
      if (!profileLoaded) {
        setExpenseError('One sec — still loading your account. Give it a moment.');
        return;
      }
      setSignInAsk({ kind: 'expense' });
      return;
    }

    setExpenseError(null);
      // Re-check before uploading the photo: a capped insert would leave an
      // orphaned file in storage. The trigger stays the real enforcement.
      if (!(await expenseAllowed())) return;

      // Path is the content hash, so the same photo always lands on the same
      // object instead of piling up copies. The bucket has no UPDATE policy
      // (copied from vault), so upsert is off and a re-upload of an identical
      // path is treated as already-done rather than an error.
      let receiptPath: string | null = null;
      if (receipt) {
        receiptPath = `${profile.id}/${receipt.hash}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('receipts')
          .upload(receiptPath, receipt.blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr && !/exists/i.test(upErr.message)) {
          console.error('receipt upload failed', upErr);
          setExpenseError("Couldn't save the photo just now — your expense is still here.");
          return;
        }
      }

      const spentOn = expenseDraft.occurred_on ?? today();
      const { data: insRow, error: insErr } = await supabase.from('expenses').insert({
        user_id: profile.id,
        amount: expenseDraft.amount,
        category: expenseDraft.category,
        vendor: expenseDraft.vendor,
        // Blank → null (the column's length check rejects an empty string).
        description: expenseDraft.description?.trim() || null,
        spent_on: spentOn,
        receipt_url: receiptPath,
        receipt_hash: receipt?.hash ?? null,
      }).select('id').single();
      if (insErr) {
        // 23505 = the (user_id, receipt_hash) unique index. Reachable despite
        // the pre-check if the same receipt was saved on another device while
        // this card sat open. Say what happened — never a raw constraint error.
        // The expense cap trigger (PAYWALL_LIMIT_EXPENSE): show the wall, keep
        // the card so the expense can be saved after upgrading.
        if (insErr.hint === 'PAYWALL_LIMIT_EXPENSE') {
          setPaywallFor('expense');
          return;
        }
        if (insErr.code === '23505') {
          const existing = receipt ? await findDuplicate(receipt.hash) : null;
          discardExpense();
          setMessages((m) => [...m, aMsg(existing
            ? duplicateMessage(existing)
            : "You've already logged this receipt — I didn't add it twice.")]);
          return;
        }
        console.error('expense insert failed', insErr);
        setExpenseError("Couldn't save that expense just now.");
        return;
      }

      const where = expenseDraft.vendor ? ` at ${expenseDraft.vendor}` : '';
      const saved = `Got it — ${money(expenseDraft.amount)}${where}, filed under ${CATEGORY_LABEL[expenseDraft.category].toLowerCase()}.`;
      // The compact logged card replaces the text confirmation (it shows the
      // same facts); the text stays as content for the model's context.
      const logged: Msg = aMsg(saved, {
        logged: {
          amount: expenseDraft.amount,
          vendor: expenseDraft.vendor?.trim() || null,
          category: CATEGORY_LABEL[expenseDraft.category],
          date: expenseDraft.occurred_on ?? today(),
          receiptMsgId: receipt ? receiptBubbleIdRef.current : null,
          // Saved from the + menu template: its card offers View in Books.
          ...(expenseTemplate ? { viaTemplate: true as const } : {}),
        },
      });
      // Fold the expense card away first (150ms, onit-card-exit), then the
      // logged card arrives in its place. Reduced motion: straight swap.
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        setExpenseExiting(true);
        await new Promise((r) => setTimeout(r, 150));
        liveLoggedIdRef.current = logged.id;
      }
      setMessages((m) => [...m, logged]);
      discardExpense();
      setExpenseExiting(false);
      // Free-tier usage line under the confirmation (null when uncapped).
      void fetchUsageLine('expense').then((text) => {
        if (text) setMessages((m) => [...m, aMsg(text, { quiet: true })]);
      });
      // "Make it recurring?" (3·4): same vendor, ±10 %, a cadence gap since the
      // last one, no live recurring item — asked after the save, never during it.
      const newId = (insRow as { id?: string } | null)?.id;
      if (newId && expenseDraft.vendor?.trim()) {
        const category = expenseDraft.category;
        void supabase.rpc('repeat_candidate', { p_expense: newId }).then(({ data }) => {
          const p = recurringPrompt(data, category, spentOn, localToday());
          if (p) setPromptQueue((q) => enqueue(q, promptShownRef.current, [p]));
        }, () => undefined);
      }
    } finally {
      setPhase(null);
    }
  }

  /** Drop the in-flight expense and its photo. Used by cancel, and before a
   *  new pick so two receipts can never share one card. */
  function discardExpense() {
    receiptBubbleIdRef.current = null;
    setReceipt(null);
    setExpenseDraft(null);
    setExpenseTemplate(false);
    setDiscardAsk(false);
    setExpenseError(null);
  }

  // Owns the preview object URL's whole lifetime: the cleanup closes over the
  // OUTGOING receipt, so it fires on replace, on clear, and on unmount alike.
  useEffect(() => () => { if (receipt) URL.revokeObjectURL(receipt.previewUrl); }, [receipt]);

  // ── Push-to-talk voice session ──────────────────────────────
  function stopSpeech() {
    cancelSpeechRef.current?.();
    cancelSpeechRef.current = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }

  // Acquire the mic ONCE per voice session and reuse the same stream for every
  // take. Re-calling getUserMedia on each tap — and tearing the stream down
  // after each take — is what re-prompted for permission on every click. The
  // stream is released only when the session ends (X) or the screen unmounts.
  async function getSessionStream(): Promise<MediaStream> {
    const live = streamRef.current;
    if (live && live.getAudioTracks().some((t) => t.readyState === 'live')) return live;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  }

  async function startRecording() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceSession(false); sessionRef.current = false;
      setVoiceError("Voice isn't available in this browser. You can type instead.");
      return;
    }
    setVoiceError(null);
    // A fresh start hides the card; Try again keeps it up until the mic opens.
    if (!micRetryRef.current) setMicBlocked(null);
    try {
      const stream = await getSessionStream(); // reused across takes — one prompt per session
      micRetryRef.current = false;
      setMicBlocked(null);
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      recAbortRef.current = false;
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        // Keep the stream open for the next take; endVoiceSession()/unmount
        // release it. (It used to be stopped here, forcing a re-prompt next tap.)
        setRecording(false);
        if (recAbortRef.current) return; // session ended mid-take — discard
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        setPhase('thinking'); // transcription is a turn in flight
        setTranscribing(true);
        let text = '';
        let data: { text?: string; authRequired?: boolean; message?: string; error?: string } = {};
        // A failed take has a cause of its own (offline, rate limited, our end).
        // "Didn't catch that" is only honest for a clean 200 with no transcript.
        let failure: unknown = null;
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: blob });
          data = await res.json().catch(() => ({}));
          if (!res.ok) failure = { status: res.status, code: data.error ?? null, message: data.message ?? null };
          text = (data.text ?? '').trim();
        } catch (err) { failure = err; }
        setTranscribing(false);
        // Guest voice budget spent (per-browser or global daily cap) — show the
        // signup prompt and route to login, same as /api/parse's authRequired.
        if (data.authRequired) {
          setSignInAsk({ kind: 'voice', headline: data.message });
          return;
        }
        // Clear before delegating to send(), which re-claims the turn (its guard
        // reads `phase`, so it must be idle here). No-text take just reports back.
        setPhase(null);
        // Name the cause. A 429 (today's cap), a 500 and an offline take all
        // used to read "Didn't catch that", which blamed the user's speech.
        if (failure) {
          setMessages((m) => [...m, aMsg(userMessage(failure))]);
          return;
        }
        // Voice auto-sends immediately as a 'voice' message — no cancel window,
        // no send tap. One final transcript per take (record-then-POST), so this
        // fires exactly once. The reply is spoken because the source is 'voice'.
        // The transcript lands in the field first, so the words appear where the
        // user was speaking before the turn is sent.
        if (text) { setInput(text); void send(text, 'voice'); }
        else setMessages((m) => [...m, aMsg("Didn't catch that — try again or type it.")]);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (err) {
      // mic blocked/denied → end the session and fall back to typing (no hang)
      setVoiceSession(false); sessionRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      // Inline above the field, not a chat bubble: the session is already over
      // and the field is the thing the user must fall back to.
      setTranscribing(false);
      const retried = micRetryRef.current;
      micRetryRef.current = false;
      if (isMicPermissionError(err)) {
        setVoiceError(null);
        setMicBlocked({ card: micBlockedCard(isIosDevice()), still: retried });
      } else {
        setMicBlocked(null);
        setVoiceError(MIC_FALLBACK_TEXT);
      }
    }
  }

  // ── The composer's "+" menu (release frames 1b, motion 1d). Outside a voice
  // session "+" opens Voice · New invoice · New quote; during one the same
  // button is the × that ends the session.
  // ── Guided template (merge 2 · 2·10, UI-REDESIGN-AUDIT §1.4): when set, the
  // template card takes the composer's slot. It opens from the + menu, a
  // client's Invoice action (/chat?template=invoice&client={id}) and
  // /chat?template=invoice|quote.
  // Persisted (2·11a): an open template comes back when Chat opens again.
  const [template, setTemplate] = useState<TemplateKind | null>(null);
  const [templateUid, setTemplateUid] = useState<string | null>(null);
  const [templateRestored, setTemplateRestored] = useState<StoredTemplate | null>(null);
  // The template's sendable draft (2·12b) and the L17 duplicate note.
  const [templateDraft, setTemplateDraft] = useState<Partial<ExtractResult> | null>(null);
  // Share succeeded, POST /send did not (P-66, frames S1 + S1b): the client has
  // the PDF and the row is still a draft. The blocking sheet says both truths;
  // Keep as draft leaves the S1b card pinned under the document.
  const [unsentShareOpen, setUnsentShareOpen] = useState(false);
  // S1b lands under the document card, which can leave its answers behind the
  // composer. Bring the card fully into the list's own viewport with the
  // smallest scroll that does it: never scrollIntoView (it also scrolls the
  // page) and never smooth (iOS swallows the next tap while one is running).
  const s1bRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!unsentShare || unsentShareOpen) return;
    const id = requestAnimationFrame(() => {
      const list = listRef.current;
      const card = s1bRef.current;
      if (!list || !card) return;
      const listBox = list.getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      const below = cardBox.bottom - listBox.bottom;
      const above = listBox.top - cardBox.top;
      if (below > 0) list.scrollTop += below;
      else if (above > 0) list.scrollTop -= above;
    });
    return () => cancelAnimationFrame(id);
  }, [unsentShare, unsentShareOpen]);
  const [sentToast, setSentToast] = useState<string | null>(null);
  const [templateDup, setTemplateDup] = useState<string | null>(null);
  const templateInit = useRef(false);
  const templateUidRef = useRef<string | null>(null);
  // Remounts the card for each fresh template, so none of its state carries over.
  const [templateNonce, setTemplateNonce] = useState(0);
  useEffect(() => {
    // After hydration: a fresh template archives the live conversation first
    // (one conversation = one invoice row, keyed by convoId).
    if (!active || !hydrated || templateInit.current) return;
    templateInit.current = true;
    let live = true;
    createClient().auth.getSession().then(({ data }) => {
      if (!live) return;
      const uid = data.session?.user.id ?? null;
      setTemplateUid(uid);
      templateUidRef.current = uid;
      const url = new URL(window.location.href);
      const t = url.searchParams.get('template');
      if (t === 'invoice' || t === 'quote') {
        // An explicit new template replaces any saved one. &client={id}: a
        // client's Invoice action (2·12c) opens it with that client picked.
        const cid = url.searchParams.get('client');
        url.searchParams.delete('template');
        url.searchParams.delete('client');
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
        if (!uid || !cid || !UUID_RE.test(cid)) { startNewTemplate(t); return; }
        createClient().from('clients').select('id, name, address, phone').eq('id', cid).maybeSingle()
          .then(({ data }) => {
            if (!live) return;
            const c = data as { id: string; name: string; address: string | null; phone: string | null } | null;
            startNewTemplate(t, c ? { id: c.id, name: c.name, address: c.address, phone: c.phone } : null);
          }, () => { if (live) startNewTemplate(t); });
        return;
      }
      resumeSavedTemplate();
    }, () => undefined);
    return () => { live = false; };
  }, [active, hydrated]);
  // A saved template comes back with its pre-built row, under the same
  // conversation id (= finalize_key), so Send updates that row instead of
  // inserting a second one. An expired template's draft row is dropped.
  function resumeSavedTemplate() {
    const uid = templateUidRef.current;
    const row = loadTemplateRow(uid);
    const saved = loadTemplate(uid);
    if (row && !pendingInvoiceRef.current) {
      pendingInvoiceRef.current = { id: row.id, no: row.no };
      if (saved) setConvoId(row.convoId);
      else discardTemplateRow();
    }
    if (saved) { setTemplateRestored(saved); setTemplateNonce((n) => n + 1); setTemplate(saved.kind); }
    else clearTemplate();
    setAttachments([]); // template attachments aren't persisted with it
  }
  // 2·13a: a fresh template asks first when it would replace a saved one with
  // a client or a named item (Keep editing / Start new).
  const [replaceAsk, setReplaceAsk] = useState<{
    title: string; kind: TemplateKind; client: TemplateClient | null;
    figure: ReturnType<typeof unfinishedFigure>;
  } | null>(null);
  function startNewTemplate(k: TemplateKind, client: TemplateClient | null = null) {
    const saved = loadTemplate(templateUidRef.current);
    const title = saved ? unfinishedTitle(saved) : null;
    if (saved && title) setReplaceAsk({ title, kind: k, client, figure: unfinishedFigure(saved) });
    else void openTemplate(k, client);
  }
  // Open a fresh template (the + menu's New invoice / New quote, 2·12c; the
  // ?template= link): it replaces any saved one, and the live conversation is
  // archived first (one conversation = one invoice row, keyed by convoId).
  // A replaced template's pre-built row goes the way Close sends it (soft
  // delete, drafts only): while a template is saved, the live conversation is
  // that template's, so its pending row is the template's draft; after leaving
  // Chat the row comes from the template's stored link.
  async function openTemplate(k: TemplateKind, client: TemplateClient | null = null, strictRow = false) {
    // The stored link only counts when the live conversation has no row of its
    // own, or it is that same row — never a normal chat's draft.
    const row = loadTemplateRow(templateUidRef.current);
    const linked = !!row && (!pendingInvoiceRef.current || pendingInvoiceRef.current.id === row.id);
    if (linked && !pendingInvoiceRef.current) pendingInvoiceRef.current = { id: row!.id, no: row!.no };
    if (template || linked || loadTemplate(templateUidRef.current)) {
      // The sheet path awaits the delete and throws; every other caller keeps
      // the instant, fire-and-forget cleanup it had.
      if (strictRow) await discardTemplateRowStrict();
      else discardTemplateRow();
      setDraft(null);
      setReady(false);
    }
    clearTemplate();
    window.dispatchEvent(new Event('onit-new-chat'));
    setTemplateDraft(null);
    setAttachments([]);
    setTemplateDup(null);
    setTemplateRestored(client ? { v: 1, uid: templateUidRef.current, savedAt: Date.now(), kind: k, client, items: [], extra: '' } : null);
    setTemplateNonce((n) => n + 1);
    setTemplate(k);
  }
  const dropTemplate = () => { clearTemplate(); setTemplateRestored(null); setTemplateDraft(null); setTemplateDup(null); setTemplate(null); };
  // Close × (unsent): the template is discarded, and so is any draft row the
  // background pre-build already wrote for it (soft delete, drafts only) —
  // it never appears in Invoices or gets a "you have an unsent draft" nudge.
  // The chat's draft and row link reset so no card lingers.
  // Drop the template's unsent draft row (soft delete, drafts only) and its
  // pre-build, under a new conversation id — so the next insert can't hit the
  // old finalize_key and be handed the old row back.
  // The row such a discard would soft-delete: a draft, unsent, unlocked.
  function templateRowToDiscard() {
    const pending = pendingInvoiceRef.current;
    return pending && !finalizeSentRef.current && !isLockedStatus(linkedStatus) ? pending : null;
  }
  // Reset the link, the pre-build and the conversation id, so the next insert
  // cannot hit the old finalize_key and be handed the old row back.
  function resetTemplateRow() {
    // A discarded draft takes its remembered S1b with it.
    const discarded = pendingInvoiceRef.current?.id;
    if (discarded) forgetUnsentShare(discarded);
    pendingInvoiceRef.current = null;
    clearTemplateRow();
    preBuiltRef.current = null;
    preBuildIdRef.current++;
    setPrepState(null);
    setConvoId(genId());
    setAttachments([]);
  }
  // The one thing that did not happen: marking the shared document sent. The
  // POST only (no re-share). A failure throws, so the sheet or card names the
  // cause and stays up; the row stays a draft either way.
  async function postMarkSharedSent(pending: UnsentShare) {
    const res = await fetch(`/api/invoices/${pending.id}/send`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) throw res ?? new TypeError('Failed to fetch');
    setUnsentShare(null);
    setUnsentShareOpen(false);
    forgetUnsentShare(pending.id);
    setSentToast(unsentShareCopy(pending).done);
  }

  // Retry the share. sharePdf starts synchronously from the tap (iOS keeps the
  // tap's activation), then the same POST marks it sent.

  async function shareSharedAgain(pending: UnsentShare & { file: File | null; token: string | null }) {
    const pb = preBuiltRef.current;
    const file = pending.file ?? (pb && pb.id === pending.id ? pb.file : null);
    // The card disables this until the rebuild lands; never share a stale file.
    if (!file) return;
    const payUrl = pending.kind === 'invoice' && pending.token
      ? `${window.location.origin}/pay/${pending.token}`
      : null;
    const shared = sharePdf(file, shareText(docNoun(pending.kind), pending.client ?? 'your client', payUrl));
    const r = await shared;
    if (r.status === 'cancelled') return; // a normal choice; nothing is said
    if (r.status === 'failed') throw Object.assign(new Error('share failed'), { name: r.name });
    if (r.status === 'unsupported') downloadFile(file);
    await postMarkSharedSent(pending);
  }

  // The instant path (an untouched template, a swap): fire-and-forget.
  function discardTemplateRow() {
    const pending = templateRowToDiscard();
    if (pending) {
      void supabase.from('invoices').update({ deleted_at: new Date().toISOString() })
        .eq('id', pending.id).eq('status', 'draft').then(() => undefined, () => undefined);
    }
    resetTemplateRow();
  }
  // The sheet path: awaited, and a failed soft delete throws instead of being
  // swallowed, so PopSheet names the cause and keeps the draft. Nothing resets
  // until the row is actually gone, so a retry targets the same row.
  async function discardTemplateRowStrict() {
    const pending = templateRowToDiscard();
    if (pending) {
      const { error } = await supabase.from('invoices').update({ deleted_at: new Date().toISOString() })
        .eq('id', pending.id).eq('status', 'draft');
      if (error) throw error;
    }
    resetTemplateRow();
  }
  // P-16: × asks first when something was entered (the same rule the expense
  // card already used). An untouched template closes instantly.
  const [closeTemplateAsk, setCloseTemplateAsk] = useState(false);
  function closeTemplate() {
    if (templateHasContent(templateDraft) || templateHasContent(templateRestored)) {
      setCloseTemplateAsk(true);
      return;
    }
    closeTemplateNow();
  }
  function closeTemplateNow() {
    discardTemplateRow();
    setDraft(null);
    setReady(false);
    dropTemplate();
  }
  // Close × sheet's confirm. PopSheet awaits it, so "Discarding…" shows and a
  // failed soft delete throws instead of being swallowed: the sheet names the
  // cause, says the draft is still here, and stays open.
  async function discardTemplateFromSheet() {
    await discardTemplateRowStrict();
    setDraft(null);
    setReady(false);
    dropTemplate();
  }
  // "Make it a quote / an invoice": a row's kind is pinned once inserted
  // (lock_document_identity), so a pre-built row of the old kind is
  // discarded and the next pre-build / Send inserts one of the new kind.
  // D4: attachments follow the line items across the toggle. Whatever the card
  // shows is re-seeded as COPIES, because its bytes and rows belong to the row
  // being discarded — the new kind's build materializes them fresh under the
  // new invoice (the discarded row's own files are never touched). A pending
  // pick keeps its blob and just gets uploaded to the new invoice as usual.
  function switchTemplateKind(k: TemplateKind) {
    if (k === template) return;
    const carried = attachmentsRef.current.map((a) => ({
      ...a,
      storagePath: undefined,
      rowId: undefined,
      copyFromPath: a.storagePath ?? a.copyFromPath,
    }));
    if (pendingInvoiceRef.current) discardTemplateRow();
    if (carried.length) setAttachments(carried);
    setTemplate(k);
  }
  // The template feeds the chat's draft: complete → draft + ready (the
  // pre-build writes the row and the PDF); incomplete → not ready.
  useEffect(() => {
    if (!template) return;
    if (templateDraft) { setDraft(templateDraft); setReady(true); }
    else setReady(false);
  }, [template, templateDraft]);
  // L17 at Send, shared rule with the parse route: same client + same total in
  // the last 48 h. Checked before the tap (no await may sit between the tap and
  // the iOS share), shown as a note; Send still works.
  useEffect(() => {
    if (!template || !templateDraft || !profile) { setTemplateDup(null); return; }
    const d = templateDraft;
    const t = setTimeout(async () => {
      const total = calculateInvoiceTotals((d.line_items ?? []) as LineItem[], 0, (d.deposit_type as DepositType) ?? 'none', Number(d.deposit_value ?? 0)).total;
      const q = supabase.from('invoices').select('id').eq('user_id', profile.id).is('deleted_at', null)
        .ilike('client_name', escapeLike(d.client_name ?? '')).eq('total', total)
        .gte('created_at', new Date(Date.now() - 48 * 3600e3).toISOString()).limit(5);
      const { data } = await q;
      const others = ((data ?? []) as { id: string }[]).filter((r) => r.id !== pendingInvoiceRef.current?.id);
      setTemplateDup(others.length
        ? `Heads up — you already made one for ${d.client_name} at this amount in the last 2 days. Send makes a new one.`
        : null);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, templateDraft, profile]);
  // ── Save prompts (merge 2 · 2·13, UI-REDESIGN-AUDIT §1.5): after a send, an
  // unsaved client on its 2nd+ document and unsaved items used twice (template
  // sends) are offered for saving, one at a time, ~700 ms after the send.
  const [promptQueue, setPromptQueue] = useState<SavePrompt[]>([]);
  const [promptShown, setPromptShown] = useState<SavePrompt | null>(null);
  const promptShownRef = useRef<SavePrompt | null>(null);
  promptShownRef.current = promptShown;
  useEffect(() => {
    if (promptShown || promptQueue.length === 0) return;
    const t = setTimeout(() => {
      setPromptShown(promptQueue[0]);
      setPromptQueue((q) => q.slice(1));
    }, 700);
    return () => clearTimeout(t);
  }, [promptShown, promptQueue]);
  async function queueSavePrompts(name: string, lines: LineItem[], names: PromiseLike<unknown>) {
    const key = name.trim().toLowerCase();
    const [c, u, n] = await Promise.all([
      supabase.from('clients').select('name, saved_at, deleted_at').eq('name_key', key).maybeSingle()
        .then(({ data }) => data as { name: string; saved_at: string | null; deleted_at: string | null } | null, () => null),
      supabase.rpc('client_name_usage', { p_name: name })
        .then(({ data }) => (Array.isArray(data) ? data[0] : data) as { invoices: number; quotes: number } | null, () => null),
      names,
    ]);
    const cp = clientPrompt(
      c ? { name: c.name, saved: c.saved_at != null && c.deleted_at == null } : null,
      u ? { invoices: Number(u.invoices ?? 0), quotes: Number(u.quotes ?? 0) } : null,
    );
    const add = [...(cp ? [cp] : []), ...productPrompts(n, lines)];
    if (add.length) setPromptQueue((q) => enqueue(q, promptShownRef.current, add));
  }
  async function saveFromPrompt(p: SavePrompt): Promise<PromptSaveResult> {
    // A signed-out session is a cause of its own, not a failed save.
    const signedOut = (): PromptSaveResult => ({ ok: false, message: userMessage({ status: 401 }) });
    if (p.kind === 'recurring') {
      if (!profile) return signedOut();
      const { error } = await supabase.from('recurring_expenses').insert({
        user_id: profile.id, vendor: p.name, amount: p.amount, category: p.category,
        cadence: p.cadence, anchor_day: anchorFor(p.cadence, p.nextOn), next_on: p.nextOn, auto_log: true,
      });
      // Free and canceled users can't create recurring items (the trigger's
      // PAYWALL_RECURRING): this prompt is the upsell. Close the card (its
      // error state would claim a failed save) and open the wall instead.
      if (error?.hint === 'PAYWALL_RECURRING') {
        setPromptShown(null);
        setPaywallFor('recurring');
        return { ok: false, message: '' }; // the card leaves; the wall speaks
      }
      // 23505: it's already recurring (another device, a moment ago) — that's the goal.
      if (error && error.code !== '23505') return { ok: false, message: userMessage(error) };
      setMessages((m) => [...m, aMsg(savedLine(p, localToday()))]);
      return { ok: true };
    }
    if (p.kind === 'client') {
      // Through the client service (save mode = the same save_client RPC, run
      // with the stored spelling). The prompt is only offered for a client that
      // already matched exactly, so this is a match; if it somehow isn't, ask
      // instead of creating a second client.
      if (!profile) return signedOut();
      let saved: Awaited<ReturnType<typeof matchOrCreateClient>>;
      try {
        saved = await matchOrCreateClient(supabase, profile.id, { name: p.name }, { save: true });
      } catch (err) { return { ok: false, message: userMessage(err) }; }
      if (saved.status === 'ambiguous') {
        setPromptShown(null);
        setMessages((m) => [...m, aMsg(`I have more than one client like ${p.name}. Open Clients to save the right one.`, { skipHistory: true })]);
        return { ok: false, message: '' }; // the card leaves; the chat says which
      }
      if (saved.status === 'invalid') return { ok: false, message: userMessage({ status: 400 }) };
      markNewEntry('clients', saved.client.id); // glows in Clients (2·14)
    } else {
      // Price / unit are the last used ones, already on the row (record_product_use).
      const { data, error } = await supabase.from('products')
        .update({ saved_at: new Date().toISOString(), deleted_at: null })
        .eq('name_key', p.name.trim().toLowerCase()).select('id');
      // No row matched the name: it is gone, or the write was refused. Both are causes.
      if (error || !data?.length) return { ok: false, message: userMessage(error ?? { status: 404 }) };
      markNewEntry('products', clientNameKey(p.name));
    }
    setMessages((m) => [...m, aMsg(savedLine(p))]);
    return { ok: true };
  }
  const [plusMenu, setPlusMenu] = useState<'open' | 'closing' | null>(null);
  const plusTimer = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Composer shape: a pill while the text fits one line; once it wraps it turns
  // into a rounded box with the photo buttons on a bottom row (ChatGPT-style).
  // It stays a box until the field is emptied, so the wider layout can't
  // re-collapse it mid-sentence.
  const [composerBox, setComposerBox] = useState(false);
  useEffect(() => () => clearTimeout(plusTimer.current), []);
  function closePlusMenu() {
    if (plusMenu !== 'open') return;
    setPlusMenu('closing');
    clearTimeout(plusTimer.current);
    plusTimer.current = setTimeout(() => setPlusMenu(null), MENU_CLOSE_MS);
  }
  function plusTap() {
    if (plusMenu === 'open') { closePlusMenu(); return; }
    clearTimeout(plusTimer.current);
    setPlusMenu('open');
  }
  function pickFromPlus(k: ComposerPick) {
    if (k === 'mic') {
      // Voice = exactly today's mic: micTap() runs synchronously inside this tap, so
      // iOS still allows the speech priming and the mic permission prompt.
      micTap();
      closePlusMenu(); // the menu reverses out (1d: an option pick closes it too)
      return;
    }
    // New invoice / New quote (2·12c, ends §L Q1's seeded-chat interim): the
    // menu closes and the field becomes the template card in that mode.
    setPlusMenu(null);
    clearTimeout(plusTimer.current);
    if (k === 'expense') {
      // Own state, not TemplateKind: opening this must not archive the live
      // conversation or clear a saved invoice/quote template.
      if (!expenseDraft) {
        setReceipt(null);
        setExpenseDraft({
          amount: 0,
          category: 'other',
          vendor: null,
          occurred_on: today(),
          description: null,
        });
      }
      setExpenseError(null);
      setExpenseTemplate(true);
      return;
    }
    startNewTemplate(k);
  }

  function micTap() {
    // iOS Safari only lets TTS start from a user gesture. Prime it here, inside
    // the tap, so the reply — spoken later after async transcribe+parse — is
    // allowed to play. Cheap and idempotent; safe on every tap.
    primeSpeech();
    if (!voiceSession) {
      setVoiceSession(true); sessionRef.current = true;
      void startRecording();
    } else if (recording) {
      recorderRef.current?.stop(); // finish this turn → transcribe → send
    } else {
      void startRecording();       // session on, idle → speak the next turn
    }
  }

  function endVoiceSession() {
    setVoiceSession(false); sessionRef.current = false;
    setTranscribing(false); setVoiceError(null);
    micRetryRef.current = false; setMicBlocked(null);
    stopSpeech();
    if (recording && recorderRef.current) {
      recAbortRef.current = true;
      recorderRef.current.stop();
    }
    // Release the session mic. The stream is reused across takes, so it is only
    // stopped here and on unmount — never per take.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Cancel any speech / capture if the screen unmounts. Conversation state is a
  // separate concern: it is persisted to localStorage and restored on mount and
  // on visibilitychange, so an app switch never loses the draft.
  useEffect(() => () => {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  function openHistoryEntry(entry: HistoryEntry) {
    // an unfinished live conversation gets archived before we switch away
    if (!finished && messages.length >= 2 && convoId && convoId !== entry.id) {
      pushHistory(storageNsRef.current ?? 'guest', {
        id: convoId,
        title: convoTitle(messages, draft),
        date: Date.now(),
        finalized: false,
        messages,
        draft,
        ready,
        cardAfterId,
      });
    }
    entry.messages.forEach((m) => restoredMsgIdsRef.current.add(m.id));
    setMessages(entry.messages);
    setCardAfterId(entry.cardAfterId ?? null);
    setPendingChange(null);
    setConvoId(entry.id);
    setShowHistory(false);
    // Default to the stored draft; the DB re-link below overrides it for a
    // locked (sent/paid) invoice so the read-only card + Revise can show.
    setDraft(entry.draft);
    setReady(Boolean(entry.ready) && !entry.finalized);
    setFinished(entry.finalized); // finalized ones stay read-only until a new message
    pendingInvoiceRef.current = null;
    finalizeSentRef.current = false;
    setLinkedStatus(null);
    setLinkedAmountPaid(0);

    // Commit B: re-link this conversation to its saved invoice (finalize_key =
    // convoId) and read its live status. A sent/paid invoice reopens as a locked,
    // read-only card, rebuilt from the row since finalized history stores no draft.
    void (async () => {
      try {
        const { data: row } = await supabase
          .from('invoices')
          .select('id, invoice_number, status, amount_paid, kind, client_name, client_address, client_phone, client_email, line_items, tax_rate, notes, private_notes, due_date, deposit_type, deposit_value')
          .eq('finalize_key', entry.id)
          .is('deleted_at', null)
          .maybeSingle();
        if (!row?.id) return; // no saved row — plain draft/finalized entry as set above
        pendingInvoiceRef.current = { id: row.id as string, no: row.invoice_number as number };
        setLinkedStatus((row.status as string) ?? null);
        setLinkedAmountPaid(Number(row.amount_paid ?? 0));
        void loadLinkedAttachments(row.id as string);
        if (isLockedStatus((row.status as string) ?? null)) {
          setDraft(draftFromRow(row));
          setDraftHistory([]);
          setReady(true);
          setFinished(false); // show the locked card, not the read-only transcript tail
        }
      } catch { /* leave the stored-draft view in place on a fetch failure */ }
    })();
  }

  const previewItems = (draft?.line_items ?? []) as LineItem[];
  const previewDepositType = ((draft as any)?.deposit_type as DepositType) ?? 'none';
  const previewDepositValue = Number((draft as any)?.deposit_value ?? 0);
  const previewTotals = calculateInvoiceTotals(
    previewItems,
    draft?.tax_rate ?? 0,
    previewDepositType,
    previewDepositValue
  );
  const isValidTotal = Number.isFinite(previewTotals.total);
  const quoteDraft = !!draft && docKind(draft) === 'quote';
  const pdfReady = !profileLoaded ? false
    : !profile ? false
    // An estimate shares a link: there is no file to build or wait for.
    : quoteDraft ? false
    // No pre-build for capped tiers — except a restored S1b, which has no file
    // in hand and still needs one before its tap.
    : skipPreBuild && !s1bNeedsFile ? false
    : !draft ? false
    : prepState?.sig === draftSignature(draft) && prepState?.status === 'ready';
  // A failed build only matters for the draft it was built from: an edit moves
  // the signature and the pre-build effect retries on its own.
  const pdfFailed = !quoteDraft && prepState?.status === 'failed'
    && !!draft && prepState.sig === draftSignature(draft);
  // Send is NEVER disabled while a file builds (§04): an estimate needs no file,
  // and an invoice can always take the build-at-tap path. This flag only says
  // the profile lookup is still in flight (the tap routes to sign-in).
  const sendReady = !profileLoaded ? false : !profile ? true : !!draft;
  // Commit B: the linked invoice has left 'draft' — the card is read-only.
  const locked = isLockedStatus(linkedStatus);
  // The draft controls fold away when the card seals instead of vanishing: they
  // stay mounted for the 260ms exit (grid rows 1fr -> 0fr, nothing measured) and
  // the read-only block arrives when it ends. A card restored already locked
  // swaps at once, and reduced motion swaps at once too.
  const wasLockedRef = useRef(locked);
  const [draftControlsOut, setDraftControlsOut] = useState(locked);
  useEffect(() => {
    if (!locked) { wasLockedRef.current = false; setDraftControlsOut(false); return; }
    if (wasLockedRef.current) { setDraftControlsOut(true); return; }
    wasLockedRef.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDraftControlsOut(true);
      return;
    }
    const timer = setTimeout(() => setDraftControlsOut(true), 280);
    return () => clearTimeout(timer);
  }, [locked]);

  // A locked estimate card needs its public token for Copy link / Share. Read it
  // from the row (RLS: own rows) so a reload or a reopen from history gets it too.
  const lockedQuote = locked && !!draft && docKind(draft) === 'quote';
  useEffect(() => {
    const id = pendingInvoiceRef.current?.id;
    if (!lockedQuote || !id) { setLinkedToken(null); return; }
    let live = true;
    void supabase.from('invoices').select('public_token, valid_until').eq('id', id).maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        setLinkedToken((data?.public_token as string) ?? null);
        setLinkedValidUntil((data?.valid_until as string | null) ?? null);
      }, () => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedQuote, linkedStatus]);

  // Apply an inline line-item edit (description, qty, or unit_price) into the
  // current draft. The edit lives on the draft only, so it flows into the PDF and
  // the saved row on send (buildRenderData recomputes subtotal/tax/total from
  // line_items), and "Change something" / a re-parse can still replace it.
  function applyDraftLineItems(items: LineItem[]) {
    if (draft) {
      setDraftHistory((prev) => [...prev.slice(-19), draft]);
    }
    setDraft((d) => (d ? { ...d, line_items: items } : d));
  }

  function applyDraftDeposit(type: DepositType, value: number) {
    if (draft) {
      setDraftHistory((prev) => [...prev.slice(-19), draft]);
      setDraft({ ...draft, deposit_type: type, deposit_value: value } as any);
    }
  }

  // Tax rate in percent, 0 = none. Capped at 30 (no sales tax is higher).
  function applyDraftTax(rate: number) {
    if (draft) {
      setDraftHistory((prev) => [...prev.slice(-19), draft]);
      setDraft({ ...draft, tax_rate: Math.min(Math.max(rate, 0), 30) } as any);
    }
  }

  function applyDraftNotes(notes: string) {
    if (draft) {
      setDraftHistory((prev) => [...prev.slice(-19), draft]);
      setDraft({ ...draft, notes } as any);
    }
  }

  // Undo last edit: the items area flashes warm gold once (450ms). The counter
  // keys the wrapper so the flash replays on every undo; nothing else remounts.
  const [itemsFlash, setItemsFlash] = useState(0);
  function undoLastEdit() {
    if (draftHistory.length === 0) return;
    const previous = draftHistory[draftHistory.length - 1];
    setDraftHistory((prev) => prev.slice(0, -1));
    setDraft(previous);
    setItemsFlash((n) => n + 1);
  }

  // The question is open: the card is up and Send reads "Pick a client first".
  const clientQuestionOpen = !!clientChoice
    && clientQuestionPending({ question: clientChoice, convo: convoId || null, draftName: draft?.client_name });
  // The card sits below the invoice preview, off-screen on a phone: bring it up.
  const clientCardRef = useRef<HTMLDivElement | null>(null);
  function scrollToClientQuestion() {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    clientCardRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }
  // When the question appears (after the list's own pin-to-bottom has run).
  useEffect(() => {
    if (!clientQuestionOpen) return;
    const id = requestAnimationFrame(scrollToClientQuestion);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientQuestionOpen]);

  // ── Client choice resolvers (lib/services/clients) ──────────
  // The card below the chat after finalize() paused on a close-but-not-exact
  // client. A pick uses an id from the candidates the service returned (never
  // anything else), writes the client's stored spelling onto the draft, and
  // resumes the send. "New client" resumes it with creation allowed.
  function pickClientChoice(choice: ClientRecord | 'new') {
    if (!clientChoice || phase) return;
    const convo = convoId || null;
    if (choice === 'new') {
      forceNewClientRef.current = { key: clientNameKey(clientChoice.typed), convo };
      clientAskRef.current = null;
      setClientChoice(null);
      void finalize();
      return;
    }
    const picked = clientChoice.candidates.find((c) => c.id === choice.id);
    if (!picked) return;
    resolvedClientRef.current = { id: picked.id, key: clientNameKey(picked.name), convo };
    clientAskRef.current = null;
    setClientChoice(null);
    setMessages((m) => [...m, aMsg(`Using ${picked.name}.`, { skipHistory: true })]);
    resumeAfterPickRef.current = true;
    setDraft((prev) => (prev ? { ...prev, client_name: picked.name } : prev));
  }
  // Any edit to the draft retires the question: the next Send asks afresh, once.
  useEffect(() => {
    if (clientChoice && draftFingerprint(draft) !== clientChoice.fp) {
      clientAskRef.current = null;
      setClientChoice(null);
    }
  }, [draft, clientChoice]);
  // The pick rewrote draft.client_name; once that render is in, send. Reading
  // `draft` here (not in pickClientChoice) is what makes the resumed finalize
  // build its row and PDF with the stored spelling.
  useEffect(() => {
    if (!resumeAfterPickRef.current) return;
    const settled = resolvedClientRef.current;
    if (!draft?.client_name || !settled || clientNameKey(draft.client_name) !== settled.key) return;
    resumeAfterPickRef.current = false;
    void finalize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // ── Change guard resolvers (Commit A) ───────────────────────
  // "Update this one": apply the held draft as a normal edit. The link is kept,
  // so the next finalize UPDATES the same row.
  function resolvePendingChangeUpdate() {
    if (!pendingChange) return;
    const next = pendingChange.draft;
    setDraft((prev) => {
      if (prev) setDraftHistory((hist) => [...hist.slice(-19), prev]);
      return next;
    });
    setReady(true);
    // Under the "This would change…" question the user just answered.
    setCardAfterId(messages[messages.length - 1]?.id ?? null);
    setPendingChange(null);
  }

  // "Start a new invoice": same reset as the header new-chat button (archive the
  // current conversation, fresh convoId, cleared link), then seed the new
  // conversation with the held draft so the user lands on the new card.
  function resolvePendingChangeNew() {
    if (!pendingChange) return;
    const seed = pendingChange.draft;
    if (!finished && messages.length >= 2) {
      pushHistory(storageNsRef.current ?? 'guest', {
        id: convoId || genId(),
        title: convoTitle(messages, draft),
        date: Date.now(),
        finalized: false,
        messages,
        draft,
        ready,
        cardAfterId,
      });
    }
    pendingInvoiceRef.current = null;
    finalizeSentRef.current = false;
    setConvoId(genId());
    setDraftHistory([]);
    setFinished(false);
    setLinkedStatus(null);
    setLinkedAmountPaid(0);
    setInvoiceUsage(null);
    setAttachments([]);
    const hello = greeting();
    setMessages([hello]);
    setDraft(seed);
    setReady(true);
    playCardAnim('enter', 1800);
    setCardAfterId(hello.id);
    setDuplicateHint(false);
    setPendingChange(null);
  }

  // ── Revise a locked, sent, unpaid invoice (Commit C) ────────
  // Opens a NEW draft invoice in a fresh conversation, seeded from the original's
  // content plus a "Replaces INV-XXXX" note. The original row is never touched —
  // this inserts a brand-new invoice (next number) on its first save because the
  // conversation (and thus finalize_key) is fresh and the link is cleared. Only
  // offered when status is 'sent' and amount_paid is 0; paid/partly-paid stays
  // fully locked (a revision then would be a credit/refund — see PUNCH-LIST). We
  // deliberately do NOT re-archive the current conversation: the original is
  // already a real sent invoice (and, if reached via history, already has its
  // finalized entry, which pushHistory would otherwise overwrite by id).
  // Revise transition (MOTION-SPEC §5): the locked card folds out (150ms), then
  // the new conversation's draft card builds in like any fresh card. The ref
  // drops repeat taps for the whole transition; a 20+ item draft is safe
  // because the build-in only animates the first 8 rows.
  // Builder → card morph (docs/design/onit-chat · Prototype 1a/1b). The builder
  // stays mounted for one hero beat AFTER the server confirms (finishFinalize
  // runs only then), so its shared client/item/price/total nodes can travel into
  // the card. It ghosts out, then leaves. A timer ref keeps a repeat send from
  // restarting the beat; unmount clears it.
  const [morphing, setMorphing] = useState(false);
  const morphTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(morphTimerRef.current), []);
  // The travel itself: clones the builder's shared nodes into a fixed overlay and
  // carries them to the card's nodes (lib/morph-shared, 600ms settle). Both trees
  // are mounted for this beat — the card renders beside the builder while
  // `morphing` is true — so the geometry comes from the live DOM, and the timer
  // above drops the builder once the travel has landed.
  useEffect(() => {
    if (!morphing) return;
    return morphSharedNodes(
      document.querySelector('[data-builder]'),
      document.querySelector('[data-ledger-card]'),
    );
  }, [morphing]);
  // P-15: Revise used to act on the first tap. It makes a second document from a
  // locked one, so it asks first (board C5).
  const [reviseAsk, setReviseAsk] = useState(false);
  const revisingRef = useRef(false);
  function reviseInvoice() {
    if (!draft || revisingRef.current) return;
    // 4A: an estimate has no revise/duplicate path. An invoice keeps Revise.
    if (docKind(draft) === 'quote') {
      setReviseAsk(false);
      setMessages((msgs) => [...msgs, aMsg("Estimates can't be revised. Send a new estimate instead.")]);
      return;
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { startRevision(); return; }
    revisingRef.current = true;
    playCardAnim('exit', 400);
    setTimeout(() => {
      revisingRef.current = false;
      startRevision();
      playCardAnim('enter', 1800);
    }, 150);
  }
  function startRevision() {
    if (!draft) return;
    const kind = docKind(draft);
    const sourceInvoiceId = pendingInvoiceRef.current?.id ?? null;
    const originalNo = pendingInvoiceRef.current?.no ?? null;
    const label = originalNo != null ? formatDocNumber(kind, originalNo) : 'the original';
    // One line naming the invoice this one replaces. Revising a revision drops
    // the earlier line (older "Revises …" wording included), so the client only
    // ever sees the latest invoice to ignore.
    const reviseNote = `Replaces ${label}`;
    const existingNotes = (draft.notes ?? '')
      .split('\n')
      .filter((line) => !/^(Replaces|Revises) ((INV|Q)-\d+|the original)$/i.test(line.trim()))
      .join('\n')
      .trim();
    // Spread copies line items, tax, client, due date, and the deposit fields
    // (which ride on the draft as snake_case); reset intent_explicit and append
    // the revision note.
    const seed: Partial<ExtractResult> = {
      ...draft,
      intent: kind,
      intent_explicit: false,
      notes: existingNotes ? `${existingNotes}\n${reviseNote}` : reviseNote,
    };
    // The seed's line items are copied, not freshly AI-parsed — no original text
    // to record on the new invoice's first save.
    originalDescriptionsRef.current = [];
    pendingInvoiceRef.current = null;
    finalizeSentRef.current = false;
    setConvoId(genId());
    setDraftHistory([]);
    setPendingChange(null);
    setLinkedStatus(null);
    setLinkedAmountPaid(0);
    setFinished(false);
    setInvoiceUsage(null);
    setAttachments([]);
    const startMsg = aMsg(`Starting a revision of ${label}. Change anything, then send — this is a new ${kind} and the original stays as it was.`);
    // The revision opens on the original conversation (so you, and the AI on
    // the next change, still see the job as first described), then the start
    // line, with the new card under it. Dropped so nothing stale is tappable:
    // failed bubbles (their retry button), old "start new chat" buttons, and
    // quiet usage lines. Copies only — the original's History entry is keyed
    // by the old convoId and is never rewritten.
    const carried = messages.filter((m) => !m.failed && m.action !== 'new-chat' && !m.quiet && !m.skipHistory);
    setMessages([...(carried.length ? carried : [greeting()]), startMsg]);
    setDraft(seed);
    setReady(true);
    setCardAfterId(startMsg.id);
    setDuplicateHint(false);
    // D4: attachments follow the line items. Seed copies of the original's
    // images; they materialize into the new invoice at the first build.
    if (sourceInvoiceId) void seedRevisionAttachments(sourceInvoiceId);
  }

  // The invoice/quote card renders INSIDE the transcript, right after its
  // anchor message (cardAfterId), so later messages land below it. A missing
  // or stale anchor (older saved chats) falls back to the last message.
  // Alive layer: one feed, drawn where each card happened. A card sits just
  // before the first message that came after it; cards older than the oldest
  // timestamped message (or newer than the last) fall to the end, which is how
  // the thread read before messages carried `at`.
  // ── Signed out → signed in ──────────────────────────────────────────────
  // (1) The auth state is watched for the life of the screen, so signing in from
  //     another tab or window is noticed too: the profile loads, the namespace
  //     moves to the account, and the guest draft is adopted.
  // (2) Once signed in and idle, the LAST remembered question is claimed (removed
  //     from sessionStorage first: a refresh, a second render or a second tab can
  //     never run it again) and sent exactly as if it had just been typed.
  // (3) The "not signed in" message and its button leave with the sign-in.
  const [replay, setReplay] = useState<{ text: string; source: AskSource } | null>(null);
  const replayClaimRef = useRef(false); // set from the claim until send() starts
  const profileRef = useRef<Profile | null>(null);
  profileRef.current = profile;
  const authWatchRef = useRef(false);
  useEffect(() => {
    if (authWatchRef.current) return;
    authWatchRef.current = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id;
      // Only a sign-in that arrives while this screen still has no profile (another
      // tab or window signed in). The mount effect owns every other open, so a tab
      // refocus or token refresh costs no extra query.
      if (!uid || event !== 'SIGNED_IN' || profileRef.current) return;
      void (async () => {
        try {
          const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
          if (error) throw error;
          if (!data) return; // not onboarded: the mount effect owns that redirect
          adoptGuestChat(uid);
          storageNsRef.current = storageNamespace(uid);
          setProfile((p) => p ?? (data as Profile));
          setProfileLoaded(true);
        } catch (err) {
          // Say what failed. The question stays remembered; Retry re-sends it.
          const q = readPending();
          const reason = signInFailureMessage(classifySignInFailure(err, typeof navigator !== 'undefined' && navigator.onLine === false));
          setMessages((m) => [...m.filter((x) => !x.signInLink), aMsg(reason, q ? { failed: { op: 'send', text: q.text }, skipHistory: true } : { skipHistory: true })]);
        }
      })();
    });
    return () => { subscription.unsubscribe(); authWatchRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signed in: drop the sign-in prompts, whether or not a question was remembered.
  useEffect(() => {
    if (!profile) return;
    setMessages((m) => afterSignIn(m, null));
  }, [profile, messages]);

  // Claim and replay. The decision is pure (replayDecision); the ref is the
  // synchronous guard behind it, and the claim removes the stored question first.
  useEffect(() => {
    if (!hydrated || replayClaimRef.current) return;
    const decision = replayDecision({
      pending: readPending(),
      signedIn: !!profile,
      profileReady: profileLoaded,
      busy: phase !== null || sendRef.current,
      now: Date.now(),
    });
    if (decision === 'clear') { clearPending(); return; }
    if (decision !== 'run') return;
    replayClaimRef.current = true;
    const q = claimPending();
    if (!q) { replayClaimRef.current = false; return; }
    setMessages((m) => afterSignIn(m, q.text));
    setReplay({ text: q.text, source: q.source });
  }, [hydrated, profile, profileLoaded, phase, messages]);

  // Run the claimed question once the thread no longer holds the prompts (this
  // render's `send` sees the cleaned thread). Cleared on every exit: send()
  // answers it, or leaves a failed bubble with Retry; either way it is not kept.
  useEffect(() => {
    if (!replay || phase !== null || sendRef.current) return;
    if (messages.some((m) => m.signInLink)) return;
    const r = replay;
    setReplay(null);
    replayClaimRef.current = false;
    void send(r.text, r.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay, phase, messages]);

  // Recaps, no cron, and only sometimes: on an app open the dice (lib/recap-schedule.ts)
  // decide whether one shows. At most one a day, the weekly at most once a week,
  // never on two opens in a row. A recap you ask for always shows (send()). An
  // automatic card is `auto`: it is not saved with the thread, so it never
  // comes back on its own on the next open.
  const recapRanRef = useRef(false);
  useEffect(() => {
    if (!hydrated || recapRanRef.current) return;
    recapRanRef.current = true;
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (readPending()) return; // a remembered question is about to be answered: no surprise card on top
        const key = recapStateKey(user.id);
        const read = (): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
        const write = (st: RecapState) => { try { localStorage.setItem(key, JSON.stringify(st)); } catch { /* storage blocked */ } };
        const now = new Date();
        const state = parseRecapState(read());
        const kind = decideAutoRecap(now, state, Math.random);
        if (!kind) { write(recapStateAfterOpen(state, now, null)); return; }
        const rows = await loadRecapRows(supabase);
        if (!rows) return; // try again next open; nothing was marked
        const model = buildRecap({ now, kind, mode: 'auto', ...rows });
        if (isEmptyRecap(model)) { write(recapStateAfterOpen(state, now, null)); return; }
        write(recapStateAfterOpen(state, now, kind));
        setMessages((m) => [...m, aMsg(model.title, { recapCard: model, skipHistory: true, auto: true })]);
      } catch { /* recaps are a courtesy; the thread works without them */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const mountedAtRef = useRef(Date.now());
  const feedEvents = useChatEventFeed(chatStartedAtFrom(messages, mountedAtRef.current));
  const feedSplit = splitEventsByMessage(feedEvents, messages);
  const openDocument = (id: string) => router.push(`/invoices/${id}`);
  const runEventAction = (e: EventRow, action: EventAction) => {
    if (!e.invoice_id) return;
    // The card's Convert runs in place (renderEvent); this is the reminder path,
    // and Convert's paywall fallback: both land on the document, where Request
    // balance is the existing re-share and the paywall lives.
    openDocument(e.invoice_id + (action === 'convert' ? '?convert=1' : ''));
  };
  const renderEvent = (e: EventRow) => {
    const line = eventContextLine(e, money);
    return (
      <Fragment key={e.id}>
        {line.before && <AssistantLine>{line.before}</AssistantLine>}
        <EventCard
          event={e}
          money={money}
          onOpen={e.invoice_id ? () => openDocument(e.invoice_id as string) : undefined}
          onRemind={() => runEventAction(e, 'remind')}
          // Convert runs here, in the card: idempotent, with its own pending and
          // error states. The paywall lives on the estimate, so that case opens it.
          onConvert={() => { void runConvert(e, (estimateId) => router.push(`/invoices/${estimateId}?convert=1`)); }}
        />
        {line.after && <AssistantLine>{line.after}</AssistantLine>}
      </Fragment>
    );
  };

  // Owner outcomes come back as local cards. A screen finishes the action and
  // posts one; here it is appended live, and anything posted while the chat was
  // unmounted (the estimate screen navigates away) is drained after restore, so
  // a restore can never overwrite it.
  const ownerCardsDrained = useRef(false);
  useEffect(() => {
    const append = (card: OwnerCard) => {
      if (!card?.title || !card.invoiceId) return;
      setMessages((m) => [...m, aMsg(card.title, { ownerCard: { title: card.title, invoiceId: card.invoiceId } })]);
    };
    const onCard = (e: Event) => {
      drainOwnerCards(); // the live event consumed the queue
      append((e as CustomEvent<OwnerCard>).detail);
    };
    window.addEventListener(OWNER_CARD_EVENT, onCard);
    return () => window.removeEventListener(OWNER_CARD_EVENT, onCard);
  }, []);
  useEffect(() => {
    if (!hydrated || ownerCardsDrained.current) return;
    ownerCardsDrained.current = true;
    for (const card of drainOwnerCards()) {
      setMessages((m) => [...m, aMsg(card.title, { ownerCard: { title: card.title, invoiceId: card.invoiceId } })]);
    }
  }, [hydrated]);

  const cardAnchorId = cardAfterId && messages.some((m) => m.id === cardAfterId)
    ? cardAfterId
    : messages[messages.length - 1]?.id ?? null;
  // During the morph the builder is still mounted, so the card has to render
  // beside it for the shared nodes to travel.
  const ledgerCard = ready && draft && (!template || morphing) ? (
    // Ledger sheet (docs/design/onit-chat · CardLedger): the state strip, the
    // client block and the paper are LedgerCard's; everything below is the
    // card's own controls, unchanged. Only real text entry / selects opt out
    // of the tab swipe (swipeBlockedAt) — the card's padding, labels and
    // buttons hand a horizontal drag to the deck.
    <LedgerFrame
      state={!locked ? 'draft' : docKind(draft) === 'quote' ? 'ready' : 'sent'}
      pillLabel={locked && linkedStatus !== 'sent'
        ? lockBadgeText(linkedStatus, linkedAmountPaid, docKind(draft))
        : undefined}
      kind={docKind(draft)}
      clientName={draft.client_name}
      anim={cardAnim}
    >
      {duplicateHint && !locked && (
        // Passive indicator only — the card stays fully actionable below.
        <div className="mb-3 mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-on-background">
          <Icon name="error" size={16} filled />
          Similar invoice sent recently
        </div>
      )}
      <div key={`items-${itemsFlash}`} className={`rounded-[10px]${itemsFlash ? ' onit-undo-flash' : ''}`}>
        <LineItemsEditor items={previewItems} editable={!locked} onChange={applyDraftLineItems} variant="ledger" />
      </div>

      <AttachmentsEditor
        items={attachments}
        editable={!locked}
        onChange={setAttachments}
        onRemove={(a) => (a.storagePath ? removeSavedAttachment(a) : undefined)}
      />

      <div className="mt-3 border-t border-outline-variant/30 pt-2.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-on-surface-variant">Deposit required</span>
          <div className="flex items-center gap-1.5">
            <select
              className="h-11 min-h-[44px] rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 text-xs font-semibold text-on-surface outline-none disabled:opacity-50"
              disabled={locked}
              value={(draft as any).deposit_type ?? 'none'}
              onChange={(e) => {
                const dt = e.target.value as DepositType;
                const val = dt === 'none' ? 0 : ((draft as any).deposit_value ?? (dt === 'percentage' ? 40 : 100));
                applyDraftDeposit(dt, val);
              }}
            >
              <option value="none">None</option>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed ($)</option>
            </select>
            {((draft as any).deposit_type === 'percentage' || (draft as any).deposit_type === 'fixed') && (
              <DepositValueInput
                mode={(draft as any).deposit_type}
                disabled={locked}
                className="h-11 min-h-[44px] w-20 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 text-right text-xs font-semibold outline-none disabled:opacity-50"
                value={(draft as any).deposit_value}
                placeholder={(draft as any).deposit_type === 'percentage' ? '40' : '100'}
                onChange={(v) => applyDraftDeposit((draft as any).deposit_type as DepositType, v)}
              />
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-on-surface-variant">Tax</span>
          <div className="flex items-center gap-1.5">
            {(draft.tax_rate ?? 0) > 0 || taxOpen ? (
              <>
                <DepositValueInput
                  mode="percentage"
                  disabled={locked}
                  className="h-11 min-h-[44px] w-20 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 text-right text-xs font-semibold outline-none disabled:opacity-50"
                  value={(draft.tax_rate ?? 0) > 0 ? draft.tax_rate : null}
                  placeholder="0"
                  onChange={applyDraftTax}
                />
                <span className="text-xs font-semibold text-on-surface-variant">%</span>
                {!locked && (
                  <button type="button" aria-label="Remove tax" onClick={() => { setTaxOpen(false); applyDraftTax(0); }}
                    className="grid h-11 min-h-[44px] w-11 place-items-center text-on-surface-variant transition active:opacity-60">
                    <Icon name="close" size={16} />
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                disabled={locked}
                onClick={() => setTaxOpen(true)}
                className="h-11 min-h-[44px] rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 text-xs font-semibold text-primary outline-none transition active:opacity-60 disabled:opacity-50"
              >
                + Add tax
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">
            Notes
          </label>
          <textarea
            className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2.5 py-1.5 text-xs text-on-surface outline-none resize-none disabled:opacity-50"
            rows={2}
            maxLength={400}
            disabled={locked}
            placeholder="Deposit due before materials are ordered. 3-5 day lead time."
            value={draft.notes ?? ''}
            onChange={(e) => applyDraftNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Charcoal total block (Ledger). Values stay calculateInvoiceTotals'
          (single source of truth); the tax/deposit lines only describe them. */}
      <LedgerTotals
        label={previewTotals.depositAmount > 0 ? 'Deposit due now' : docKind(draft) === 'quote' ? 'Estimate total' : 'Total due'}
        sublines={
          (draft.tax_rate ?? 0) > 0 || previewTotals.depositAmount > 0 ? (
            <div className="mt-1.5 space-y-0.5">
              {(draft.tax_rate ?? 0) > 0 && (
                <>
                  <div className="flex justify-between gap-4 text-[12px] text-inverse-on-surface/70">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{money(previewTotals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-[12px] text-inverse-on-surface/70">
                    <span>Tax ({draft.tax_rate}%)</span>
                    <span className="tabular-nums">{money(previewTotals.taxAmount)}</span>
                  </div>
                </>
              )}
              {previewTotals.depositAmount > 0 && (
                <>
                  <div className="flex justify-between gap-4 text-[12px] text-inverse-on-surface/70">
                    <span>{(draft as any).deposit_type === 'percentage' ? `${(draft as any).deposit_value}% deposit` : 'Deposit'}</span>
                    <span className="tabular-nums">{money(previewTotals.depositAmount)}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-[12px] text-inverse-on-surface/70">
                    <span>Remaining</span>
                    <span className="tabular-nums">{money(previewTotals.remaining)}</span>
                  </div>
                </>
              )}
            </div>
          ) : undefined
        }
      >
        <CountUpMoney
          value={previewTotals.amountDueNow}
          run={cardAnim === 'enter'}
          format={money}
          delayMs={180 + Math.min(previewItems.length, 8) * 70 + 60}
        />
      </LedgerTotals>
      {locked && draftControlsOut ? (
        // Read-only (Commit B/C): the invoice has left 'draft'. A sent,
        // unpaid invoice offers "Revise" (opens an editable copy as a new
        // invoice — Commit C); once any payment has landed it stays fully
        // locked (a revision would be a credit/refund — see PUNCH-LIST).
        <div
          className={`mt-3 border-t border-outline-variant/30 pt-3${cardAnim === 'lock' ? ' onit-fade-in' : ''}`}
          style={cardAnim === 'lock' ? { animationDelay: '400ms' } : undefined}
        >
          {linkedStatus === 'sent' && linkedAmountPaid === 0 ? (
            <>
              <p className="text-center text-sm text-on-surface-variant">
                {docKind(draft) === 'quote'
                  ? `Copy or share the link with ${draft.client_name ?? 'your client'}.`
                  : <>This invoice was sent, so it&apos;s locked.</>}
              </p>
              {lockedQuote && linkedToken && estimateLink(linkedToken) && (
                // Copy link, then Share 40ms later (globals: .onit-ready-actions).
                <div className="mt-3 onit-ready-actions">
                  <EstimateLinkActions
                    url={estimateLink(linkedToken)!}
                    title={pendingInvoiceRef.current ? formatDocNumber('quote', pendingInvoiceRef.current.no) : 'Estimate'}
                    businessName={profile?.business_name}
                    onShared={() => {
                      // §02: a share has no system confirmation, so the assistant
                      // says it happened (and promises the first view). Once per card.
                      const who = (draft?.client_name ?? '').trim().split(/\s+/)[0];
                      setMessages((m) => [...m, aMsg(
                        who
                          ? `Shared. I'll ping you as soon as ${who} opens it.`
                          : "Shared. I'll ping you as soon as it's opened.",
                      )]);
                    }}
                  />
                </div>
              )}
              {/* 4A: an estimate has no revise/duplicate path; invoices keep Revise. */}
              {docKind(draft) !== 'quote' && (
                <>
                  <button className="btn-primary onit-ready-revise mt-3 w-full" disabled={phase !== null} onClick={() => setReviseAsk(true)}>
                    <Icon name="edit" size={18} /> Revise
                  </button>
                  <p className="mt-1 text-center text-xs text-on-surface-variant/80">
                    Opens an editable copy as a new invoice. The original stays as it was.
                  </p>
                </>
              )}
            </>
          ) : (
            <p className="text-center text-sm text-on-surface-variant">
              {lockBadgeText(linkedStatus, linkedAmountPaid)}. Start a new invoice to make changes.
            </p>
          )}
        </div>
      ) : (
        // Still mounted while it exits, so the seal folds the controls away
        // instead of dropping the block out from under the layout.
        <div className={`onit-collapse${locked ? ' is-exiting' : ''}`} aria-hidden={locked || undefined}>
        <div>
          {!isValidTotal && (
            <p className="mt-2 rounded-[10px] bg-error-container px-2.5 py-2 text-xs font-semibold text-error-on-container">
              {UNREADABLE_PRICES_TEXT}
            </p>
          )}
          {/* §04 PDF state. An estimate has no file, so this row is invoices only.
              Send stays enabled in every one of these states. */}
          {!quoteDraft && !(unsentShare && !unsentShareOpen) && (
            <div className="mt-3">
              {pdfFailed ? (
                <div className="flex items-center gap-2 rounded-[12px] border border-error/40 bg-error-container/70 px-3 py-2">
                  <Icon name="error" size={18} className="shrink-0 text-error" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-on-error-container">Couldn&apos;t build the PDF</p>
                    <p className="text-[12px] leading-snug text-on-error-container/80">Weak signal. Your invoice is safe.</p>
                  </div>
                  <button
                    type="button"
                    onClick={retryPrebuild}
                    className="min-h-touch shrink-0 rounded-button border border-error/40 bg-surface-container-lowest px-3 text-[13px] font-bold text-on-error-container transition active:scale-95"
                  >
                    Retry
                  </button>
                </div>
              ) : pdfReady ? (
                <div className="flex items-center gap-2 rounded-[12px] border border-outline-variant bg-surface-container-lowest px-3 py-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-field bg-primary-soft text-primary">
                    <Icon name="picture_as_pdf" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">
                      {preBuiltRef.current?.file.name ?? 'Invoice PDF'}
                    </p>
                    <p className="text-[12px] text-on-surface-variant">
                      {preBuiltRef.current ? `${Math.max(1, Math.round(preBuiltRef.current.file.size / 1024))} KB · ` : ''}attached
                    </p>
                  </div>
                </div>
              ) : (
                <div className="onit-pdf-shimmer flex items-center gap-2 rounded-[12px] border border-outline-variant bg-surface-container-lowest px-3 py-2">
                  <OnItSpinner size={18} />
                  <span className="flex-1 text-[13px] font-semibold text-on-surface-variant">Building PDF…</span>
                </div>
              )}
            </div>
          )}
          <button
            className={`btn-primary mt-3 w-full${cardAnim === 'enter' ? ' onit-fade-in' : ''}`}
            style={cardAnim === 'enter' ? { animationDelay: `${180 + Math.min(previewItems.length, 8) * 70 + 660}ms` } : undefined}
            disabled={phase !== null || !isValidTotal}
            onClick={() => finalize()}
          >
            {quoteDraft ? (
              // No file to build or share: the client gets the link.
              <>
                {phase === 'building' ? <OnItSpinner size={18} /> : <Icon name="send" size={18} />}
                {phase === 'building' ? 'Sending…' : clientQuestionOpen ? 'Pick a client first' : 'Looks right — send it'}
              </>
            ) : sendReady && shareWaiting === draftSignature(draft) && phase !== 'building' && !clientQuestionOpen ? (
              // The file is built: this tap opens the share sheet synchronously.
              <>
                <Icon name="share" size={18} />
                {`Share ${docNoun(docKind(draft)).toLowerCase()}`}
              </>
            ) : (
              <>
                {phase === 'building' ? <OnItSpinner size={18} /> : <Icon name="attach_file" size={18} />}
                {phase === 'building' ? 'Building your PDF…' : clientQuestionOpen ? 'Pick a client first' : 'Looks right — send it'}
              </>
            )}
          </button>
          {/* Quiet secondary exit: download the PDF without sending. Saves the
              draft (sendable later); does not mark sent or archive. An invoice
              downloaded this way has no pay link (a draft's pay page doesn't
              take payment), so it's labelled a draft with an (i) that says so. */}
          {/* Invoices only: an estimate has no PDF, so there is nothing to download. */}
          {docKind(draft) === 'invoice' && (
          <div className="mt-1 flex items-center justify-center gap-1">
            <button className="min-h-touch inline-flex items-center justify-center gap-1.5 text-sm text-on-surface-variant transition active:opacity-60 disabled:opacity-40"
              disabled={phase !== null || !isValidTotal}
              onClick={() => finalize(false, undefined, 'download')}>
              <Icon name="download" size={18} />
              Download draft
            </button>
            {(
              <button
                type="button"
                className="min-h-touch min-w-[44px] inline-flex items-center justify-center text-on-surface-variant transition active:opacity-60"
                aria-label="About draft downloads"
                aria-expanded={draftInfoOpen}
                onClick={() => setDraftInfoOpen((v) => !v)}
              >
                {/* Inline (i): the icon font is a fixed subset without "info". */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <line x1="12" y1="11" x2="12" y2="16" />
                  <circle cx="12" cy="7.75" r="0.6" fill="currentColor" />
                </svg>
              </button>
            )}
          </div>
          )}
          {draftInfoOpen && docKind(draft) === 'invoice' && (
            <p role="note" className="-mt-1 text-center text-xs text-on-surface-variant">
              Drafts don&apos;t hold a live pay page.
            </p>
          )}
          <div className="mt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              className="min-h-touch text-sm text-on-surface-variant underline transition active:opacity-60 disabled:opacity-40"
              disabled={phase !== null || draftHistory.length === 0}
              onClick={undoLastEdit}
            >
              Undo last edit
            </button>
            <button
              type="button"
              className="min-h-touch text-sm text-on-surface-variant underline transition active:opacity-60 disabled:opacity-40"
              disabled={phase !== null}
              onClick={() => send('Actually, let me change something')}
            >
              Change something
            </button>
          </div>
        </div>
        </div>
      )}
    </LedgerFrame>
  ) : null;

  // Design 02/03: a sent, unpaid estimate in the thread is the "Ready to share"
  // card. Everything else (drafts, invoices, paid) keeps the ledger card above.
  const readyEstimateCard = lockedQuote && draft && ready && linkedStatus === 'sent' && linkedAmountPaid === 0 && linkedToken && estimateLink(linkedToken)
    && (!template || morphing) ? (
    <ReadyEstimateCard
      docNumber={pendingInvoiceRef.current ? formatDocNumber('quote', pendingInvoiceRef.current.no) : 'Estimate'}
      clientName={draft.client_name?.trim() || 'Client'}
      items={previewItems}
      photoCount={attachments.length}
      validUntil={linkedValidUntil}
      total={previewTotals.total}
      photos={attachments.length > 0 ? (
        <AttachmentsEditor
          items={attachments}
          editable={false}
          onChange={setAttachments}
          onRemove={(a) => (a.storagePath ? removeSavedAttachment(a) : undefined)}
        />
      ) : undefined}
      actions={(
        <EstimateLinkActions
          url={estimateLink(linkedToken)!}
          title={pendingInvoiceRef.current ? formatDocNumber('quote', pendingInvoiceRef.current.no) : 'Estimate'}
          businessName={profile?.business_name}
          onShared={() => {
            // §02: a share has no system confirmation, so the assistant says it
            // happened (and promises the first view). No pronouns.
            const who = (draft?.client_name ?? '').trim().split(/s+/)[0];
            setMessages((m) => [...m, aMsg(
              who ? `Shared. I'll ping you as soon as ${who} opens it.` : "Shared. I'll ping you as soon as it's opened.",
            )]);
          }}
        />
      )}
      onPreview={() => { const url = estimateLink(linkedToken); if (url) window.open(url, '_blank', 'noopener'); }}
      onRevise={() => { const id = pendingInvoiceRef.current?.id; if (id) router.push(`/invoices/${id}?edit=1`); }}
    />
  ) : null;
  const invoiceCard = readyEstimateCard ?? ledgerCard;

  // Composer field: one line until it needs more, up to four 22px lines. The
  // cap has to include the field's vertical padding (the textarea is border-box),
  // so measure it from the element instead of hard-coding 88px. The same value
  // feeds the CSS max-height, and the 150ms height transition and the 12px top
  // fade live in globals.css.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const maxHeight =
      4 * (parseFloat(style.lineHeight) || 22) +
      (parseFloat(style.paddingTop) || 0) +
      (parseFloat(style.paddingBottom) || 0);
    el.style.setProperty('--composer-max-height', `${maxHeight}px`);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.classList.toggle('is-overflowing', el.scrollHeight > maxHeight);
    const oneLine =
      (parseFloat(style.lineHeight) || 22) +
      (parseFloat(style.paddingTop) || 0) +
      (parseFloat(style.paddingBottom) || 0);
    if (!input) setComposerBox(false);
    else if (el.scrollHeight > oneLine + 2) setComposerBox(true);
  }, [input]);
  const box = composerBox && !voiceSession;
  // The + and send buttons live outside the pill, and move inside the box
  // (bottom row) once the composer expands.
  const plusBlock = (
      <div className="relative shrink-0">
        {plusMenu && <ComposerMenu closing={plusMenu === 'closing'} onPick={pickFromPlus} onClose={closePlusMenu} />}
        {/* One button, two jobs: outside a voice session it's the "+" that
            opens Voice · New invoice · New quote; during a session it's the
            ink × that ends it. The splash's rings fly onto it on a cold
            start (components/Splash.tsx measures it at runtime). */}
        <button
          aria-label={voiceSession ? 'End voice session' : plusMenu === 'open' ? 'Close' : 'Start something: voice, new invoice or new estimate'}
          aria-haspopup={voiceSession ? undefined : 'menu'}
          aria-expanded={voiceSession ? undefined : plusMenu === 'open'}
          data-splash-target=""
          className={`onit-plus-btn relative z-[46] grid h-11 w-11 place-items-center rounded-full active:scale-90 disabled:opacity-40
            ${voiceSession || plusMenu === 'open' ? 'bg-inverse-surface text-inverse-on-surface' : 'bg-primary-soft text-on-background'}`}
          disabled={!voiceSession && phase !== null}
          onClick={voiceSession ? endVoiceSession : plusTap}
        >
          {voiceSession && <MicRings stream={streamRef.current} active={recording} />}
          <span className={`onit-plus grid place-items-center${voiceSession || plusMenu === 'open' ? ' is-open' : ''}`}>
            <Icon name="add" size={28} />
          </span>
        </button>
      </div>
  );
  const sendBtn = (
      <button
        aria-label="Send"
        className="onit-send-arrow grid h-11 w-11 shrink-0 place-items-center rounded-full bg-inverse-surface text-inverse-on-surface transition-[transform,background-color,color] duration-tap ease-settle active:scale-90
          disabled:scale-[.88] disabled:bg-surface-container-highest disabled:text-on-surface-variant/50"
        disabled={voiceSession || !input.trim() || phase !== null}
        onClick={() => void send(input)}
      >
        <Icon name="arrow_upward" size={24} />
      </button>
  );

  return (
    // xl: the design's 720px column; the composer is a child of it, so the two
    // share left and right edges exactly (gate: design 720, app 720).
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col xl:max-w-[720px]">
      {shutterKey > 0 && <div key={shutterKey} aria-hidden className="onit-shutter" />}
      {/* The ONE scroll owner. overscroll-y-contain keeps a fling that hits
          the end inside the list (its own bounce), instead of chaining to the
          page, whose bounce would then grab the next gesture. Scoped here —
          no global overscroll rule. */}
      <div
        ref={listRef}
        onScroll={onListScroll}
        data-coach="chat-messages"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-4 md:px-6"
      >
        {hydrated && dayLabel(messages) && (
          <div className="onit-day-in py-1 text-center text-[11px] font-semibold tracking-[.08em] text-on-surface-variant/70">{dayLabel(messages)}</div>
        )}
        {/* Payouts empty-state nudge — shown once at the top of a blank chat when
            Connect is enabled but no payment processor is connected yet. Same
            dismissal flag as the post-send nudge so one "Not now" silences both. */}
        {hydrated && messages.length === 0 && !payoutsNudgeDismissed && profile && connectOn &&
          !cardAvailableFor(profile, connectOn) && (
          <ChatNudgeCard
            icon="payments"
            eyebrow="Tip"
            title="Connect a payment processor to your invoices"
            body="Clients can pay online the moment they get an invoice — no cash, no chasing. Takes 30 seconds to set up."
            actions={[
              {
                label: 'Set up payments',
                variant: 'primary',
                onClick: () => router.push('/settings/payouts'),
              },
              {
                label: 'Not now',
                variant: 'secondary',
                onClick: () => {
                  try { localStorage.setItem(PAYOUTS_NUDGE_DISMISSED_KEY, '1'); } catch { /* ignore */ }
                  setPayoutsNudgeDismissed(true);
                },
              },
            ]}
          />
        )}
        {!hydrated && !skeletonTimedOut ? <ChatRestoreSkeleton /> : messages.map((m, mi) => (
        <Fragment key={m.id}>{feedSplit.between[m.id]?.map((e) => renderEvent(e))}{
          // (the empty-state chips render after the greeting; see below)
          null}{
          m.quiet ? (
            // Free-tier usage line: plain secondary text, no bubble.
            <p className="px-1 text-sm text-on-surface-variant">{m.content}</p>
          ) : m.failed ? (
            // Failed assistant message: bubble plus an icon-only retry control
            // beneath it. Same icon-button styling as the receipt buttons.
            <div key={m.id} className="flex justify-start">
              <div className="flex max-w-[82%] flex-col items-start gap-1">
                <div
                  key={`${m.id}-${retryShake[m.id] ?? 0}`}
                  className={`whitespace-pre-wrap rounded-[18px] rounded-bl-md border border-error/40 bg-error-container px-3.5 py-2.5 text-[15px] leading-snug text-error-on-container${
                    (retryShake[m.id] ?? 0) > 0 || !restoredMsgIdsRef.current.has(m.id) ? ' onit-shake' : ''}`}
                >
                  {failedBubbleTitle(m.content) && (
                    <div className="mb-0.5 text-[15px] font-semibold">{failedBubbleTitle(m.content)}</div>
                  )}
                  {m.content}
                </div>
                {/* Inline Retry under the item (no modal): it keeps its width; the
                    icon spins in place while retrying. */}
                <button
                  aria-label={retryingId === m.id ? 'Retrying' : 'Retry'}
                  className="flex min-h-12 items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-4 text-label-lg font-semibold text-primary transition onit-fade-in active:scale-95 disabled:opacity-40"
                  disabled={phase !== null}
                  onClick={() => retry(m)}
                >
                  <Icon name="refresh" size={20} className={retryingId === m.id ? 'onit-spin' : ''} />
                  Retry
                </button>
              </div>
            </div>
          ) : visibleChips(m, mi === messages.length - 1, phase !== null).length > 0 ? (
            // Answer + suggestion chips (Board 8, A1). A chip sends a supported
            // question in one tap and goes away once used.
            <div key={m.id} className="flex justify-start">
              <div className="flex max-w-[82%] flex-col items-start gap-2">
                <div className="whitespace-pre-wrap rounded-[18px] rounded-bl-md border border-outline-variant/50 bg-surface-container px-3.5 py-2.5 text-[15px] leading-snug">
                  {m.content}
                </div>
                <div className="flex flex-wrap gap-2">
                  {visibleChips(m, true, phase !== null).map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      disabled={chip.disabled}
                      onClick={() => {
                        if (sendRef.current) return;
                        setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, chips: undefined } : x)));
                        void send(chip.label, 'typed');
                      }}
                      className="min-h-11 rounded-full border border-outline-variant bg-surface-container-lowest px-4 text-label-lg font-semibold text-primary transition active:scale-95 disabled:opacity-40"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : m.template && resolveTemplate(m.template) ? (
            <TemplateReply key={m.id} content={m.content} card={resolveTemplate(m.template)!} handlers={templateHandlers(m, mi)} prevRole={messages[mi - 1]?.role} />
          ) : m.signInLink ? (
            <div key={m.id} className="flex justify-start">
              <div className="flex max-w-[82%] flex-col items-start gap-2">
                <div className="whitespace-pre-wrap rounded-[18px] rounded-bl-md border border-outline-variant/50 bg-surface-container px-3.5 py-2.5 text-[15px] leading-snug">
                  {m.content}
                </div>
                <SignInChatButton
                  onBeforeSignIn={() => {
                    // Remember the LAST question asked while signed out (not just this bubble's).
                    const last = [...messages].reverse().find((x) => x.signInLink && x.question);
                    if (last?.question) writePending(last.question, 'typed', Date.now());
                  }}
                />
              </div>
            </div>
          ) : m.feedbackLink ? (
            // Feedback answer: the bubble plus a real button to the feedback page
            // (same landing as the Chat prompt card).
            <div key={m.id} className="flex justify-start">
              <div className="flex max-w-[82%] flex-col items-start gap-2">
                <div className="whitespace-pre-wrap rounded-[18px] rounded-bl-md border border-outline-variant/50 bg-surface-container px-3.5 py-2.5 text-[15px] leading-snug">
                  {m.content}
                </div>
                <button
                  className="flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-3.5 py-2 text-label-lg font-semibold text-primary transition active:scale-95"
                  onClick={() => router.push('/settings/help/feedback?src=chat_prompt&from=/chat')}
                >
                  <Icon name="chat_bubble" size={18} /> Tell us about On It
                </button>
              </div>
            </div>
          ) : m.recapCard ? (
            <RecapChatCard key={m.id} model={m.recapCard} onOpenBooks={() => router.push('/dashboard')} />
          ) : m.commandCard ? (
            <CommandCard
              groups={COMMAND_GROUPS}
              onAction={(action) => { if (action === 'record-payment') openPaymentCard(); }}
              onPick={(label) => fillComposer(prefillFor(label))}
            />
          ) : m.ownerCard ? (
            // The outcome of an owner action, with the one thing to do next.
            <div className="al-fade-up" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AssistantAvatar />
              <div className="al-wcard" style={{ flex: 1, minWidth: 0, padding: '12px 14px' }}>
                <div className="al-trow">
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--al-gold)', display: 'grid', placeItems: 'center', flex: 'none' }}>
                    <Icon name="check" size={17} />
                  </div>
                  <div className="al-tt" style={{ flex: 1 }}>{m.ownerCard.title}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    className="al-btn-w"
                    style={{ height: 36, fontSize: 13.5, flex: 1 }}
                    onClick={() => router.push(`/invoices/${m.ownerCard?.invoiceId ?? ''}`)}
                  >
                    Open
                  </button>
                </div>
              </div>
            </div>
          ) : m.action === 'new-chat' ? (
            // Locked-conversation refusal: the bubble plus a tappable "New chat"
            // control that fires the same reset as the header compose icon
            // (onit-new-chat), so "start a new job" isn't prose the user has to
            // act on by hunting for the header button.
            <div key={m.id} className="flex justify-start">
              <div className="flex max-w-[82%] flex-col items-start gap-2">
                <div className="whitespace-pre-wrap rounded-[18px] rounded-bl-md border border-outline-variant/50 bg-surface-container px-3.5 py-2.5 text-[15px] leading-snug">
                  {m.content}
                </div>
                <button
                  className="flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-3.5 py-2 text-label-lg font-semibold text-primary transition active:scale-95"
                  onClick={() => window.dispatchEvent(new Event('onit-new-chat'))}
                >
                  <Icon name="edit_square" size={18} /> New chat
                </button>
              </div>
            </div>
          ) : m.sentCard ? (
            // Sent invoice summary row (Ledger): client, doc number · due,
            // amount and SENT. Appears right after the "Sent!" bubble.
            <div key={m.id} className="flex flex-col items-start">
              <SentLedgerRow
                clientName={m.sentCard.clientName}
                invoiceNo={m.sentCard.invoiceNo}
                dueDate={m.sentCard.dueDate}
                amount={m.sentCard.amount}
              />
            </div>
          ) : m.payoutsNudge ? (
            // Payouts nudge — shown once after a sent invoice when the pro has no
            // payment processor connected. "Set up Payouts" routes to the connect
            // screen; "Not now" dismisses by replacing this message with nothing.
            <div key={m.id} className="flex justify-start">
              <ChatNudgeCard
                className="w-full max-w-[82%]"
                icon="payments"
                eyebrow="Tip"
                title="Connect a payment processor to your invoices?"
                body={`${draft?.client_name ? `${draft.client_name} can` : 'Clients can'} pay online the moment they get this — no cash, no chasing. Takes 30 seconds to set up.`}
                actions={[
                  {
                    label: 'Set up payments',
                    variant: 'primary',
                    onClick: () => router.push('/settings/payouts'),
                  },
                  {
                    label: 'Not now',
                    variant: 'secondary',
                    onClick: () => {
                      try { localStorage.setItem(PAYOUTS_NUDGE_DISMISSED_KEY, '1'); } catch { /* ignore */ }
                      setPayoutsNudgeDismissed(true);
                      setMessages((msgs) => msgs.filter((x) => x.id !== m.id));
                    },
                  },
                ]}
              />
            </div>
          ) : m.undoProposal ? (
            // Cancelled: the same card collapsed to one line with Undo (design 05).
            <PaymentProposalCard
              key={m.id}
              cancelled
              proposal={m.undoProposal}
              onConfirm={async () => ({ ok: false as const, message: 'Undo the cancel first.' })}
              onCancel={() => {}}
              onUndo={() => setMessages((msgs) => msgs.map((x) => (x.id === m.id
                ? { ...x, undoProposal: undefined, payProposal: m.undoProposal, content: 'Check this and confirm.' }
                : x)))}
            />
          ) : m.payProposal ? (
            <PaymentProposalCard
              key={m.id}
              proposal={m.payProposal}
              loadPicker={m.payProposal.picker ? loadPaymentPicker : undefined}
              onConfirmUnattached={async (input) => {
                // One key per submission, minted at the first tap and reused on
                // every retry, so a lost response can never become a second row.
                let key = unattachedKeysRef.current.get(m.id);
                if (!key) { key = unattachedPaymentKey(); unattachedKeysRef.current.set(m.id, key); }
                const out = await callUnattached('POST', {
                  amount: input.amount, method: input.method, received_on: input.paidOn, title: input.title, idempotency_key: key,
                });
                if (!out.ok) return out;
                unattachedKeysRef.current.delete(m.id);
                setMessages((msgs) => msgs.map((x) => (x.id === m.id
                  ? {
                    ...x,
                    payProposal: undefined,
                    unattachedCard: { id: out.id, title: input.title || UNATTACHED_PAYMENT_TITLE, amount: input.amount, method: input.method, paidOn: input.paidOn, removed: false },
                    content: 'Payment recorded.',
                  }
                  : x)));
                return { ok: true as const };
              }}
              onCancel={() => setMessages((msgs) => msgs.map((x) => (x.id === m.id
                ? { ...x, payProposal: undefined, undoProposal: m.payProposal, content: 'Payment not recorded. Nothing was saved.' }
                : x)))}
              onConfirm={async (input) => {
                const { data: { user: payUser } } = await getSharedUser();
                if (!payUser) return { ok: false as const, message: 'Sign in to record a payment.' };
                const paidAt = localDateToIso(input.paidOn || localDateString(new Date()));
                // One key per submission, minted at the Confirm tap (rule 6). A
                // second tap reuses it, so the ledger can only gain one row.
                const key = newPaymentKey(input.invoiceId);
                let paymentId: string | null = null;
                try {
                  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                    const store = paymentQueueStore();
                    const queued = store
                      ? await enqueuePayment(store, { key, invoiceId: input.invoiceId, userId: payUser.id, amount: input.amount, method: input.method, paidAt })
                      : 'capped';
                    if (queued !== 'queued') {
                      return { ok: false as const, message: "You're offline and I couldn't hold that payment. Try again when you're back." };
                    }
                  } else {
                    const saved = await recordPaymentOnce(ledgerFrom(supabase), {
                      invoice_id: input.invoiceId,
                      user_id: payUser.id,
                      amount: input.amount,
                      method: input.method,
                      paid_at: paidAt,
                      idempotency_key: key,
                    });
                    if (!saved.ok) {
                      console.error('chat record payment failed', saved.error);
                      return { ok: false as const, message: userMessage(saved.error) };
                    }
                    paymentId = saved.payment?.id ?? null;
                  }
                  const { data: row } = await supabase
                    .from('invoices')
                    .select('total, amount_paid, client_name, invoice_number, kind, line_items, tax_rate, deposit_type, deposit_value')
                    .eq('id', input.invoiceId)
                    .maybeSingle();
                  const invRow = row as Record<string, unknown> | null;
                  const total = Number(invRow?.total ?? 0);
                  const paid = Number(invRow?.amount_paid ?? 0);
                  // A deposit payment gets the deposit card (no button), not a
                  // "payment recorded" one: the balance is collected on completion.
                  const invTotals = calculateInvoiceTotals(
                    (invRow?.line_items as FinancialLineItem[] | null) ?? [],
                    Number(invRow?.tax_rate ?? 0),
                    ((invRow?.deposit_type as DepositType | null) ?? 'none'),
                    invRow?.deposit_value == null ? undefined : Number(invRow.deposit_value),
                  );
                  const card = buildPayCard({
                    invoiceId: input.invoiceId,
                    invoiceNo: invRow?.invoice_number == null ? null : Number(invRow.invoice_number),
                    clientName: String(invRow?.client_name ?? m.payProposal?.clientName ?? ''),
                    amount: input.amount,
                    method: input.method,
                    paidAt,
                    paymentId,
                    total,
                    left: Math.max(0, total - paid),
                    depositOnly: invTotals.depositAmount > 0
                      && paid >= invTotals.depositAmount
                      && paid < total,
                  });
                  setMessages((msgs) => msgs.map((x) => (x.id === m.id
                    ? { ...x, payProposal: undefined, payCard: card, content: 'Payment recorded.' }
                    : x)));
                  return { ok: true as const };
                } catch (e) {
                  console.error('chat record payment threw', e);
                  return { ok: false as const, message: "That didn't go through. Try again." };
                }
              }}
            />
          ) : m.unattachedCard ? (
            <UnattachedPaymentCard
              key={m.id}
              animate={!restoredMsgIdsRef.current.has(m.id)}
              card={m.unattachedCard}
              // Undo removes the payment (DELETE); the removed state offers the way back (PATCH).
              onUndo={async () => {
                const out = await callUnattached('DELETE', { id: m.unattachedCard!.id });
                if (!out.ok) { setMessages((msgs) => [...msgs, aMsg(out.message)]); return; }
                setMessages((msgs) => msgs.map((x) => (x.id === m.id && x.unattachedCard
                  ? { ...x, unattachedCard: { ...x.unattachedCard, removed: true }, content: 'Payment removed.' } : x)));
              }}
              onRestore={async () => {
                const out = await callUnattached('PATCH', { id: m.unattachedCard!.id });
                if (!out.ok) { setMessages((msgs) => [...msgs, aMsg(out.message)]); return; }
                setMessages((msgs) => msgs.map((x) => (x.id === m.id && x.unattachedCard
                  ? { ...x, unattachedCard: { ...x.unattachedCard, removed: false }, content: 'Payment recorded.' } : x)));
              }}
            />
          ) : m.payCard ? (
            <PaymentCard
              key={m.id}
              animate={!restoredMsgIdsRef.current.has(m.id)}
              card={m.payCard}
              onOpen={(invoiceId) => router.push(`/invoices/${invoiceId}`)}
              onUndo={async (paymentId) => {
                // Same delete as the invoice screen: the trigger recomputes
                // amount_paid from what remains, so nothing is written here.
                const { error } = await supabase.from('invoice_payments').delete().eq('id', paymentId);
                if (error) {
                  console.error('undo payment failed', error);
                  setMessages((msgs) => [...msgs, aMsg("Couldn't undo that payment. Try again from the invoice.")]);
                  return;
                }
                setMessages((msgs) => msgs.map((x) => (
                  x.payCard && x.payCard.paymentId === paymentId
                    ? { ...x, payCard: undefined, content: 'Payment removed.' }
                    : x
                )));
              }}
            />
          ) : m.logged ? (
            <LoggedExpenseCard
              key={m.id}
              e={{ ...m.logged, thumb: m.logged.receiptMsgId ? messages.find((x) => x.id === m.logged?.receiptMsgId)?.receipt || null : null }}
              animate={liveLoggedIdRef.current === m.id}
              onViewBooks={m.logged.viaTemplate ? () => router.push('/dashboard') : undefined}
            />
          ) : m.receipt !== undefined ? (
            <ReceiptBubble
              key={m.id}
              src={m.receipt}
              animate={liveReceiptRef.current?.id === m.id}
              startAfter={liveReceiptRef.current?.id === m.id ? liveReceiptRef.current.flashPeak : undefined}
            />
          ) : (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start gap-2'}`}>
              {/* The monogram opens a run of On It's messages, and only breathes
                  while a reply is still being written. */}
              {m.role !== 'user' && messages[mi - 1]?.role !== 'assistant' && (
                <AssistantMark
                  pulsing={phase !== null && m.id === messages[messages.length - 1]?.id}
                />
              )}
              <div
                className={`max-w-[82%] whitespace-pre-wrap rounded-[18px] px-3.5 py-2.5 text-[15px] leading-snug
                  ${m.role === 'user'
                    ? 'rounded-br-md bg-inverse-surface text-inverse-on-surface'
                    : 'rounded-bl-md border border-outline-variant/50 bg-surface-container'}${
                  restoredMsgIdsRef.current.has(m.id)
                    ? ''
                    : m.role === 'user' ? ' onit-msg-in-user' : ' onit-msg-in-bot'}`}
              >
                {/* Prose is typed out by StreamText, and a tap on it completes
                    the line. Restored history, and everything you wrote, is
                    static — no error, card or quick reply goes through it. */}
                {restoredMsgIdsRef.current.has(m.id) || m.role === 'user'
                  ? (m.template && m.fallbackText ? m.fallbackText : m.content)
                  : <StreamText text={m.content} />}
              </div>
            </div>
          )}
          {m.id === cardAnchorId && invoiceCard}
          {m.id === cardAnchorId && invoiceCard && unsentShare && !unsentShareOpen && (
            // S1b: Keep as draft leaves this pinned under the document until the
            // row is marked sent. The wrapper is what the reveal effect measures.
            <div ref={s1bRef} className="w-full">
              <PopInline
                tone="error"
                eyebrowIcon="sync_problem"
                title={unsentShareCopy(unsentShare).cardTitle}
                error={pdfFailed
                  ? { title: 'Couldn’t build the PDF', body: 'Weak signal. Your invoice is safe — Mark as sent still works.' }
                  : undefined}
                text={unsentShareCopy(unsentShare).cardText}
                consequence={`${unsentShare.number} is still a draft.`}
                actions={[
                  { label: 'Mark as sent', kind: 'gold', busyLabel: 'Marking sent…', onSelect: () => postMarkSharedSent(unsentShare) },
                  {
                    label: pdfReady ? 'Retry the share' : 'Preparing…',
                    kind: 'outline',
                    disabled: !pdfReady,
                    onSelect: () => shareSharedAgain(unsentShare),
                  },
                  ...(pdfFailed
                    ? [{ label: 'Retry the build', kind: 'text' as const, onSelect: retryPrebuild }]
                    : []),
                ]}
              />
            </div>
          )}
          {m.id === cardAnchorId && invoiceCard && invoiceUsage && invoiceUsage.id === pendingInvoiceRef.current?.id && (
            <>
              {invoiceUsage.text && <LedgerUsageMeter text={invoiceUsage.text} />}
              {invoiceUsage.nudge && (
                <ChatNudgeCard
                  className="mt-2 w-full"
                  icon="workspace_premium"
                  eyebrow={invoiceUsage.nudge.eyebrow}
                  title={invoiceUsage.nudge.title}
                  body={invoiceUsage.nudge.body}
                  actions={[
                    {
                      label: invoiceUsage.nudge.cta,
                      variant: 'primary',
                      onClick: () => setSoftWall(invoiceUsage.nudge ?? null),
                    },
                    {
                      label: 'Not now',
                      variant: 'secondary',
                      onClick: () => setInvoiceUsage((prev) => (prev ? { ...prev, nudge: undefined } : prev)),
                    },
                  ]}
                />
              )}
            </>
          )}
        </Fragment>
        ))}

        {/* Design 08: the empty state sits AFTER the greeting, indented under the
            avatar. A chip fills the input (never sends); chips and hint go with the
            first message. */}
        {hydrated && messages.length === 1 && (
          <div className="al-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 36, alignItems: 'flex-start' }}>
            {starterChips.map((chip) => (
              <button
                key={chip}
                type="button"
                className="al-starter"
                disabled={phase !== null}
                onClick={() => (isRecordPaymentChip(chip) ? openPaymentCard() : fillComposer(prefillFor(chip)))}
              >
                <Icon name="auto_awesome" size={18} className="text-[#b8961e]" />
                {chip}
              </button>
            ))}
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#7a7166' }}>{COMMAND_HINT}</p>
          </div>
        )}

        {/* Alive layer: cards that belong after the last message. */}
        {feedSplit.trailing.map((e) => renderEvent(e))}

        {pendingChange && (() => {
          // Change guard (Commit A): the parse would rewrite the linked invoice.
          // Ask before touching it — the current card above stays as it was.
          // Board C1: the rows show what moves. Not dismissible.
          const copy = changeGuardCopy(pendingChange.kind, pendingChange.no);
          return (
            <PopInline
              eyebrow={copy.eyebrow}
              eyebrowIcon="edit"
              text={copy.text}
              rows={changeGuardRows(draft, pendingChange.draft)}
              consequence={copy.consequence}
              actions={[
                { label: copy.updateLabel, kind: 'gold', busyLabel: copy.updateBusy, disabled: phase !== null, onSelect: resolvePendingChangeUpdate },
                { label: copy.newLabel, kind: 'outline', disabled: phase !== null, onSelect: resolvePendingChangeNew },
              ]}
            />
          );
        })()}

        {clientChoice && clientQuestionOpen && (() => {
          // finalize() paused: the typed name is close to saved clients but not
          // the same. Nothing is created until one of these is tapped (board C2).
          const copy = clientChoiceCopy(clientChoice.typed);
          return (
            <div ref={clientCardRef}>
              <PopInline
                eyebrow="Which client?"
                eyebrowIcon="person"
                text={copy.text}
                consequence={copy.consequence}
                choices={[
                  ...clientChoice.candidates.map((c) => ({
                    label: c.name,
                    onSelect: () => { if (phase === null) pickClientChoice(c); },
                  })),
                  { label: copy.newLabel, icon: 'person_add' as const, onSelect: () => { if (phase === null) pickClientChoice('new'); } },
                ]}
              />
            </div>
          );
        })()}

        {expenseDraft && !expenseTemplate && (
          // Only ever set live (never restored), so the build-in plays once per capture.
          <div className={expenseExiting ? 'onit-card-exit' : 'onit-card-enter'}>
          <ExpenseCard
            draft={expenseDraft}
            onChange={setExpenseDraft}
            onSave={saveExpense}
            onCancel={() => {
              discardExpense();
              setMessages((m) => [...m, aMsg("No problem — tell me what it should say, or send another photo.")]);
            }}
            saving={phase === 'saving'}
            previewUrl={receipt?.previewUrl ?? null}
            error={expenseError}
          />
          </div>
        )}

        {reminderPrompt && (
          <PopInline
            eyebrow="Payment alerts"
            eyebrowIcon="notifications"
            text={reminderPrompt.onlinePay
              ? `Want a notification when ${reminderPrompt.client} pays online?`
              : `Want a nudge if ${reminderPrompt.client} hasn't paid in 2 days?`}
            actions={[
              { label: 'Yes', kind: 'gold', busyLabel: 'Asking your phone…', onSelect: enableReminders },
              { label: 'Not now', kind: 'outline', onSelect: dismissReminders },
            ]}
          />
        )}
        {signInAsk && (() => {
          const c = signInCard(signInAsk.kind, signInAsk.headline);
          return (
            <PopInline
              eyebrow={c.eyebrow}
              eyebrowIcon={signInAsk.kind === 'voice' ? 'mic' : 'lock'}
              title={c.title}
              text={c.text}
              actions={[
                {
                  label: c.signInLabel,
                  kind: 'gold',
                  busyLabel: c.signInBusy,
                  // Pending lasts while /login opens; a failed navigation frees the button.
                  onSelect: async () => { router.push('/login'); await new Promise((r) => setTimeout(r, 3000)); },
                },
                {
                  label: c.secondaryLabel,
                  kind: c.secondary === 'type' ? 'outline' : 'text',
                  onSelect: () => { setSignInAsk(null); if (c.secondary === 'type') inputRef.current?.focus(); },
                },
              ]}
            />
          );
        })()}
        {alertsFailed && (
          <PopInline
            tone="error"
            title="Payment alerts are off"
            text={ALERTS_FAILED_TEXT}
            actions={[{
              label: 'Open payment alerts',
              kind: 'gold',
              onSelect: () => { setAlertsFailed(false); router.push(ALERTS_SETTINGS_HREF); },
            }]}
          />
        )}
        {termsPrompt && (
          <div className="flex justify-start">
            <ChatNudgeCard
              className="w-full max-w-[82%]"
              icon="description"
              eyebrow="Tip"
              title="Add your terms"
              body="Add your terms so they print on every estimate and invoice. Takes a minute."
              actions={[
                { label: 'Add terms', variant: 'primary', onClick: addTermsFromPrompt },
                { label: 'Not now', variant: 'secondary', onClick: dismissTermsPrompt },
              ]}
            />
          </div>
        )}

        {feedbackPrompt && (
          <div className="flex justify-start">
            <ChatNudgeCard
              className="w-full max-w-[82%]"
              icon="chat_bubble"
              eyebrow="Feedback"
              title="Got a minute?"
              body="Tell us what's working or what isn't."
              actions={[
                { label: 'Tell us', variant: 'primary', onClick: openFeedback },
                { label: 'Not now', variant: 'secondary', onClick: dismissFeedback },
              ]}
            />
          </div>
        )}

        {((phase === 'thinking' && !transcribing) || phase === 'reading' || (phase === 'preparing' && receipt)) && (
          <div role="status" className="flex items-center gap-2 px-2 text-body-lg italic text-on-surface-variant/70">
            {/* The spinner inherits this row's text color (MOTION-SPEC §2). */}
            <OnItSpinner size={20} />
            {phase === 'thinking' ? 'On It is thinking…' : 'Reading your receipt…'}
          </div>
        )}
      </div>

      {/* The composer (UI redesign, release frames 1a): a small "+" on the
          left, the "Message On It…" field with gallery + camera inside it, and
          send on the right. It sits ABOVE the bottom nav, which carries the
          safe-area inset, so no bottom padding here. */}
      {sentToast && <PopToast text={sentToast} icon="check" onDismiss={() => setSentToast(null)} />}
      {unsentShare && unsentShareOpen && (() => {
        const copy = unsentShareCopy(unsentShare);
        return (
          // S1: the one status that interrupts. Scrim, ×, swipe and Escape are
          // Keep as draft (nothing is written), and none of them fire while the
          // POST or the share sheet is running.
          <PopSheet
            open
            icon="sync_problem"
            iconTone="danger"
            eyebrow={copy.eyebrow}
            title={copy.title}
            sub={copy.sub}
            truths={copy.truths}
            note={copy.note}
            retryLabel="Try again"
            retryFailure={(f) => (f.kind === 'offline' ? copy.retryFailure : null)}
            consequence={`${unsentShare.number} is still a draft.`}
            actions={[
              { label: 'Mark as sent', kind: 'gold', go: true, busyLabel: 'Marking sent…' },
              { label: 'Retry the share', kind: 'outline', runs: true, onSelect: () => shareSharedAgain(unsentShare) },
              { label: 'Keep as draft', kind: 'text', safe: true },
            ]}
            onDismiss={() => setUnsentShareOpen(false)}
            onConfirm={() => postMarkSharedSent(unsentShare)}
            // A successful mark clears unsentShare, which unmounts this sheet.
            onSuccess={() => undefined}
          />
        );
      })()}
      {discardAsk && expenseTemplate && (() => {
        // P-04 / board D6 expense variant. Dropping the draft is local, so there
        // is no request to fail; scrim, ×, Escape and swipe = Keep editing.
        const d = expenseDraft;
        const who = d?.vendor?.trim() || d?.description?.trim() || null;
        const figure = d && d.amount > 0 ? { label: who ?? CATEGORY_LABEL[d.category], amount: money(d.amount) } : undefined;
        return (
          <PopSheet
            open
            destructive
            icon="edit"
            iconTone="danger"
            title="Discard this expense?"
            figure={figure}
            actions={[
              { label: 'Keep editing', kind: 'gold', safe: true },
              { label: 'Discard', kind: 'danger', go: true, busyLabel: 'Discarding…' },
            ]}
            onDismiss={() => setDiscardAsk(false)}
            onConfirm={() => { discardExpense(); }}
            onSuccess={() => undefined}
          />
        );
      })()}
      {reviseAsk && draft && docKind(draft) !== 'quote' && (() => {
        const kind = docKind(draft);
        const no = pendingInvoiceRef.current?.no ?? null;
        const copy = reviseSheetCopy(kind, no);
        const total = calculateInvoiceTotals(draft.line_items ?? [], draft.tax_rate ?? 0).total;
        return (
          <PopSheet
            open
            icon="edit"
            title={copy.title}
            sub={copy.sub}
            figure={{
              label: [no != null ? formatDocNumber(kind, no) : null, draft.client_name].filter(Boolean).join(' · ') || 'This document',
              meta: lockBadgeText(linkedStatus, linkedAmountPaid),
              amount: money(total),
            }}
            actions={[
              { label: copy.actionLabel, kind: 'gold', go: true, busyLabel: copy.busyLabel },
              { label: 'Cancel', kind: 'text', safe: true },
            ]}
            onDismiss={() => setReviseAsk(false)}
            onConfirm={() => { reviseInvoice(); }}
            onSuccess={() => setReviseAsk(false)}
            consequence={copy.consequence}
          />
        );
      })()}
      {closeTemplateAsk && template && (
        <PopSheet
          open
          destructive
          icon="edit"
          iconTone="danger"
          title={`Discard this ${template === 'quote' ? 'estimate' : 'invoice'}?`}
          sub="It isn't sent. Discarding removes it from this phone."
          actions={[
            { label: 'Keep editing', kind: 'gold', safe: true },
            { label: 'Discard', kind: 'danger', go: true, busyLabel: 'Discarding…' },
          ]}
          onDismiss={() => setCloseTemplateAsk(false)}
          onConfirm={() => discardTemplateFromSheet()}
          onSuccess={() => setCloseTemplateAsk(false)}
          consequence="Your draft is still here."
        />
      )}
      {replaceAsk && (() => {
        // P-03 / board C3. Dismissal (scrim, ×, Escape, swipe) = Keep editing.
        // Start new is destructive (red outline) and soft-deletes the draft row,
        // so it has a pending state and a failure that says the draft is intact.
        const copy = replaceTemplateCopy(replaceAsk.kind);
        return (
          <PopSheet
            open
            destructive
            icon="edit"
            iconTone="gold"
            title={replaceAsk.title}
            sub={copy.sub}
            figure={replaceAsk.figure}
            actions={[
              { label: copy.keepLabel, kind: 'gold', safe: true },
              { label: copy.startLabel, kind: 'danger', go: true, busyLabel: copy.startBusy },
            ]}
            onDismiss={() => { setReplaceAsk(null); resumeSavedTemplate(); }}
            onConfirm={() => openTemplate(replaceAsk.kind, replaceAsk.client, true)}
            onSuccess={() => setReplaceAsk(null)}
            consequence={copy.consequence}
          />
        );
      })()}
      {template ? (
        // Capped so the card never pushes its own header off-screen on a short
        // phone: past ~85% of the chat area it scrolls inside its slot.
        <div data-template-slot="" className="max-h-[85%] min-h-0 shrink-0 overflow-y-auto overflow-x-hidden overscroll-contain border-t border-outline-variant/40 bg-background px-3 py-2.5">
          <div className={morphing ? 'onit-builder-ghost' : undefined}>
          <TemplateCard key={`template-${templateNonce}`} kind={template} onKindChange={switchTemplateKind} onClose={closeTemplate}
            uid={templateUid} restored={templateRestored}
            onDraft={setTemplateDraft} duplicateNote={templateDup}
            attachments={attachments} onAttachments={setAttachments}
            onRemoveAttachment={(a) => (a.storagePath ? removeSavedAttachment(a) : undefined)}
            sendState={!templateDraft ? 'disabled' : phase === 'building' ? 'busy' : 'ready'}
            onSend={() => { void finalize(); }} />
          </div>
        </div>
      ) : expenseTemplate && expenseDraft ? (
        <div data-template-slot="" className="max-h-[85%] min-h-0 shrink-0 overflow-y-auto overflow-x-hidden overscroll-contain border-t border-outline-variant/40 bg-background px-3 py-2.5">
          <div className={expenseExiting ? 'onit-card-exit' : 'onit-card-enter'}>
          <ExpenseCard
            draft={expenseDraft}
            onChange={setExpenseDraft}
            onSave={saveExpense}
            onCancel={() => {
              // Empty template: instant. Anything entered: ask first.
              const d = expenseDraft;
              const entered = d.amount > 0 || !!d.vendor?.trim() || !!d.description?.trim() || d.category !== 'other';
              if (entered) setDiscardAsk(true); else discardExpense();
            }}
            saving={phase === 'saving'}
            previewUrl={receipt?.previewUrl ?? null}
            error={expenseError}
          />
          </div>
        </div>
      ) : (
        <div data-coach="chat-composer" className={`relative border-t border-outline-variant/40 bg-background px-3 py-2.5 xl:border-surface-container-high xl:px-0 xl:py-[18px]${plusMenu ? ' z-[46]' : ''}`}>
          {/* The save prompt floats just above the composer, no scrim (2·13). */}
          {promptShown && !plusMenu && (
            <div className="absolute inset-x-3 bottom-full z-30 mb-2">
              <SavePromptCard key={promptShown.key} prompt={promptShown}
                onSave={() => saveFromPrompt(promptShown)} onDone={() => setPromptShown(null)} />
            </div>
          )}
          {phase === 'preparing' && (
            <div className="mb-2 flex items-center gap-2 px-2 text-body-lg italic text-on-surface-variant">
              <Icon name="photo_camera" size={20} className="text-primary" />
              Getting that photo ready…
            </div>
          )}

          <input
            ref={cameraRef}
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            className="hidden"
            onChange={onPickReceipt}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={onPickReceipt}
          />

          {voiceError && (
            <p role="status" aria-live="polite" className="mb-2 border-l-2 border-primary-container pl-2 text-body-md text-on-surface-variant">
              {voiceError}
            </p>
          )}
          {micBlocked && (
            // P-47 / board M1: directly above the composer, never in the transcript.
            <div role="status" aria-live="polite" className="mb-2">
              <PopInline
                eyebrow="Microphone"
                eyebrowIcon="mic"
                title="Mic access is off"
                text={micBlocked.card.text}
                rows={micBlocked.card.steps}
                error={micBlocked.still ? MIC_STILL_BLOCKED : undefined}
                actions={micBlocked.card.canRetry
                  ? [
                      {
                        label: 'Try again',
                        kind: 'gold',
                        busyLabel: 'Asking…',
                        onSelect: async () => { micRetryRef.current = true; await startRecording(); },
                      },
                      { label: 'Type instead', kind: 'outline', onSelect: () => { inputRef.current?.focus(); } },
                    ]
                  : [{ label: 'Type instead', kind: 'gold', onSelect: () => { inputRef.current?.focus(); } }]}
              />
            </div>
          )}

          <div className="flex items-end gap-2">
            {!box && plusBlock}

            {/* One field for both modes: during a voice session it turns gold and
                reads "Listening…", the recognised words land in this same
                textarea, and a ring spinner takes the label while the take is
                transcribed. The right-hand button is always the send arrow. */}
            <div className={`flex min-h-11 min-w-0 flex-1 gap-1 border transition-[border-color,box-shadow] duration-settle ease-settle
              bg-surface-container-lowest ${box ? 'flex-col items-stretch gap-0 rounded-[24px] px-2 pb-1.5 pt-2' : 'items-center rounded-full py-1 pl-4 pr-1'}
              ${voiceSession ? 'border-primary-container ring-2 ring-primary-container/35' : 'border-outline-variant'}`}>
              {voiceSession && (
                <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-primary" aria-live="polite">
                  {transcribing ? <><OnItSpinner size={14} /> Transcribing</> : recording ? 'Listening…' : 'Voice'}
                </span>
              )}
              <textarea
                ref={inputRef}
                aria-label="Message On It"
                className={`onit-composer-field min-w-0 resize-none border-0 ${box ? 'w-full flex-none px-2' : 'flex-1'} bg-transparent py-1.5 text-[16px] leading-[22px] text-on-background outline-none placeholder:text-on-surface-variant/60`}
                placeholder={voiceSession ? (recording ? 'Listening…' : transcribing ? 'Writing that down…' : 'Say it, On It writes it') : 'Message On It…'}
                value={input}
                rows={1}
                readOnly={voiceSession}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!phase) void send(input); }
                }}
              />
              {voiceSession ? (
                // Done stops the take (→ transcribe → send); Speak takes the next
                // turn. Both run inside the tap, so the mic prompt still counts.
                <button
                  aria-label={recording ? 'Stop and send' : 'Speak'}
                  className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-sm font-semibold active:scale-95 disabled:opacity-40
                    ${recording ? 'bg-inverse-surface text-inverse-on-surface' : 'bg-primary-container text-on-background'}`}
                  disabled={!recording && phase !== null}
                  onClick={micTap}
                >
                  {recording ? 'Done' : <><Icon name="mic" size={18} filled /> Speak</>}
                </button>
              ) : (
                <div className={`flex shrink-0 items-center gap-1 ${box ? 'w-full justify-end' : ''}`}>
                  {box && <div className="mr-auto">{plusBlock}</div>}
                  <button
                    aria-label="Upload receipt from gallery"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-on-surface-variant transition active:scale-90 disabled:opacity-40"
                    disabled={phase !== null}
                    onClick={() => galleryRef.current?.click()}
                  >
                    <Icon name="image" size={22} />
                  </button>
                  <button
                    aria-label="Take a receipt photo"
                    data-coach="chat-camera"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-on-background transition active:scale-90 disabled:opacity-40"
                    disabled={phase !== null}
                    onClick={openCamera}
                  >
                    <Icon name="photo_camera" size={20} />
                  </button>
                  {box && sendBtn}
                </div>
              )}
            </div>

            {!box && sendBtn}
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center md:p-6 bg-on-background/40" onClick={() => setShowHistory(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Recent conversations"
            className="max-h-[70dvh] w-full max-w-lg mx-auto overflow-y-auto rounded-t-card md:rounded-card bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] onit-sheet-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 font-display text-lg font-bold">Recent conversations</h2>
            {history.length === 0 && (
              <p className="py-8 text-center text-sm text-on-surface-variant">Nothing here yet — your last 5 conversations will show up.</p>
            )}
            <div className="space-y-2">
              {history.map((h) => (
                <button key={h.id} className="card flex w-full items-center justify-between gap-3 text-left transition active:scale-[0.99]"
                  onClick={() => openHistoryEntry(h)}>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{h.title}</div>
                    <div className="text-xs text-on-surface-variant/80">{new Date(h.date).toLocaleDateString()}</div>
                  </div>
                  <span className={`status-chip shrink-0
                    ${h.finalized ? 'bg-paid-container text-paid' : 'bg-draft-container text-draft'}`}>
                    <Icon name={h.finalized ? 'check_circle' : 'history'} size={16} />
                    {h.finalized ? 'Sent' : 'Draft'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Offscreen render target for PDF capture */}
      {renderData && theme && profile && (
        <div style={{ position: 'fixed', left: -9999, top: 0 }}>
          <div ref={printRef}>
            <InvoiceTemplate template={profile.invoice_template} data={renderData} theme={theme} />
          </div>
        </div>
      )}

      {/* In-app camera (NEXT_PUBLIC_IN_APP_CAMERA). Use photo feeds the same
          receipt pipeline as the file inputs; the gallery button inside the
          screen is the composer's own picker. */}
      {ReceiptCameraScreen && cameraOpen && (
        <ReceiptCameraScreen
          onClose={() => setCameraOpen(false)}
          onPhoto={(file) => { setCameraOpen(false); void handleReceiptFile(file); }}
          onPickFromLibrary={() => { setCameraOpen(false); galleryRef.current?.click(); }}
        />
      )}

      {paywallFor && <PaywallModal variant={paywallFor} onClose={() => setPaywallFor(null)} />}
      {softWall && (
        <PaywallModal variant={softWall.variant ?? 'invoice'} reason={softWall.reason} returnTo="chat" onClose={() => setSoftWall(null)} />
      )}
    </div>
  );
}
