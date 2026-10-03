'use client';
/* ═══ The core loop ═══
   Speak or type a job → "On it!" → follow-up questions →
   invoice preview card → PDF → native share sheet → follow-up engine.
   Works for guests (5 free parses), saves for signed-in users.
   Text mode is silent. The gold circle is a "+": Mic starts a voice session
   (the circle is then the mic/stop button until the session ends).  */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import ChatRestoreSkeleton from '@/components/ChatRestoreSkeleton';
import { holdSplash } from '@/lib/splash-gate';
import { createClient } from '@/lib/supabase/client';
import { buildTheme, BrandTheme } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey, InvoiceRenderData } from '@/lib/pdf/templates';
import { elementToPdf, invoiceFilename, downloadFile } from '@/lib/pdf/generate';
import { sharePdf, shareText, type ShareResult } from '@/lib/pdf/share';
import { docNoun, formatDocNumber } from '@/lib/documents';
import { chatKey, historyKey, storageNamespace, dropLegacyChatStorage, adoptGuestChat } from '@/lib/chat-storage';
import { getPushSubscription, subscribeToPush, pushAvailability } from '@/lib/push';
import { defaultDueDate, formatDate } from '@/lib/dates';
import { renderSnapshot } from '@/lib/invoice-snapshot';
import PaywallModal, { type PaywallVariant } from '@/components/PaywallModal';
import { PAYWALL_ENABLED } from '@/lib/paywall';
import { noteUpgradeReturn, recentlyUpgraded, waitForAccess } from '@/lib/upgrade-return';
import { fetchUsageLine } from '@/lib/usage';
import { speak, primeSpeech } from '@/lib/tts';
import { newTurnId, traceTurn, redactText, namesDocType, redactPresence } from '@/lib/trace';
import { prepareReceipt, ReceiptError, type PreparedReceipt } from '@/lib/receipt';
import ExpenseCard from '@/components/ExpenseCard';
import ReceiptBubble from '@/components/ReceiptBubble';
import LoggedExpenseCard, { type LoggedExpense } from '@/components/LoggedExpenseCard';
import LineItemsEditor from '@/components/LineItemsEditor';
import OnItSpinner from '@/components/OnItSpinner';
import CountUpMoney from '@/components/CountUpMoney';
import MicRings from '@/components/MicRings';
import ComposerMenu, { MENU_CLOSE_MS, type ComposerPick } from '@/components/ComposerMenu';
import { calculateInvoiceTotals, money, type DepositType } from '@/lib/financials';
import { CATEGORY_LABEL, isExpenseCategory, type ExpenseDraft } from '@/lib/expenses';
import type { ExtractResult, LineItem } from '@/lib/ai';
import { cardAvailableFor, fetchConnectEnabled } from '@/lib/connect-client';

// A failed assistant message carries what it takes to re-run the operation in
// place: the op, plus (for send) the user text to resend. finalize needs no
// payload — it re-reads draft/convoId from state, reusing the same finalize_key.
type Failure = { op: 'send'; text: string } | { op: 'finalize' };
interface Msg { id: string; role: 'user' | 'assistant'; content: string; source?: 'voice' | 'typed'; failed?: Failure; action?: 'new-chat';
  // A quiet status line (free-tier usage): secondary small text, no bubble,
  // and never sent to /api/parse as conversation history.
  quiet?: boolean;
  /** A receipt photo bubble: a small JPEG data URL. '' = a bubble whose image
   *  wasn't kept in storage (see forStorage) — it restores as a placeholder. */
  receipt?: string;
  /** A saved expense, shown as the compact logged card (content keeps the text
   *  confirmation for the model's context). Its thumbnail is the photo
   *  bubble's image, referenced by id — never a second copy. */
  logged?: Omit<LoggedExpense, 'thumb'> & { receiptMsgId?: string | null }; }
interface SendResult { reply: string; ready: boolean; }
interface Profile {
  id: string; business_name: string; logo_url: string | null; website_url: string | null;
  slogan: string | null; brand_colors: string[]; background_color: string | null;
  invoice_template: TemplateKey; paypal_me: string | null; cashapp_tag: string | null;
  venmo_username: string | null;
  access_tier?: string | null; // read only to decide the pre-build (skipPreBuild)
  // Connect flags (select(*)) — for the PDF card line only.
  stripe_account_id?: string | null; stripe_charges_enabled?: boolean | null;
  card_payments_enabled?: boolean | null;
}

const today = () => new Date().toISOString().slice(0, 10);
// Tiers the cap triggers never limit (must match src/lib/access.ts).
const UNLIMITED_TIERS = new Set(['founder', 'trialing', 'active', 'past_due']);

/** The chat reply when a capped user asks for a document over the free cap:
 *  the card still shows, but nothing is saved until they upgrade. The limit
 *  comes from /api/access (the SQL cap functions); 3/5 only if it's missing. */
function overCapReply(kind: 'invoice' | 'expense', limit: unknown): string {
  const n = typeof limit === 'number' ? limit : kind === 'invoice' ? 3 : 5;
  return kind === 'invoice'
    ? `Here's your invoice. You've used your ${n} free invoices, so start your free trial to send it.`
    : `Here's your expense. You've used your ${n} free expenses, so start your free trial to save it.`;
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
function lockBadgeText(status: string | null, amountPaid: number): string {
  if (amountPaid > 0) return status === 'paid' ? 'Paid — locked' : 'Payment received — locked';
  return 'Sent — locked';
}

// The refusal shown when the user tries to edit a locked invoice from chat.
function lockEditNotice(status: string | null, amountPaid: number): string {
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
  line_items?: unknown;
  tax_rate?: number | null;
  due_date?: string | null;
  notes?: string | null;
  deposit_type?: string | null;
  deposit_value?: number | null;
}): Partial<ExtractResult> {
  const d: Record<string, unknown> = {
    intent: row.kind === 'quote' ? 'quote' : 'invoice',
    intent_explicit: false,
    client_name: row.client_name ?? null,
    client_address: row.client_address ?? null,
    client_phone: row.client_phone ?? null,
    line_items: Array.isArray(row.line_items) ? row.line_items : [],
    tax_rate: row.tax_rate ?? null,
    due_date: row.due_date ?? null,
    notes: row.notes ?? null,
    deposit_type: row.deposit_type ?? 'none',
    deposit_value: row.deposit_value ?? null,
  };
  return d as Partial<ExtractResult>;
}

// Editable-field fingerprint: two drafts with the same fingerprint are the same
// document content (Commit B lock check — an incoming parse that matches the
// locked draft is a no-op question, not an edit, so it isn't refused).
function draftFingerprint(d: Partial<ExtractResult> | null): string {
  const items = ((d?.line_items ?? []) as LineItem[]).map((li) => [li.description, li.qty, li.unit_price]);
  return JSON.stringify({
    name: (d?.client_name ?? '').trim(),
    addr: (d?.client_address ?? '').trim(),
    phone: (d?.client_phone ?? '').trim(),
    items,
    tax: d?.tax_rate ?? null,
    depType: (d as any)?.deposit_type ?? 'none',
    depVal: (d as any)?.deposit_value ?? null,
    notes: d?.notes ?? null,
    due: d?.due_date ?? null,
  });
}

// Every message carries a stable id so the transcript renders by id (not array
// index) and a specific message can be replaced in place (retry). Factories
// stamp the id in one spot; `extra` is the seam for per-message fields.
const genMsgId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const aMsg = (content: string, extra?: Partial<Omit<Msg, 'id' | 'role' | 'content'>>): Msg =>
  ({ id: genMsgId(), role: 'assistant', content, ...extra });
const uMsg = (content: string, source?: Msg['source']): Msg =>
  ({ id: genMsgId(), role: 'user', content, source });

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
  return aMsg(`${part}! Snap a receipt, or tap + to start an invoice or quote.`);
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
  const out = messages.slice();
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
// that handler's single finally — except sign-in-redirect paths, which set
// 'redirecting' and leave it set so controls stay disabled until the redirect
// unmounts the screen. Each value titles the one visible processing indicator.
// Replaces the old busy / finalizing / preparing / savingExpense states and both
// guard refs. `recording` (mic open, awaiting speech) is separate and stays.
type Phase = null | 'thinking' | 'reading' | 'preparing' | 'building' | 'saving' | 'redirecting';

export default function Chat() {
  const supabase = createClient();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(() => [greeting()]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>(null);
  // Failure + retry motion (MOTION-SPEC §7). Messages that arrived by restore
  // (reload / history) never shake on mount; a live failure does. retryShake
  // counts finished retries per message: bumping it re-keys the bubble, so a
  // retry that fails again shakes again (a success replaces the bubble).
  const restoredMsgIdsRef = useRef<Set<string>>(new Set());
  const [retryingId, setRetryingId] = useState<string | null>(null);
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
  // Live status of the linked saved invoice (Commit B). Fetched on restore,
  // history open, and at save time so the card knows if it has left 'draft'. A
  // non-draft, non-null status locks the card read-only; amount_paid decides the
  // paid/partly-paid copy (and, in Commit C, whether Revise is offered).
  const [linkedStatus, setLinkedStatus] = useState<string | null>(null);
  const [linkedAmountPaid, setLinkedAmountPaid] = useState<number>(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Capped tiers (free, canceled, anything not unlimited) get no background
  // pre-build for an INVOICE: it INSERTs the draft row before Send, which would
  // spend a free invoice slot on a card that may never be sent. Their Send
  // builds at tap time instead (the slow path). Quotes never count, so they
  // keep the pre-build. Only while the paywall is on.
  const skipPreBuild = PAYWALL_ENABLED && !!profile
    && !UNLIMITED_TIERS.has(profile.access_tier ?? 'free')
    && docKind(draft) === 'invoice';
  // Connect on in this deployment? (PDF card line; fails closed.)
  const [connectOn, setConnectOn] = useState(false);
  useEffect(() => { void fetchConnectEnabled().then(setConnectOn); }, []);
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
  // or 'install' (iPhone Safari tab: Home Screen hint). See maybeOfferReminders.
  const [reminderPrompt, setReminderPrompt] = useState<{ kind: 'ask' | 'install'; client: string } | null>(null);
  const [convoId, setConvoId] = useState('');
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
    if (!id) { setLinkedStatus(null); setLinkedAmountPaid(0); return; }
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

      // Auth/profile gating is a separate concern from restore and uses
      // getUser() (server-validated). A slow or failed call here no longer
      // costs the conversation, which is already back on screen.
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setProfileLoaded(true); // resolved: genuine guest
      } else {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (cancelled) return;
        if (!data) { router.push('/onboarding'); return; }
        setProfile(data as Profile);
        setProfileLoaded(true);
      }
    })();
    // register service worker for the 2-day follow-up notifications
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    // header history icon lives in the shared layout — it signals us here
    const openHistory = () => {
      setHistory(loadHistory(storageNsRef.current ?? 'guest'));
      setShowHistory(true);
    };
    window.addEventListener('onit-history', openHistory);
    return () => { cancelled = true; window.removeEventListener('onit-history', openHistory); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Splash gate (lib/splash-gate): on a cold start the splash stays up until
  // this screen has its critical data — the conversation restored AND auth/
  // profile resolved — so it exits onto real content, not the skeleton. The
  // hold is advisory: Splash caps the wait, and unmount (e.g. the /onboarding
  // redirect) releases it.
  const releaseSplashRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const release = holdSplash();
    releaseSplashRef.current = release;
    return release;
  }, []);
  useEffect(() => {
    if (hydrated && profileLoaded) releaseSplashRef.current?.();
  }, [hydrated, profileLoaded]);

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
      pendingInvoiceRef.current = null;
      finalizeSentRef.current = false;
      discardExpense();
      setFinished(false);
      setConvoId(genId());
    }
    window.addEventListener('onit-new-chat', onNewChat);
    return () => window.removeEventListener('onit-new-chat', onNewChat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, draft, ready, finished, convoId, cardAfterId]);

  // /chat?new=1 — the recap's "Make an invoice": start a fresh conversation
  // (the live one is archived to history, as with the header's New chat).
  // After hydration, so the restored conversation is what gets archived; the
  // event fires a tick later, once the listener above holds that state.
  const newFromParam = useRef(false);
  useEffect(() => {
    if (!hydrated || newFromParam.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('new') !== '1') return;
    const t = setTimeout(() => {
      newFromParam.current = true;
      url.searchParams.delete('new');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      window.dispatchEvent(new Event('onit-new-chat'));
    }, 0);
    return () => clearTimeout(t);
  }, [hydrated]);

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
  useIsoLayoutEffect(pinToBottom, [messages, ready, draft, phase, pendingChange, expenseDraft, reminderPrompt]);
  // The list itself shrinking (composer growing, Android keyboard) would hide
  // the latest line; stay pinned if the reader was at the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(pinToBottom);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Shared parse flow for typed and spoken input. The reply always renders as
   *  text first; it is spoken (TTS) only when THIS message was entered by voice
   *  — per-message modality, so typed messages stay silent. */
  async function send(text: string, source: 'voice' | 'typed' = 'typed', retryId?: string): Promise<SendResult | null> {
    const trimmed = text.trim();
    // Single in-flight guard. `phase` is state and lags a render, so a sub-frame
    // double-tap can still slip one through (accepted). It fixes the reported
    // repeat-tap bug because it is set before ANY branch and, on redirect paths,
    // left set. Cleared in the one outer finally below (unless 'redirecting').
    if (!trimmed || phase) return null;
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
    const next: Msg[] = retryId
      ? messages.filter((m) => m.id !== retryId)
      : [...messages, uMsg(trimmed, source)];
    if (!retryId) {
      // The reader just acted: follow their message and the reply to it, even
      // if they had scrolled up.
      nearBottomRef.current = true;
      setMessages(next);
      setInput('');
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
        `${label} is sent and locked. Tap Revise on the card to change it, or start a new job.`,
        { action: 'new-chat' }
      )]);
      return null;
    }

    setFinished(false); // a new message means a live conversation again

    // A bare affirmative ("yes", "send it") while the preview card is up sends
    // it. Voice users just say it; no tap needed (decision: button + text).
    if (draft && ready && isAffirmative(trimmed)) {
      await finalize(true); // internal: we already hold the turn, skip its guard
      return null;
    }

    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Role + text only: a receipt bubble's photo stays on the device;
        // quiet usage lines are never sent as history.
        body: JSON.stringify({ history: next.slice(1).filter((m) => !m.quiet).map(({ role, content }) => ({ role, content })), draft }),
      });
      const data = await res.json();
      if (res.status === 401 && data.authRequired) {
        setMessages((m) => [...m, aMsg(data.reply)]);
        setPhase('redirecting'); // leave set: keep controls disabled through the redirect
        setTimeout(() => router.push('/login'), 1600);
        return null;
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
      // only for a capped tier's new, ready invoice or a complete expense
      // (quotes are never capped); fails open like the Send gate.
      const effIntent = data.intent_explicit === false && draft?.intent ? draft.intent : data.intent;
      const isReady = Boolean(data.ready) && data.intent !== 'expense';
      const expenseComplete = data.intent === 'expense' && typeof data.expense?.amount === 'number' && data.expense.amount > 0;
      const cappedTier = PAYWALL_ENABLED && !!profile && !UNLIMITED_TIERS.has(profile.access_tier ?? 'free');
      let overCap: null | 'invoice' | 'expense' = null;
      if (cappedTier && ((isReady && effIntent === 'invoice' && !pendingInvoiceRef.current) || expenseComplete)) {
        try {
          const gate = await (await fetch('/api/access')).json();
          if (expenseComplete && gate?.canExpense === false) overCap = 'expense';
          if (!expenseComplete && gate?.hasAccess === false) overCap = 'invoice';
          if (overCap) data.reply = overCapReply(overCap, overCap === 'invoice' ? gate.invoiceLimit : gate.expenseLimit);
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
            .ilike('name', data.client_name)
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
        } as Partial<ExtractResult>;

        // Commit B lock: the linked invoice has left 'draft' (sent/paid) and is
        // read-only. Refuse a chat edit that would change it — but let a no-op
        // parse (a question that reproduces the same draft) through silently, so
        // "what's the total?" still works. Revising is offered on the card.
        if (pendingInvoiceRef.current && isLockedStatus(linkedStatus) && draft
          && draftFingerprint(draft) !== draftFingerprint(mergedDraft)) {
          setMessages((m) => [...m, aMsg(lockEditNotice(linkedStatus, linkedAmountPaid))]);
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
      setPhase((p) => (p === 'redirecting' ? p : null));
    }
  }

  // ── Finalize: save → render → PDF → share sheet ─────────────
  const theme: BrandTheme | null =
    profile?.background_color && profile.brand_colors.length >= 2
      ? buildTheme(profile.brand_colors, profile.background_color)
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
      slogan: profile.slogan,
      clientName: draft.client_name ?? 'Client',
      clientAddress: draft.client_address ?? null,
      clientPhone: draft.client_phone ?? null,
      lineItems: items,
      subtotal, taxRate, taxAmount,
      total,
      depositType: hasDeposit ? (depositType as 'percentage' | 'fixed') : 'none',
      depositValue: hasDeposit ? depositValue : undefined,
      depositAmount: hasDeposit ? totals.depositAmount : undefined,
      remaining: hasDeposit ? totals.remaining : undefined,
      amountDueNow: totals.amountDueNow,
      notes: draft.notes ?? null,
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
    };
  }

  const [renderData, setRenderData] = useState<InvoiceRenderData | null>(null);
  // Free-tier cap hit: which wall to show (invoice or expense), or none.
  const [paywallFor, setPaywallFor] = useState<null | PaywallVariant>(null);
  // "1 of 3 free invoices used" under the card after a free-tier invoice is
  // saved (lib/usage.ts). Tied to the invoice row so it never outlives it.
  const [invoiceUsage, setInvoiceUsage] = useState<{ id: string; text: string } | null>(null);
  // Back from Stripe Checkout (?upgraded=1): remember it so the gates below
  // wait out the webhook instead of re-showing the wall.
  useEffect(() => { noteUpgradeReturn(); }, []);

  /** The card summary, posted once when the card first appears: what we have,
   *  any contact pulled from the saved client record (so a stale one can be
   *  caught), and what's still missing. Information only — it never gates the
   *  send; the one-tap send works immediately. Plain sentences, no lists. */
  function cardSummary(d: Partial<ExtractResult>, savedAddress: boolean, savedPhone: boolean): string {
    const items = (d.line_items ?? []) as LineItem[];
    const depositType = ((d as any).deposit_type as DepositType) ?? 'none';
    const depositValue = Number((d as any).deposit_value ?? 0);
    const totals = calculateInvoiceTotals(items, d.tax_rate ?? 0, depositType, depositValue);
    const kind = docKind(d);
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
  function finishFinalize(doneMsg: Msg, retryId?: string) {
    // Point 4: the final confirmation string — summarized like the input, since
    // it embeds the client name; raw text only under NEXT_PUBLIC_TRACE_VERBOSE.
    traceTurn(turnIdRef.current, 'confirm', { ...redactText(doneMsg.content) });
    // On a finalize retry the done message replaces the failed bubble in place,
    // so neither the transcript nor the archived history keeps a dead error.
    const archived = emitResult(messages, doneMsg, retryId);
    setMessages(archived);
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
      client: [r.client_name ?? null, r.client_address ?? null, r.client_phone ?? null],
      items: r.line_items ?? null,
      tax: r.tax_rate ?? null,
      depType: r.deposit_type ?? null,
      depVal: r.deposit_value ?? null,
      notes: r.notes ?? null,
      due: r.due_date ?? null,
    });
  };

  // Pre-build the card's PDF as soon as the card renders, and rebuild it after
  // every edit/undo (any draft change moves the signature). Debounced; builds are
  // serialized (`preparing`) and wait while a turn holds `phase` — a later change
  // re-fires this. Signed-in only: a guest has no row to build against.
  useEffect(() => {
    if (!ready || !draft || !profile) return;
    if (skipPreBuild) return;
    if (isLockedStatus(linkedStatus) || finalizeSentRef.current) return;
    if (phase !== null || preparing) return;
    if (prepState && prepState.sig === draftSignature(draft)) return;
    if (preBuildTimerRef.current) clearTimeout(preBuildTimerRef.current);
    preBuildTimerRef.current = setTimeout(() => { void finalize(true, undefined, 'prepare'); }, 400);
    return () => { if (preBuildTimerRef.current) clearTimeout(preBuildTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, ready, profile, linkedStatus, phase, preparing, prepState, skipPreBuild]);

  // mode 'prepare': the background pre-build above — it runs the SAME persist +
  // PDF build as a send but, instead of sharing, stashes the File in preBuiltRef
  // for the send tap to attach synchronously. It never shares, marks sent, posts
  // a message, shows the paywall, or touches `phase` (so the composer stays
  // usable); a failure just records prepState 'failed'.
  async function finalize(internal = false, retryId?: string, mode: 'send' | 'download' | 'prepare' = 'send') {
    if (mode === 'prepare') {
      if (preparingRef.current || finalizeSentRef.current || isLockedStatus(linkedStatus) || !profile || skipPreBuild) return;
      preparingRef.current = true;
      setPreparing(true);
      // The DB row is about to be rewritten from the current draft, so an older
      // stashed file may no longer match it. Drop it until this build lands.
      preBuiltRef.current = null;
    } else if (!internal && phase) return;
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
      setMessages((m) => [...m, aMsg("Let's save your work — sign in to send this invoice.")]);
      setPhase('redirecting'); // leave set: keep the card disabled through the redirect
      setTimeout(() => router.push('/login'), 1600);
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

    // Quotes are never capped (the trigger skips kind <> 'invoice'), so only a
    // new INVOICE is gated — for every tier the trigger caps, canceled included.
    if (!pendingInvoiceRef.current && docKind(draft) === 'invoice') {
      try {
        let gate = await (await fetch('/api/access')).json();
        // Just back from Checkout? The webhook may not have landed yet: give it
        // a few seconds before showing the wall again (lib/upgrade-return).
        if (gate && gate.hasAccess === false && recentlyUpgraded()) {
          gate = (await waitForAccess((a) => a.hasAccess === true)) ?? gate;
        }
        if (gate && gate.hasAccess === false) {
          if (mode !== 'prepare') setPaywallFor('invoice'); // the send tap shows it
          return;
        }
      } catch { /* access check unreachable — fail open, allow the invoice */ }
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
      const clientRow: { user_id: string; name: string; address?: string; phone?: string } = {
        user_id: profile.id,
        name: rd0.clientName,
      };
      if (rd0.clientAddress) clientRow.address = rd0.clientAddress;
      if (rd0.clientPhone) clientRow.phone = rd0.clientPhone;
      const { data: client } = await supabase
        .from('clients')
        .upsert(clientRow, { onConflict: 'user_id,name' })
        .select('id').single();

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
        line_items: lineItemsForSave,
        subtotal: rd0.subtotal,
        tax_rate: rd0.taxRate,
        tax_amount: rd0.taxAmount,
        total: rd0.total,
        deposit_type: rd0.depositType ?? 'none',
        deposit_value: rd0.depositValue ?? null,
        deposit_amount: rd0.depositAmount ?? null,
        notes: rd0.notes,
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
          if (insErr?.hint === 'PAYWALL_LIMIT') {
            if (mode !== 'prepare') setPaywallFor('invoice');
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
              if (!retryId && mode !== 'prepare') setMessages((m) => [...m, aMsg(
                navigator.onLine
                  ? "Couldn't save that invoice just now. Your draft is safe."
                  : "You're offline — the invoice didn't send. Your draft is safe.",
                { failed: { op: 'finalize' } },
              )]);
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
              if (mode !== 'prepare') setMessages((m) => [...m, aMsg(lockEditNotice((existing.status as string) ?? null, Number(existing.amount_paid ?? 0)))]);
              return;
            }
            await supabase.from('invoices').update(draftCols).eq('id', newId);
          } else {
            console.error('invoice insert failed', insErr);
            if (!retryId && mode !== 'prepare') setMessages((m) => [...m, aMsg(
              navigator.onLine
                ? "Couldn't save that invoice just now. Your draft is safe."
                : "You're offline — the invoice didn't send. Your draft is safe.",
              { failed: { op: 'finalize' } },
            )]);
            return; // outer finally clears phase; draft + ready untouched
          }
        } else {
          newId = saved.id as string;
          newNo = saved.invoice_number as number; // trigger-assigned, authoritative
          // Free-tier usage line (null for paid tiers / paywall off). Quotes are
          // never capped, so they never show one.
          if (rd0.kind === 'invoice') {
            const savedId = newId;
            void fetchUsageLine('invoice').then((text) => { if (text) setInvoiceUsage({ id: savedId, text }); });
          }
          publicToken = (saved.public_token as string) ?? null;
        }
        invoiceId = newId;
        no = newNo;
        pendingInvoiceRef.current = { id: newId, no: newNo };
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
          if (mode !== 'prepare') setMessages((m) => [...m, aMsg(lockEditNotice((live.status as string) ?? null, Number(live.amount_paid ?? 0)))]);
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
          if (!retryId && mode !== 'prepare') setMessages((m) => [...m, aMsg(
            navigator.onLine
              ? "Couldn't save your changes just now. Your draft is safe."
              : "You're offline — your changes didn't save. Your draft is safe.",
            { failed: { op: 'finalize' } },
          )]);
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
        const kind = docKind(draft);
        finishFinalize(aMsg(`All set — your ${kind} for ${draft.client_name ?? 'your client'} is sent.`), retryId);
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
          invoiceFilename(rd.kind, no, rd.clientName, profile.business_name)
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
      if (!retryId && mode !== 'prepare') setMessages((m) => [...m, aMsg(
        navigator.onLine
          ? "Couldn't finish that one. Your draft is safe."
          : "You're offline — the invoice didn't send. Your draft is safe.",
        { failed: { op: 'finalize' } },
      )]);
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
        setPhase((p) => (p === 'redirecting' ? p : null));
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
      if (!retryId) setMessages((m) => [...m, r.name === 'NotAllowedError'
        ? aMsg(`Your ${docNoun(docKind(draft)).toLowerCase()} is ready. Tap Share ${docNoun(docKind(draft)).toLowerCase()} to send it.`)
        : aMsg(
          `The share sheet didn't open (${r.name}). Your draft is safe. Tap send to try again.`,
          { failed: { op: 'finalize' } },
        )]);
      return;
    }
    setShareWaiting(null);
    if (!profile || !draft) return;
    const downloaded = r.status === 'unsupported';
    if (downloaded) downloadFile(pb.file);
    // The row was persisted from this exact draft before the file was built (the
    // signature matches), so only the status moves. renderSnapshot pins identity
    // as-sent; Zelle is not snapshotted (see renderSnapshot).
    await supabase.from('invoices')
      .update({ status: 'sent', sent_at: new Date().toISOString(), ...renderSnapshot(profile) })
      .eq('id', pb.id);
    finalizeSentRef.current = true;
    persistProgress();
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
    // On a retry the done message replaces the failed bubble instead of appending.
    finishFinalize(aMsg(downloaded
      ? `Downloaded! Send it to ${who} however you like. I'll keep an eye on it.`
      : `Sent! I'll nudge you if ${who} hasn't paid in 2 days.`), retryId);
    // The right moment to ask about payment alerts: right after an invoice
    // actually goes out. One-time; skipped if already subscribed.
    if (docKind(draft) === 'invoice') void maybeOfferReminders(who);
  }

  // Re-run the operation behind a failed message, in place. The message's id is
  // passed down so the outcome replaces THIS bubble (success) or leaves it as-is
  // (repeat failure). finalize reuses the same convoId/finalize_key, so the
  // server-side 23505 read-back guarantees no duplicate invoice on a retry.
  function retry(msg: Msg) {
    if (phase || !msg.failed) return; // a turn is in flight, or nothing to retry
    setRetryingId(msg.id);
    const run: Promise<unknown> = msg.failed.op === 'send'
      ? send(msg.failed.text, 'typed', msg.id)
      : finalize(false, msg.id);
    void run.finally(() => {
      setRetryingId(null);
      setRetryShake((s) => ({ ...s, [msg.id]: (s[msg.id] ?? 0) + 1 }));
    });
  }

  // Payment-alerts offer, shown once after a completed invoice send (never on
  // load). Replaces the old "first invoice only" count check, which drafts now
  // inflate (a card creates its draft row on render), so it could never fire.
  // A new storage key, so people who dismissed the old reminders-only card are
  // asked once about payment alerts. On an iPhone in a Safari tab (no web push
  // there) it becomes a Home Screen hint instead; blocked or unsupported
  // browsers get nothing.
  async function maybeOfferReminders(clientName: string) {
    if (!profile) return;
    try {
      if (localStorage.getItem(ALERTS_PROMPTED_KEY)) return;
      const avail = pushAvailability();
      if (avail === 'unsupported' || avail === 'denied') return;
      if (avail === 'ready' && (await getPushSubscription())) return; // already on
      setReminderPrompt({ kind: avail === 'needs-install' ? 'install' : 'ask', client: clientName });
    } catch { /* never block the send flow */ }
  }

  // Straight from the Yes tap: subscribeToPush() asks permission before
  // anything else is awaited (the iOS gesture rule).
  async function enableReminders() {
    if (!profile || !reminderPrompt) return;
    const who = reminderPrompt.client;
    setReminderPrompt(null);
    try { localStorage.setItem(ALERTS_PROMPTED_KEY, '1'); } catch { /* ignore */ }
    const ok = await subscribeToPush();
    setMessages((m) => [...m, aMsg(ok
      ? `You're set. I'll ping you when ${who} pays, and nudge you if an invoice sits unpaid for 2 days.`
      : "Couldn't turn that on. You can switch payment alerts on any time in Settings.")]);
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

    if (phase) return; // a turn is already in flight
    discardExpense();
    // Own the phase for the whole pick→prepare→dedup→read flow in ONE outer
    // finally, so there is no gap where the controls re-enable mid-flow and no
    // path (incl. an unexpected throw in findDuplicate) can leave it stuck.
    // readReceipt advances it to 'reading' and, on the guest 401, 'redirecting'.
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
      setPhase((p) => (p === 'redirecting' ? p : null));
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
  // clears it). We advance the phase to 'reading' for the vision call and, on the
  // guest 401, to 'redirecting' so the caller leaves it set through the redirect.
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
        setMessages((m) => [...m, aMsg(data.reply)]);
        setReceipt(null);
        setPhase('redirecting'); // leave set through the redirect (caller keeps it)
        setTimeout(() => router.push('/login'), 1600);
        return;
      }
      if (!res.ok) {
        setMessages((m) => [...m, aMsg(data.reply ?? "Couldn't read that one.")]);
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
    } catch {
      setMessages((m) => [...m, aMsg('Connection hiccup — try that photo again.')]);
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
      setMessages((m) => [...m, aMsg("Let's save your work — sign in to keep this expense.")]);
      setPhase('redirecting'); // leave set: keep the save button disabled through the redirect
      setTimeout(() => router.push('/login'), 1600);
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

      const { error: insErr } = await supabase.from('expenses').insert({
        user_id: profile.id,
        amount: expenseDraft.amount,
        category: expenseDraft.category,
        vendor: expenseDraft.vendor,
        // Blank → null (the column's length check rejects an empty string).
        description: expenseDraft.description?.trim() || null,
        spent_on: expenseDraft.occurred_on ?? today(),
        receipt_url: receiptPath,
        receipt_hash: receipt?.hash ?? null,
      });
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
    } finally {
      setPhase((p) => (p === 'redirecting' ? p : null));
    }
  }

  /** Drop the in-flight expense and its photo. Used by cancel, and before a
   *  new pick so two receipts can never share one card. */
  function discardExpense() {
    receiptBubbleIdRef.current = null;
    setReceipt(null);
    setExpenseDraft(null);
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
    try {
      const stream = await getSessionStream(); // reused across takes — one prompt per session
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
        let text = '';
        let data: { text?: string; authRequired?: boolean; message?: string } = {};
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: blob });
          data = await res.json();
          text = (data.text ?? '').trim();
        } catch { /* treated as "didn't catch that" */ }
        // Guest voice budget spent (per-browser or global daily cap) — show the
        // signup prompt and route to login, same as /api/parse's authRequired.
        if (data.authRequired) {
          setMessages((m) => [...m, aMsg(data.message ?? "Create your free account to keep going.")]);
          setPhase('redirecting'); // leave set through the redirect
          setTimeout(() => router.push('/login'), 1600);
          return;
        }
        // Clear before delegating to send(), which re-claims the turn (its guard
        // reads `phase`, so it must be idle here). No-text take just reports back.
        setPhase(null);
        // Voice auto-sends immediately as a 'voice' message — no cancel window,
        // no send tap. One final transcript per take (record-then-POST), so this
        // fires exactly once. The reply is spoken because the source is 'voice'.
        if (text) void send(text, 'voice');
        else setMessages((m) => [...m, aMsg("Didn't catch that — try again or type it.")]);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      // mic blocked/denied → end the session and fall back to typing (no hang)
      setVoiceSession(false); sessionRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setMessages((m) => [...m, aMsg('Mic access is blocked. You can type instead.')]);
    }
  }

  // ── The composer's "+" menu (release frames 1b, motion 1d). Outside a voice
  // session "+" opens Voice · New invoice · New quote; during one the same
  // button is the × that ends the session.
  const [plusMenu, setPlusMenu] = useState<'open' | 'closing' | null>(null);
  const plusTimer = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    // New invoice / New quote: until the guided template lands (merge 2, §L Q1),
    // start a fresh conversation with the field primed and focused (focus
    // inside the tap, so iOS opens the keyboard).
    window.dispatchEvent(new Event('onit-new-chat'));
    const seed = k === 'quote' ? 'Quote for ' : 'Invoice for ';
    setInput(seed);
    inputRef.current?.focus();
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(seed.length, seed.length));
    closePlusMenu();
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
          .select('id, invoice_number, status, amount_paid, kind, client_name, client_address, client_phone, line_items, tax_rate, notes, due_date, deposit_type, deposit_value')
          .eq('finalize_key', entry.id)
          .is('deleted_at', null)
          .maybeSingle();
        if (!row?.id) return; // no saved row — plain draft/finalized entry as set above
        pendingInvoiceRef.current = { id: row.id as string, no: row.invoice_number as number };
        setLinkedStatus((row.status as string) ?? null);
        setLinkedAmountPaid(Number(row.amount_paid ?? 0));
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
  // The send button waits ("Preparing…") until the pre-build for THIS exact
  // draft has finished, so a tap is always the synchronous share. A guest has no
  // pre-build (the tap routes to sign-in), so it is ready once the profile
  // lookup has resolved.
  const sendReady = !profileLoaded ? false
    : !profile ? true
    // No pre-build for capped tiers: Send takes the slow path (build at tap).
    : skipPreBuild ? !!draft
    : !!draft && prepState?.sig === draftSignature(draft);
  // Commit B: the linked invoice has left 'draft' — the card is read-only.
  const locked = isLockedStatus(linkedStatus);

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

  function applyDraftNotes(notes: string) {
    if (draft) {
      setDraftHistory((prev) => [...prev.slice(-19), draft]);
      setDraft({ ...draft, notes } as any);
    }
  }

  function undoLastEdit() {
    if (draftHistory.length === 0) return;
    const previous = draftHistory[draftHistory.length - 1];
    setDraftHistory((prev) => prev.slice(0, -1));
    setDraft(previous);
  }

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
  // content plus a "Revises INV-XXXX" note. The original row is never touched —
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
  const revisingRef = useRef(false);
  function reviseInvoice() {
    if (!draft || revisingRef.current) return;
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
    const originalNo = pendingInvoiceRef.current?.no ?? null;
    const label = originalNo != null ? formatDocNumber(kind, originalNo) : 'the original';
    const reviseNote = `Revises ${label}`;
    const existingNotes = (draft.notes ?? '').trim();
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
    const startMsg = aMsg(`Starting a revision of ${label}. Change anything, then send — this is a new ${kind} and the original stays as it was.`);
    setMessages([greeting(), startMsg]);
    setDraft(seed);
    setReady(true);
    setCardAfterId(startMsg.id);
    setDuplicateHint(false);
  }

  // The invoice/quote card renders INSIDE the transcript, right after its
  // anchor message (cardAfterId), so later messages land below it. A missing
  // or stale anchor (older saved chats) falls back to the last message.
  const cardAnchorId = cardAfterId && messages.some((m) => m.id === cardAfterId)
    ? cardAfterId
    : messages[messages.length - 1]?.id ?? null;
  const invoiceCard = ready && draft ? (
    // data-no-tab-swipe: drags on the card (line items, fields) never switch tabs.
    <div data-no-tab-swipe="true" className={`card border-primary-container/50 ring-1 ring-primary-container/30${cardAnim === 'enter' ? ' onit-card-enter' : ''}${cardAnim === 'exit' ? ' onit-card-exit' : ''}`}>
      <div className="mb-3 flex items-center gap-2 text-label-lg font-semibold uppercase tracking-wide text-primary">
        <Icon name="description" size={18} />
        {docKind(draft) === 'quote' ? 'Quote' : 'Invoice'} for {draft.client_name}
      </div>
      {locked && (
        // Read-only: the linked invoice has left 'draft' (sent/paid).
        <div className={`mb-3 inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold text-on-surface-variant${cardAnim === 'lock' ? ' onit-chip-in' : ''}`}>
          <Icon name="lock" size={16} filled className={cardAnim === 'lock' ? 'onit-lock-drop' : ''} />
          {lockBadgeText(linkedStatus, linkedAmountPaid)}
        </div>
      )}
      {duplicateHint && !locked && (
        // Passive indicator only — the card stays fully actionable below.
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary-container/40 px-3 py-1 text-xs font-semibold text-primary">
          <Icon name="error" size={16} filled />
          Similar invoice sent recently
        </div>
      )}
      <LineItemsEditor items={previewItems} editable={!locked} onChange={applyDraftLineItems} />

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
              <input
                type="number"
                min="0"
                max={(draft as any).deposit_type === 'percentage' ? 100 : 1000000}
                disabled={locked}
                className="h-11 min-h-[44px] w-20 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 text-right text-xs font-semibold outline-none disabled:opacity-50"
                value={(draft as any).deposit_value ?? ''}
                placeholder={(draft as any).deposit_type === 'percentage' ? '40' : '100'}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value) || 0);
                  applyDraftDeposit((draft as any).deposit_type as DepositType, v);
                }}
              />
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

      <div className="mt-2 border-t border-outline-variant pt-2.5 space-y-1">
        {/* Display-only Subtotal + Tax, shown only when a tax rate is set.
            Values from calculateInvoiceTotals (single source of truth);
            mirrors the PDF Totals block. No editable tax field here — tax
            is set via chat / the detail page only. */}
        {(draft.tax_rate ?? 0) > 0 && (
          <>
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span>Subtotal</span>
              <span>{money(previewTotals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span>Tax ({draft.tax_rate}%)</span>
              <span>{money(previewTotals.taxAmount)}</span>
            </div>
          </>
        )}
        {previewTotals.depositAmount > 0 && (
          <>
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span>Project total</span>
              <span>{money(previewTotals.total)}</span>
            </div>
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span>{(draft as any).deposit_type === 'percentage' ? `${(draft as any).deposit_value}% deposit` : 'Deposit'}</span>
              <span>{money(previewTotals.depositAmount)}</span>
            </div>
            <div className="flex justify-between text-xs text-on-surface-variant font-medium">
              <span>Remaining balance</span>
              <span>{money(previewTotals.remaining)}</span>
            </div>
          </>
        )}
        <div className="flex items-end justify-between pt-1">
          <span className="pb-1 text-label-lg font-semibold uppercase text-on-surface-variant">
            {previewTotals.depositAmount > 0 ? 'Deposit due now' : docKind(draft) === 'quote' ? 'Quoted total' : 'Total due'}
          </span>
          <span className="font-display text-numeric-xl tracking-tight text-on-background tabular-nums">
            <CountUpMoney
              value={previewTotals.amountDueNow}
              run={cardAnim === 'enter'}
              format={money}
              delayMs={180 + Math.min(previewItems.length, 8) * 70 + 60}
            />
          </span>
        </div>
      </div>
      {locked ? (
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
                This {docKind(draft) === 'quote' ? 'quote' : 'invoice'} was sent, so it&apos;s locked.
              </p>
              <button className="btn-primary mt-3 w-full" disabled={phase !== null} onClick={reviseInvoice}>
                <Icon name="edit" size={18} /> Revise
              </button>
              <p className="mt-1 text-center text-xs text-on-surface-variant/80">
                Opens an editable copy as a new {docKind(draft) === 'quote' ? 'quote' : 'invoice'}. The original stays as it was.
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-on-surface-variant">
              {lockBadgeText(linkedStatus, linkedAmountPaid)}. Start a new invoice to make changes.
            </p>
          )}
        </div>
      ) : (
        <>
          {!isValidTotal && (
            <p className="mt-2 text-xs font-semibold text-error">
              Something went wrong reading the amounts. Try rephrasing the prices.
            </p>
          )}
          <button
            className={`btn-primary mt-3 w-full${cardAnim === 'enter' ? ' onit-fade-in' : ''}`}
            style={cardAnim === 'enter' ? { animationDelay: `${180 + Math.min(previewItems.length, 8) * 70 + 660}ms` } : undefined}
            disabled={phase !== null || !isValidTotal || !sendReady}
            onClick={() => finalize()}
          >
            {sendReady && shareWaiting === draftSignature(draft) && phase !== 'building' ? (
              // The file is built and waiting: this tap opens the share sheet.
              <>
                <Icon name="share" size={18} />
                {`Share ${docNoun(docKind(draft)).toLowerCase()}`}
              </>
            ) : (
              <>
                <Icon name="attach_file" size={18} />
                {phase === 'building' ? 'Building your PDF…' : !sendReady ? 'Preparing…' : 'Looks right — send it'}
              </>
            )}
          </button>
          {/* Quiet secondary exit: download the PDF without sending. Saves the
              draft (sendable later); does not mark sent or archive. */}
          <button className="mt-1 min-h-touch w-full inline-flex items-center justify-center gap-1.5 text-sm text-on-surface-variant disabled:opacity-40"
            disabled={phase !== null || !isValidTotal}
            onClick={() => finalize(false, undefined, 'download')}>
            <Icon name="download" size={18} /> Download without sending
          </button>
          <div className="mt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              className="min-h-touch text-sm text-on-surface-variant underline disabled:opacity-40"
              disabled={phase !== null || draftHistory.length === 0}
              onClick={undoLastEdit}
            >
              Undo last edit
            </button>
            <button
              type="button"
              className="min-h-touch text-sm text-on-surface-variant underline disabled:opacity-40"
              disabled={phase !== null}
              onClick={() => send('Actually, let me change something')}
            >
              Change something
            </button>
          </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <div className="flex h-full flex-col">
      {shutterKey > 0 && <div key={shutterKey} aria-hidden className="onit-shutter" />}
      {/* The ONE scroll owner. overscroll-y-contain keeps a fling that hits
          the end inside the list (its own bounce), instead of chaining to the
          page, whose bounce would then grab the next gesture. Scoped here —
          no global overscroll rule. */}
      <div
        ref={listRef}
        onScroll={onListScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain px-4 py-4"
      >
        {hydrated && dayLabel(messages) && (
          <div className="py-1 text-center text-[11px] font-semibold tracking-[.08em] text-on-surface-variant/70">{dayLabel(messages)}</div>
        )}
        {!hydrated && !skeletonTimedOut ? <ChatRestoreSkeleton /> : messages.map((m) => (
        <Fragment key={m.id}>{
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
                  className={`whitespace-pre-wrap rounded-[18px] rounded-bl-md border border-outline-variant/50 bg-surface-container px-3.5 py-2.5 text-[15px] leading-snug${
                    (retryShake[m.id] ?? 0) > 0 || !restoredMsgIdsRef.current.has(m.id) ? ' onit-shake' : ''}`}
                >
                  {m.content}
                </div>
                {/* Inline Retry under the item (no modal): it keeps its width; the
                    icon spins in place while retrying. */}
                <button
                  aria-label={retryingId === m.id ? 'Retrying' : 'Retry'}
                  className="flex min-h-11 items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-3.5 text-label-lg font-semibold text-primary transition onit-fade-in active:scale-95 disabled:opacity-40"
                  disabled={phase !== null}
                  onClick={() => retry(m)}
                >
                  <Icon name="refresh" size={20} className={retryingId === m.id ? 'onit-spin' : ''} />
                  Retry
                </button>
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
          ) : m.logged ? (
            <LoggedExpenseCard
              key={m.id}
              e={{ ...m.logged, thumb: m.logged.receiptMsgId ? messages.find((x) => x.id === m.logged?.receiptMsgId)?.receipt || null : null }}
              animate={liveLoggedIdRef.current === m.id}
            />
          ) : m.receipt !== undefined ? (
            <ReceiptBubble
              key={m.id}
              src={m.receipt}
              animate={liveReceiptRef.current?.id === m.id}
              startAfter={liveReceiptRef.current?.id === m.id ? liveReceiptRef.current.flashPeak : undefined}
            />
          ) : (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {/* Release frames: On It = cream bubble, you = ink bubble. A
                  message that just arrived rises 8px (motion inventory "New On
                  It message", 240ms); restored ones are static. */}
              <div
                className={`max-w-[82%] whitespace-pre-wrap rounded-[18px] px-3.5 py-2.5 text-[15px] leading-snug
                  ${m.role === 'user'
                    ? 'rounded-br-md bg-inverse-surface text-inverse-on-surface'
                    : 'rounded-bl-md border border-outline-variant/50 bg-surface-container'}${
                  restoredMsgIdsRef.current.has(m.id) ? '' : ' onit-msg-in'}`}
              >
                {m.content}
              </div>
            </div>
          )}
          {m.id === cardAnchorId && invoiceCard}
          {m.id === cardAnchorId && invoiceCard && invoiceUsage && invoiceUsage.id === pendingInvoiceRef.current?.id && (
            <p className="mt-2 px-1 text-sm text-on-surface-variant">{invoiceUsage.text}</p>
          )}
        </Fragment>
        ))}

        {pendingChange && (
          // Change guard (Commit A): the parse would rewrite the linked invoice.
          // Ask before touching it — the current card above stays as it was.
          <div className="card border-primary-container/50">
            <p className="text-body-md">
              This would change {formatDocNumber(pendingChange.kind, pendingChange.no)}. Update it, or start a new invoice?
            </p>
            <button className="btn-primary mt-3 w-full" disabled={phase !== null} onClick={resolvePendingChangeUpdate}>
              Update {formatDocNumber(pendingChange.kind, pendingChange.no)}
            </button>
            <button
              className="mt-1 min-h-touch w-full text-center text-sm text-on-surface-variant underline disabled:opacity-40"
              disabled={phase !== null}
              onClick={resolvePendingChangeNew}
            >
              Start a new invoice
            </button>
          </div>
        )}

        {expenseDraft && (
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

        {reminderPrompt?.kind === 'ask' && (
          <div className="card border-primary-container/50">
            <p className="text-body-md">Want a ping when {reminderPrompt.client} pays?</p>
            <button className="btn-primary mt-3 w-full" onClick={enableReminders}>Yes</button>
            <button className="mt-1 min-h-touch w-full text-center text-sm text-on-surface-variant underline" onClick={dismissReminders}>
              Not now
            </button>
          </div>
        )}
        {reminderPrompt?.kind === 'install' && (
          // iPhone in a Safari tab: web push only exists for a Home Screen
          // install, so point there instead of offering a switch that can't work.
          <div className="card border-primary-container/50">
            <p className="text-body-md">Add On It to your Home Screen to get payment alerts.</p>
            <button className="btn-primary mt-3 w-full" onClick={() => { dismissReminders(); router.push('/install'); }}>
              Show me how
            </button>
            <button className="mt-1 min-h-touch w-full text-center text-sm text-on-surface-variant underline" onClick={dismissReminders}>
              Not now
            </button>
          </div>
        )}

        {phase === 'thinking' && (
          // On It is typing (motion inventory "New On It message"): three dots
          // in an On It bubble, 900ms loop; the reply then rises in its place.
          <div className="flex justify-start onit-msg-in">
            <div role="status" aria-label="On It is thinking"
              className="flex items-center gap-1.5 rounded-[18px] rounded-bl-md border border-outline-variant/50 bg-surface-container px-4 py-3.5">
              <span className="onit-typing-dot" /><span className="onit-typing-dot" /><span className="onit-typing-dot" />
            </div>
          </div>
        )}
        {(phase === 'reading' || (phase === 'preparing' && receipt)) && (
          <div className="flex items-center gap-2 px-2 text-body-lg italic text-on-surface-variant/70">
            {/* The spinner inherits this row's text color (MOTION-SPEC §2). */}
            <OnItSpinner size={20} />
            Reading your receipt…
          </div>
        )}
      </div>

      {/* The composer (UI redesign, release frames 1a): a small "+" on the
          left, the "Message On It…" field with gallery + camera inside it, and
          send on the right. It sits ABOVE the bottom nav, which carries the
          safe-area inset, so no bottom padding here. */}
      <div className={`border-t border-outline-variant/40 bg-background px-3 py-2.5${plusMenu ? ' relative z-[46]' : ''}`}>
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

        <div className="flex items-end gap-2">
          <div className="relative shrink-0">
            {plusMenu && <ComposerMenu closing={plusMenu === 'closing'} onPick={pickFromPlus} onClose={closePlusMenu} />}
            {/* One button, two jobs: outside a voice session it's the "+" that
                opens Voice · New invoice · New quote; during a session it's the
                ink × that ends it. The splash's rings fly onto it on a cold
                start (components/Splash.tsx measures it at runtime). */}
            <button
              aria-label={voiceSession ? 'End voice session' : plusMenu === 'open' ? 'Close' : 'Start something: voice, new invoice or new quote'}
              aria-haspopup={voiceSession ? undefined : 'menu'}
              aria-expanded={voiceSession ? undefined : plusMenu === 'open'}
              data-splash-target=""
              className={`onit-plus-btn relative z-[46] grid h-11 w-11 place-items-center rounded-full active:scale-90 disabled:opacity-40
                ${voiceSession || plusMenu === 'open' ? 'bg-inverse-surface text-inverse-on-surface' : 'bg-primary-soft text-on-background'}`}
              disabled={!voiceSession && phase !== null}
              onClick={voiceSession ? endVoiceSession : plusTap}
            >
              <span className={`onit-plus grid place-items-center${voiceSession || plusMenu === 'open' ? ' is-open' : ''}`}>
                <Icon name="add" size={28} />
              </span>
            </button>
          </div>

          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-0.5 rounded-full border border-outline-variant bg-surface-container-lowest py-1 pl-4 pr-1">
            {voiceSession ? (
              // The voice session lives in the field: a live level dot and
              // "Listening…" with Done (stop → transcribe → send) while
              // recording, and Speak to take the next turn between takes.
              // Both call today's micTap() inside the tap.
              <>
                <span className="relative grid h-3 w-3 shrink-0 place-items-center">
                  <MicRings stream={streamRef.current} active={recording} tone="232, 85, 60" />
                  <span className={`relative h-2 w-2 rounded-full ${recording ? 'bg-[#c8452c]' : 'bg-outline'}`} />
                </span>
                <span className="min-w-0 flex-1 truncate pl-2 text-body-md font-medium text-on-surface-variant" aria-live="polite">
                  {recording ? 'Listening…' : phase !== null ? 'On It is on it…' : 'Tap Speak to keep going'}
                </span>
                <button
                  aria-label={recording ? 'Stop and send' : 'Speak'}
                  className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-sm font-semibold active:scale-95 disabled:opacity-40
                    ${recording ? 'bg-inverse-surface text-inverse-on-surface' : 'bg-primary-container text-on-background'}`}
                  disabled={!recording && phase !== null}
                  onClick={micTap}
                >
                  {recording ? 'Done' : <><Icon name="mic" size={18} filled /> Speak</>}
                </button>
              </>
            ) : (
              <>
                <textarea
                  ref={inputRef}
                  aria-label="Message On It"
                  className="max-h-32 min-w-0 flex-1 resize-none border-0 bg-transparent py-1.5 text-[16px] leading-snug text-on-background outline-none placeholder:text-on-surface-variant/60"
                  placeholder="Message On It…"
                  value={input}
                  rows={1}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!phase) void send(input); }
                  }}
                />
                <button
                  aria-label="Upload receipt from gallery"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-on-surface-variant transition active:scale-90 disabled:opacity-40"
                  disabled={phase !== null}
                  onClick={() => galleryRef.current?.click()}
                >
                  <Icon name="image" size={22} />
                </button>
                <button
                  aria-label="Take a receipt photo"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-on-background transition active:scale-90 disabled:opacity-40"
                  disabled={phase !== null}
                  onClick={() => cameraRef.current?.click()}
                >
                  <Icon name="photo_camera" size={20} />
                </button>
              </>
            )}
          </div>

          <button
            aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-inverse-surface text-inverse-on-surface transition-colors active:scale-90
              disabled:bg-surface-container-highest disabled:text-on-surface-variant/50"
            disabled={voiceSession || !input.trim() || phase !== null}
            onClick={() => void send(input)}
          >
            <Icon name="arrow_upward" size={24} />
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-end bg-on-background/40" onClick={() => setShowHistory(false)}>
          <div
            className="max-h-[70dvh] w-full max-w-lg mx-auto overflow-y-auto rounded-t-card bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] onit-sheet-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 font-display text-lg font-bold">Recent conversations</h2>
            {history.length === 0 && (
              <p className="py-8 text-center text-sm text-on-surface-variant">Nothing here yet — your last 5 conversations will show up.</p>
            )}
            <div className="space-y-2">
              {history.map((h) => (
                <button key={h.id} className="card flex w-full items-center justify-between gap-3 text-left"
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

      {paywallFor && <PaywallModal variant={paywallFor} onClose={() => setPaywallFor(null)} />}
    </div>
  );
}
