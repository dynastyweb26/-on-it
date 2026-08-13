'use client';
/* ═══ The core loop ═══
   Speak or type a job → "On it!" → follow-up questions →
   invoice preview card → PDF → native share sheet → follow-up engine.
   Works for guests (5 free parses), saves for signed-in users.
   Text mode is silent. Tapping the mic opens full-screen voice mode.  */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { buildTheme, BrandTheme } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey, InvoiceRenderData } from '@/lib/pdf/templates';
import { elementToPdf, invoiceFilename, shareInvoice } from '@/lib/pdf/generate';
import { getPushSubscription, subscribeToPush } from '@/lib/push';
import { defaultDueDate } from '@/lib/dates';
import PaywallModal from '@/components/PaywallModal';
import { speak, primeSpeech } from '@/lib/tts';
import { prepareReceipt, ReceiptError, type PreparedReceipt } from '@/lib/receipt';
import ExpenseCard from '@/components/ExpenseCard';
import { CATEGORY_LABEL, isExpenseCategory, type ExpenseDraft } from '@/lib/expenses';
import type { ExtractResult, LineItem } from '@/lib/ai';

interface Msg { role: 'user' | 'assistant'; content: string; source?: 'voice' | 'typed'; }
interface SendResult { reply: string; ready: boolean; }
interface Profile {
  id: string; business_name: string; logo_url: string | null; website_url: string | null;
  slogan: string | null; brand_colors: string[]; background_color: string | null;
  invoice_template: TemplateKey; paypal_me: string | null; cashapp_tag: string | null;
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const today = () => new Date().toISOString().slice(0, 10);

// Mobile browsers suspend/kill background tabs constantly — persist the
// conversation per-browser so switching apps never loses a draft. The same
// storage layer feeds the "recent conversations" history (last 5).
const CHAT_STORE_KEY = 'onit_chat_current';
const HISTORY_KEY = 'onit_chat_history';
const HISTORY_MAX = 5;
// Bump when StoredChat's shape changes so an entry written by an older build is
// discarded on load instead of rehydrated into a broken draft. (v1 was the
// original unversioned shape — any entry whose version doesn't match is dropped.)
const STORE_VERSION = 2;
// An in-progress invoice older than this is stale — don't resurrect a job the
// user started a day ago and forgot about. updatedAt is refreshed on every write.
const STORE_TTL_MS = 24 * 60 * 60 * 1000;
const GREETING: Msg = { role: 'assistant', content: "Hey! Tell me about the job — who it's for and what you did. I'll handle the invoice." };

const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// A create-invoice the user was asked to confirm (duplicate detected). Lives in
// the SAME conversation store as messages/draft (Batch 1 #1) — not a parallel
// state layer — so an affirmative next turn resolves it instead of re-parsing
// the original intent and re-detecting the duplicate in a loop.
interface PendingAction {
  type: 'create_invoice';
  client: string | null;
  amount: number;
  forceCreate: true;
}

// A "bare" affirmative: the WHOLE message is a confirmation (allowlist) with
// only light politeness/punctuation — nothing else. A message that merely
// starts with "yes" but carries more ("yes but make it $300") is NOT bare and
// must never finalize the stale draft.
const AFFIRMATIVE_WORDS = /^(?:y|ya|yes|yeah|yep|yup|sure|ok|okay|k|do it|go ahead|go for it|create it|send it|make it|another|another one|new one|correct|confirm|confirmed|absolutely|definitely|please|please do|yes please)[\s!.,]*$/i;

// Any invoice signal disqualifies an affirmative: a digit (dollar amount or
// quantity), or an edit word. A NEW CLIENT NAME is already excluded because it
// would break the whole-message "bare" match above.
const INVOICE_SIGNAL = /\d|\b(?:but|instead|change|actually|wait)\b/i;

const NEGATIVE = /^\s*(n|no|nope|nah|don'?t|do not|cancel|stop|never ?mind|leave it|forget it|skip|not now)\b/i;

// Affirmative requires BOTH: (1) a bare affirmative from the allowlist, AND
// (2) no invoice signal. Otherwise it is NOT affirmative.
const isAffirmative = (t: string) => {
  const s = t.trim();
  return AFFIRMATIVE_WORDS.test(s) && !INVOICE_SIGNAL.test(s);
};
const isNegative = (t: string) => NEGATIVE.test(t.trim());

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
  pending?: PendingAction | null;
  // The invoice row already inserted this session but not yet marked sent (id +
  // number). Persisted so a send that resumes after a suspend/reload reuses this
  // row instead of inserting a second one with a fresh number.
  pendingInvoice?: { id: string; no: number } | null;
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
}

function loadStoredChat(): StoredChat | null {
  try {
    const raw = localStorage.getItem(CHAT_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredChat;
    // Written by an older build — discard rather than rehydrate a draft whose
    // fields may no longer line up with the current shape.
    if (parsed.version !== STORE_VERSION) return null;
    // Stale — a job left untouched past the TTL isn't "current" anymore.
    if (typeof parsed.updatedAt !== 'number' || Date.now() - parsed.updatedAt > STORE_TTL_MS) return null;
    if (!Array.isArray(parsed.messages) || parsed.messages.length < 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function pushHistory(entry: HistoryEntry) {
  try {
    const list = [entry, ...loadHistory().filter((e) => e.id !== entry.id)].slice(0, HISTORY_MAX);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch { /* storage full — history is a nicety */ }
}

function convoTitle(messages: Msg[], draft: Partial<ExtractResult> | null): string {
  if (draft?.client_name) return draft.client_name;
  const firstUser = messages.find((m) => m.role === 'user');
  return firstUser ? firstUser.content.slice(0, 40) : 'Conversation';
}

export default function Chat() {
  const supabase = createClient();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<ExtractResult> | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Distinguishes "profile fetch still in flight" from "genuinely no profile
  // (a guest)". finalize() must not bounce an authed user to login just because
  // the fetch hasn't resolved yet (audit B2); only a true guest sees the
  // sign-in prompt (audit A3).
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [finished, setFinished] = useState(false); // invoice sent — stop persisting this convo
  const [reminderPrompt, setReminderPrompt] = useState(false); // one-time, after first sent invoice
  const [convoId, setConvoId] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null); // awaiting duplicate confirmation
  // Push-to-talk voice session: mic toggles a session (X ends it). Reply speech
  // now follows per-message input modality (voice vs typed), not session state.
  const [voiceSession, setVoiceSession] = useState(false);
  const [recording, setRecording] = useState(false);
  // Receipt capture: the compressed image waits here between "picked" and
  // "parsed", so the user can back out before anything is uploaded or read.
  const [receipt, setReceipt] = useState<PreparedReceipt | null>(null);
  const [preparing, setPreparing] = useState(false);
  // Two receipt inputs sharing one handler: the camera input carries
  // `capture="environment"` so it opens the rear camera directly on mobile
  // (Android/Brave was ignoring the choice and going straight to the gallery);
  // the gallery input omits `capture` so an existing photo can still be picked.
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  // The parsed expense awaiting confirmation. Never auto-saved — the user
  // always sees the four fields and presses save.
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  // TODO: sessionRef unused — per-message `source` replaced the speak gate.
  // Left in place intentionally; remove in a dedicated cleanup.
  const sessionRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recAbortRef = useRef(false);           // X pressed mid-record → drop the take
  const cancelSpeechRef = useRef<(() => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  // A draft invoice row already inserted this session but not yet marked sent
  // (share pending / cancelled). A retry reuses it instead of inserting a
  // second row (audit B1). Cleared whenever the draft content changes (a fresh
  // parse) so we never mark a stale row sent. Now persisted into the chat store
  // and restored on mount, so a send that resumes after a suspend/reload reuses
  // the same row instead of creating a duplicate with a new number.
  const pendingInvoiceRef = useRef<{ id: string; no: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setProfileLoaded(true); return; } // resolved: genuine guest
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (!data) { router.push('/onboarding'); return; }
      setProfile(data as Profile);
      setProfileLoaded(true);
    })();
    // register service worker for the 2-day follow-up notifications
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    // restore an in-progress conversation (mobile tab suspends wipe React state)
    const stored = loadStoredChat();
    if (stored) {
      setMessages(stored.messages);
      setDraft(stored.draft);
      setReady(Boolean(stored.ready));
      setPending(stored.pending ?? null);
      // Reuse an invoice row inserted before the suspend instead of starting a
      // new one on the next send (prevents a duplicate with a fresh number).
      pendingInvoiceRef.current = stored.pendingInvoice ?? null;
    }
    setConvoId(stored?.id ?? genId());
    setHydrated(true);
    // header history icon lives in the shared layout — it signals us here
    const openHistory = () => {
      setHistory(loadHistory());
      setShowHistory(true);
    };
    window.addEventListener('onit-history', openHistory);
    return () => window.removeEventListener('onit-history', openHistory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist on every change so nothing is lost when the browser suspends us
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (finished || messages.length < 2) {
        localStorage.removeItem(CHAT_STORE_KEY);
      } else {
        // Twin of the explicit write in finalize() after the row is inserted —
        // keep the two payloads in sync. pendingInvoiceRef is a ref (no effect
        // fires on its change), so it rides along on the next state-driven write.
        const payload: StoredChat = {
          version: STORE_VERSION,
          id: convoId, messages, draft, ready, pending,
          pendingInvoice: pendingInvoiceRef.current,
          updatedAt: Date.now(),
        };
        localStorage.setItem(CHAT_STORE_KEY, JSON.stringify(payload));
      }
    } catch { /* storage full or blocked — nothing to do */ }
  }, [messages, draft, ready, pending, hydrated, finished, convoId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, ready]);

  /** Shared parse flow for typed and spoken input. The reply always renders as
   *  text first; it is spoken (TTS) only when THIS message was entered by voice
   *  — per-message modality, so typed messages stay silent. */
  async function send(text: string, source: 'voice' | 'typed' = 'typed'): Promise<SendResult | null> {
    const trimmed = text.trim();
    if (!trimmed || busy) return null;
    const next: Msg[] = [...messages, { role: 'user', content: trimmed, source }];
    setMessages(next);
    setInput('');
    setFinished(false); // a new message means a live conversation again

    // Duplicate-confirmation resolution: if we're awaiting a yes/no, DON'T
    // re-parse (that re-detects the duplicate and loops). Affirmative → create
    // anyway via finalize() (which runs no duplicate check); negative → drop it;
    // anything else → clear the pending action and parse the message fresh.
    if (pending) {
      if (isAffirmative(trimmed)) {
        setPending(null);
        setBusy(true);
        try { await finalize(); } // bypasses duplicate detection by design
        finally { setBusy(false); }
        return null;
      }
      if (isNegative(trimmed)) {
        setPending(null);
        setMessages((m) => [...m, {
          role: 'assistant',
          content: "Okay — no duplicate made. Tell me what you'd like to change and I'll sort it out.",
        }]);
        return null;
      }
      setPending(null); // ambiguous reply — fall through to a fresh parse
    }

    setBusy(true);
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ history: next.slice(1), draft }),
      });
      const data = await res.json();
      if (res.status === 401 && data.authRequired) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
        setTimeout(() => router.push('/login'), 1600);
        return null;
      }
      const reply: string = data.duplicateWarning ?? data.reply ?? 'Say that again?';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
      // Text renders first (above); speech is additive and follows the input
      // modality of THIS message — voice in, voice out; typed in, silent.
      if (source === 'voice') {
        cancelSpeechRef.current?.();
        cancelSpeechRef.current = speak(reply);
      }
      const isReady = Boolean(data.ready) && !data.duplicateWarning && data.intent !== 'expense';
      if (data.intent) {
        setDraft(data);
        // Draft content may have changed — any previously inserted-but-unsent
        // row is now stale; force the next finalize to insert a fresh one (B1).
        pendingInvoiceRef.current = null;
      }
      setReady(isReady);

      // A duplicate was flagged — remember the pending create so the next
      // affirmative resolves it instead of re-parsing into the same warning.
      if (data.duplicateWarning) {
        const amount = Array.isArray(data.line_items)
          ? (data.line_items as LineItem[]).reduce((s, li) => s + li.qty * li.unit_price, 0)
          : 0;
        setPending({ type: 'create_invoice', client: data.client_name ?? null, amount, forceCreate: true });
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
      setMessages((m) => [...m, { role: 'assistant', content: 'Connection hiccup — try that again.' }]);
      return null;
    } finally {
      setBusy(false);
    }
  }

  // ── Finalize: save → render → PDF → share sheet ─────────────
  const theme: BrandTheme | null =
    profile?.background_color && profile.brand_colors.length >= 2
      ? buildTheme(profile.brand_colors, profile.background_color)
      : { background: '#FFFFFF', text: '#000000', primary: '#1A1A1A', accent: '#D4A017' };

  function buildRenderData(invoiceNumber: number): InvoiceRenderData | null {
    if (!draft || !profile) return null;
    const items = (draft.line_items ?? []) as LineItem[];
    const subtotal = items.reduce((s, li) => s + li.qty * li.unit_price, 0);
    const taxRate = draft.tax_rate ?? 0;
    const taxAmount = Math.round(subtotal * taxRate) / 100;
    return {
      kind: (draft.intent === 'quote' ? 'quote' : 'invoice'),
      invoiceNumber,
      businessName: profile.business_name,
      logoUrl: profile.logo_url,
      websiteUrl: profile.website_url,
      slogan: profile.slogan,
      clientName: draft.client_name ?? 'Client',
      lineItems: items,
      subtotal, taxRate, taxAmount,
      total: subtotal + taxAmount,
      notes: draft.notes ?? null,
      issuedDate: new Date().toLocaleDateString(),
      // No stated due date → default to issue date + 30 days. The AI never
      // asks for one; the user can still edit it on the invoice detail page.
      dueDate: draft.due_date ?? defaultDueDate(),
      cashappTag: profile.cashapp_tag,
      paypalMe: profile.paypal_me,
    };
  }

  const [renderData, setRenderData] = useState<InvoiceRenderData | null>(null);
  const [showPaywall, setShowPaywall] = useState(false); // free-tier cap hit

  async function finalize() {
    if (!draft) return;

    // A3 / B2: no profile in hand — decide WHY before doing anything.
    //  - fetch still in flight → don't bounce an authed user to login over a
    //    timing window; ask them to tap again in a moment.
    //  - fetch resolved with no profile → a genuine guest: friendly sign-in
    //    nudge (mirrors the parse route's 401 copy), THEN route to login.
    if (!profile) {
      if (!profileLoaded) {
        setMessages((m) => [...m, { role: 'assistant', content: 'One sec — still loading your business info. Tap send again in a moment.' }]);
        return;
      }
      setMessages((m) => [...m, { role: 'assistant', content: "Let's save your work — sign in to send this invoice." }]);
      setTimeout(() => router.push('/login'), 1600);
      return;
    }

    // Paywall gate — only for a brand-new invoice. A retry of an already-created
    // draft (pendingInvoiceRef set, e.g. after a cancelled share) is exempt, so
    // we never block an invoice the user already made and is entitled to finish.
    // hasAccess() encodes the rules: founder/trialing/active/past_due pass;
    // free passes under the cap; free at/over cap and canceled are gated. The
    // server-side trigger enforces the same rules even if this gate is bypassed.
    // Fail OPEN if /api/access is unreachable — a transient blip must not block
    // a legitimate invoice (matches the rate-limiter's fail-open stance).
    if (!pendingInvoiceRef.current) {
      try {
        const gate = await (await fetch('/api/access')).json();
        if (gate && gate.hasAccess === false) {
          setShowPaywall(true);
          return;
        }
      } catch { /* access check unreachable — fail open, allow the invoice */ }
    }

    setFinalizing(true);
    try {
      // ── 1. Persist the invoice as a DRAFT (not "sent" until it actually is).
      //    A retry after a cancel/failure reuses the stashed row rather than
      //    inserting a second one (B1). buildRenderData reuses the stashed
      //    number so the retried PDF keeps the same invoice number.
      let invoiceId = pendingInvoiceRef.current?.id ?? null;
      let no = pendingInvoiceRef.current?.no ?? null;

      if (!invoiceId) {
        const { data: allocNo, error: noErr } = await supabase.rpc('next_invoice_no', { p_user: profile.id });
        if (noErr || allocNo == null) throw noErr ?? new Error('no invoice number');
        const newNo = allocNo as number;
        no = newNo;

        const rd0 = buildRenderData(newNo);
        if (!rd0) throw new Error('incomplete');

        const { data: client } = await supabase
          .from('clients')
          .upsert({ user_id: profile.id, name: rd0.clientName }, { onConflict: 'user_id,name' })
          .select('id').single();

        // A1: HANDLE the insert result. If it fails, stop here — no PDF, no
        // share, no "Sent!". Keep draft + ready so the user can retry.
        const { data: saved, error: insErr } = await supabase.from('invoices').insert({
          user_id: profile.id,
          client_id: client?.id ?? null,
          kind: rd0.kind,
          invoice_number: newNo,
          client_name: rd0.clientName,
          line_items: rd0.lineItems,
          subtotal: rd0.subtotal,
          tax_rate: rd0.taxRate,
          tax_amount: rd0.taxAmount,
          total: rd0.total,
          notes: rd0.notes,
          due_date: rd0.dueDate,
          status: 'draft', // becomes 'sent' only after a real share (B1)
        }).select('id').single();

        if (insErr || !saved?.id) {
          // Server-side cap (enforce_free_invoice_limit trigger). The /api/access
          // gate above normally catches this first, but the trigger is the real
          // boundary and fires even if the gate failed open or was bypassed —
          // surface the paywall, never a generic error.
          if (insErr?.hint === 'PAYWALL_LIMIT') {
            setShowPaywall(true);
            return; // draft + ready untouched — upgrade, then tap send again
          }
          console.error('invoice insert failed', insErr);
          setMessages((m) => [...m, { role: 'assistant', content: "Couldn't save that invoice just now — tap send to try again. Your draft is safe." }]);
          return; // finally clears finalizing; draft + ready untouched
        }
        const newId = saved.id as string;
        invoiceId = newId;
        pendingInvoiceRef.current = { id: newId, no: newNo };
        // The row exists but isn't marked sent yet, and setting a ref fires no
        // persist effect. Write now so a suspend while the share sheet is open
        // doesn't lose it and cause a duplicate row on the resumed send. Twin of
        // the payload built in the persist effect above — keep them in sync.
        try {
          const payload: StoredChat = {
            version: STORE_VERSION,
            id: convoId, messages, draft, ready, pending,
            pendingInvoice: pendingInvoiceRef.current,
            updatedAt: Date.now(),
          };
          localStorage.setItem(CHAT_STORE_KEY, JSON.stringify(payload));
        } catch { /* storage blocked — the effect retries on the next change */ }
      }

      // Invariant after step 1: the row exists. Narrows the nullable locals for
      // the update/archive below (both are set on the insert and the reuse path).
      if (!invoiceId || no == null) throw new Error('invoice not persisted');

      // ── 2. Build render data (reuse the stashed number on a retry).
      const rd = buildRenderData(no);
      if (!rd) throw new Error('incomplete');

      // Zelle is encrypted at rest — the server route is the only reader
      try {
        const z = await (await fetch('/api/zelle?full=1')).json();
        if (z?.value) rd.zelle = z.value;
      } catch { /* invoice simply prints without Zelle */ }

      // ── 3. Render offscreen → PDF.
      setRenderData(rd);
      await new Promise((r) => setTimeout(r, 350)); // let the template paint
      if (!printRef.current) throw new Error('render failed');
      const file = await elementToPdf(
        printRef.current,
        invoiceFilename(no, rd.clientName, profile.business_name)
      );

      // ── 4. Share — only now is anything actually sent.
      const outcome = await shareInvoice(file, rd.clientName);

      // B1: cancelling the share sheet is a normal choice, not an error. The
      // row stays a draft; the stashed id + draft survive so a retry reuses
      // the SAME invoice. No alarming message.
      if (outcome === 'cancelled') {
        setRenderData(null);
        setMessages((m) => [...m, { role: 'assistant', content: 'All set when you are — tap send to share it whenever you’re ready.' }]);
        return;
      }

      // ── 5. Shared/downloaded for real → NOW mark it sent, then archive.
      await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', invoiceId);

      // Archive in the Vault (best-effort — a storage hiccup must not undo the
      // send we just confirmed).
      try {
        const path = `${profile.id}/${file.name}`;
        await supabase.storage.from('vault').upload(path, file, { upsert: true });
        await supabase.from('vault_documents').insert({
          user_id: profile.id,
          title: file.name,
          doc_type: rd.kind,
          storage_path: path,
          invoice_id: invoiceId,
        });
      } catch (archiveErr) { console.error('vault archive failed', archiveErr); }

      const done = outcome === 'shared'
        ? `Sent! I'll nudge you if ${rd.clientName} hasn't paid in 2 days.`
        : `Downloaded! Send it to ${rd.clientName} however you like. I'll keep an eye on it.`;
      const doneMsg: Msg = { role: 'assistant', content: done };
      setMessages((m) => [...m, doneMsg]);
      // archive the completed conversation, then start a fresh one
      pushHistory({
        id: convoId || genId(),
        title: convoTitle(messages, draft),
        date: Date.now(),
        finalized: true,
        messages: [...messages, doneMsg],
        draft: null,
        ready: false,
      });
      pendingInvoiceRef.current = null; // this invoice is complete
      setConvoId(genId());
      setDraft(null);
      setReady(false);
      setRenderData(null);
      setFinished(true); // clears the persisted conversation
      try { localStorage.removeItem(CHAT_STORE_KEY); } catch { /* ignore */ }

      // The right moment to ask about reminders: right after the FIRST
      // invoice goes out. One-time; skipped if already subscribed.
      if (rd.kind === 'invoice') void maybeOfferReminders();
    } catch (e) {
      console.error(e);
      // A row may already exist as a draft (stashed) — the retry reuses it, so
      // the draft is genuinely safe and no duplicate is created.
      setMessages((m) => [...m, { role: 'assistant', content: "Couldn't finish that one. Your draft is safe — tap send to try again." }]);
    } finally {
      setFinalizing(false);
    }
  }

  async function maybeOfferReminders() {
    if (!profile) return;
    try {
      if (localStorage.getItem('onit_reminder_prompted')) return;
      const { count } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('kind', 'invoice');
      if (count !== 1) return; // only the very first invoice
      if (await getPushSubscription()) return; // already on
      setReminderPrompt(true);
    } catch { /* never block the send flow */ }
  }

  async function enableReminders() {
    if (!profile) return;
    setReminderPrompt(false);
    try { localStorage.setItem('onit_reminder_prompted', '1'); } catch { /* ignore */ }
    const ok = await subscribeToPush(supabase, profile.id);
    setMessages((m) => [...m, {
      role: 'assistant',
      content: ok
        ? "You're set. If an invoice sits unpaid for 2 days, I'll give you a nudge."
        : "Couldn't turn that on — you can enable reminders any time in Settings.",
    }]);
  }

  function dismissReminders() {
    setReminderPrompt(false);
    try { localStorage.setItem('onit_reminder_prompted', '1'); } catch { /* ignore */ }
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

    discardExpense();
    setPreparing(true);
    let prepared: PreparedReceipt;
    try {
      prepared = await prepareReceipt(file);
      setReceipt(prepared);
    } catch (err) {
      // ReceiptError messages are written for the user; anything else isn't.
      setMessages((m) => [...m, {
        role: 'assistant',
        content: err instanceof ReceiptError
          ? err.message
          : "Couldn't read that photo — try taking it again.",
      }]);
      return;
    } finally {
      setPreparing(false);
    }

    // Dedup BEFORE the vision call, not just before the insert: re-reading a
    // receipt we already have costs vision tokens to arrive at a row we're
    // going to refuse anyway.
    const already = await findDuplicate(prepared.hash);
    if (already) {
      setReceipt(null);
      setMessages((m) => [...m, { role: 'assistant', content: duplicateMessage(already) }]);
      return;
    }

    // Straight into the read — no second tap. The user's intent was complete
    // the moment they chose the photo.
    await readReceipt(prepared);
  }

  /** An existing expense for this user with the same receipt image, if any. */
  async function findDuplicate(hash: string): Promise<ExistingReceipt | null> {
    if (!profile) return null;
    const { data, error } = await supabase
      .from('expenses')
      .select('id, amount, vendor, spent_on')
      .eq('user_id', profile.id)
      .eq('receipt_hash', hash)
      .maybeSingle();
    // A failed lookup must not block a legitimate save — the unique index is
    // the real guarantee, and saveExpense() handles the violation it raises.
    if (error) { console.error('dedup lookup failed', error); return null; }
    return (data as ExistingReceipt) ?? null;
  }

  async function readReceipt(prepared: PreparedReceipt) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append('image', prepared.blob, 'receipt.jpg');
      const res = await fetch('/api/parse-receipt', { method: 'POST', body });
      const data = await res.json();

      if (res.status === 401 && data.authRequired) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
        setReceipt(null);
        setTimeout(() => router.push('/login'), 1600);
        return;
      }
      if (!res.ok) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply ?? "Couldn't read that one." }]);
        setReceipt(null);
        return;
      }

      // A receipt we couldn't get an amount off is not a saveable expense —
      // say so plainly rather than opening a card full of blanks.
      if (typeof data.amount !== 'number' || data.amount <= 0) {
        setMessages((m) => [...m, {
          role: 'assistant',
          content: "I couldn't make out the total on that one. Tell me the amount and I'll log it.",
        }]);
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
      });
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Connection hiccup — try that photo again.' }]);
      setReceipt(null);
    } finally {
      setBusy(false);
    }
  }

  // ── Saving an expense ───────────────────────────────────────
  async function saveExpense() {
    if (!expenseDraft) return;
    if (!profile) {
      if (!profileLoaded) {
        setExpenseError('One sec — still loading your account. Tap save again in a moment.');
        return;
      }
      setMessages((m) => [...m, { role: 'assistant', content: "Let's save your work — sign in to keep this expense." }]);
      setTimeout(() => router.push('/login'), 1600);
      return;
    }

    setSavingExpense(true);
    setExpenseError(null);
    try {
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
          setExpenseError("Couldn't save the photo just now — tap save to try again.");
          return;
        }
      }

      const { error: insErr } = await supabase.from('expenses').insert({
        user_id: profile.id,
        amount: expenseDraft.amount,
        category: expenseDraft.category,
        vendor: expenseDraft.vendor,
        spent_on: expenseDraft.occurred_on ?? today(),
        receipt_url: receiptPath,
        receipt_hash: receipt?.hash ?? null,
      });
      if (insErr) {
        // 23505 = the (user_id, receipt_hash) unique index. Reachable despite
        // the pre-check if the same receipt was saved on another device while
        // this card sat open. Say what happened — never a raw constraint error.
        if (insErr.code === '23505') {
          const existing = receipt ? await findDuplicate(receipt.hash) : null;
          discardExpense();
          setMessages((m) => [...m, {
            role: 'assistant',
            content: existing
              ? duplicateMessage(existing)
              : "You've already logged this receipt — I didn't add it twice.",
          }]);
          return;
        }
        console.error('expense insert failed', insErr);
        setExpenseError("Couldn't save that expense — tap save to try again.");
        return;
      }

      const where = expenseDraft.vendor ? ` at ${expenseDraft.vendor}` : '';
      const saved = `Got it — ${money(expenseDraft.amount)}${where}, filed under ${CATEGORY_LABEL[expenseDraft.category].toLowerCase()}.`;
      setMessages((m) => [...m, { role: 'assistant', content: saved }]);
      discardExpense();
    } finally {
      setSavingExpense(false);
    }
  }

  /** Drop the in-flight expense and its photo. Used by cancel, and before a
   *  new pick so two receipts can never share one card. */
  function discardExpense() {
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
        setBusy(true);
        let text = '';
        let data: { text?: string; authRequired?: boolean; message?: string } = {};
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: blob });
          data = await res.json();
          text = (data.text ?? '').trim();
        } catch { /* treated as "didn't catch that" */ }
        setBusy(false);
        // Guest voice budget spent (per-browser or global daily cap) — show the
        // signup prompt and route to login, same as /api/parse's authRequired.
        if (data.authRequired) {
          setMessages((m) => [...m, { role: 'assistant', content: data.message ?? "Create your free account to keep going." }]);
          setTimeout(() => router.push('/login'), 1600);
          return;
        }
        // Voice auto-sends immediately as a 'voice' message — no cancel window,
        // no send tap. One final transcript per take (record-then-POST), so this
        // fires exactly once. The reply is spoken because the source is 'voice'.
        if (text) void send(text, 'voice');
        else setMessages((m) => [...m, { role: 'assistant', content: "Didn't catch that — try again or type it." }]);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      // mic blocked/denied → end the session and fall back to typing (no hang)
      setVoiceSession(false); sessionRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setMessages((m) => [...m, { role: 'assistant', content: 'Mic access is blocked. You can type instead.' }]);
    }
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

  // Cancel any speech / capture if the screen unmounts (tab switch suspension
  // is the browser's job — we never auto-resume on return).
  useEffect(() => () => {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  function openHistoryEntry(entry: HistoryEntry) {
    // an unfinished live conversation gets archived before we switch away
    if (!finished && messages.length >= 2 && convoId && convoId !== entry.id) {
      pushHistory({
        id: convoId,
        title: convoTitle(messages, draft),
        date: Date.now(),
        finalized: false,
        messages,
        draft,
        ready,
      });
    }
    setMessages(entry.messages);
    setDraft(entry.draft);
    setReady(Boolean(entry.ready) && !entry.finalized);
    setPending(null); // confirmation state doesn't carry across conversations
    setFinished(entry.finalized); // finalized ones stay read-only until a new message
    setConvoId(entry.id);
    setShowHistory(false);
  }

  const previewItems = (draft?.line_items ?? []) as LineItem[];
  const previewTotal = previewItems.reduce((s, li) => s + li.qty * li.unit_price, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[82%] whitespace-pre-wrap rounded-card px-4 py-3 text-body-md
                ${m.role === 'user'
                  ? 'rounded-br-md bg-primary-container text-on-primary-container'
                  : 'rounded-bl-md bg-surface-container-lowest border border-outline-variant/30'}`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {ready && draft && (
          <div className="card border-primary-container/50 ring-1 ring-primary-container/30">
            <div className="mb-3 flex items-center gap-2 text-label-lg font-semibold uppercase tracking-wide text-primary">
              <Icon name="description" size={18} />
              {draft.intent === 'quote' ? 'Quote' : 'Invoice'} for {draft.client_name}
            </div>
            {previewItems.map((li, i) => (
              <div key={i} className="flex items-center justify-between py-1 text-body-md">
                <span>{li.description}{li.qty > 1 ? ` ×${li.qty}` : ''}</span>
                <span className="font-display font-bold">{money(li.qty * li.unit_price)}</span>
              </div>
            ))}
            <div className="mt-2 flex items-end justify-between border-t border-outline-variant pt-3">
              <span className="pb-2 text-label-lg font-semibold uppercase text-on-surface-variant">Total</span>
              <span className="font-display text-numeric-xl tracking-tight text-on-background">{money(previewTotal)}</span>
            </div>
            <button className="btn-primary mt-3 w-full" disabled={finalizing} onClick={finalize}>
              <Icon name="attach_file" size={18} />
              {finalizing ? 'Building your PDF…' : 'Looks right — send it'}
            </button>
            <button className="mt-1 min-h-touch w-full text-center text-sm text-on-surface-variant underline"
              onClick={() => send('Actually, let me change something')}>
              Change something
            </button>
          </div>
        )}

        {expenseDraft && (
          <ExpenseCard
            draft={expenseDraft}
            onChange={setExpenseDraft}
            onSave={saveExpense}
            onCancel={() => {
              discardExpense();
              setMessages((m) => [...m, {
                role: 'assistant',
                content: "No problem — tell me what it should say, or send another photo.",
              }]);
            }}
            saving={savingExpense}
            previewUrl={receipt?.previewUrl ?? null}
            error={expenseError}
          />
        )}

        {reminderPrompt && (
          <div className="card border-primary-container/50">
            <p className="text-body-md">Want me to remind you if they haven&apos;t paid in 2 days?</p>
            <button className="btn-primary mt-3 w-full" onClick={enableReminders}>Enable reminders</button>
            <button className="mt-1 min-h-touch w-full text-center text-sm text-on-surface-variant underline" onClick={dismissReminders}>
              Not now
            </button>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-2 px-2 text-body-lg italic text-on-surface-variant/70">
            <Icon name={receipt && !expenseDraft ? 'receipt_long' : 'graphic_eq'} size={20} className="text-primary" />
            {receipt && !expenseDraft ? 'Reading your receipt…' : 'On It is thinking…'}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-outline-variant/40 bg-background px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {recording && (
          // Static "Listening" label doubles as the reduced-motion fallback
          // for the mic pulse (§ voice spec).
          <div className="mb-2 px-2 text-body-lg italic text-on-surface-variant">Listening…</div>
        )}

        {preparing && (
          <div className="mb-2 flex items-center gap-2 px-2 text-body-lg italic text-on-surface-variant">
            <Icon name="photo_camera" size={20} className="text-primary" />
            Getting that photo ready…
          </div>
        )}

        <div className="flex items-end gap-2">
          {voiceSession && (
            <button
              aria-label="End voice session"
              className="grid h-touch w-touch shrink-0 place-items-center rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface-variant transition active:scale-90"
              onClick={endVoiceSession}
            >
              <Icon name="close" size={24} />
            </button>
          )}
          {/* Receipt capture sits beside the mic — hidden mid-voice-session,
              where the row already carries an X + mic + send. Two stacked
              circular buttons keep the leftmost slot one control wide (no
              squeeze on the text field) while giving camera and gallery each
              their own tap target: top = shoot with the rear camera, bottom =
              pick from the gallery. Both fire the same onPickReceipt. */}
          {!voiceSession && (
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                aria-label="Take a receipt photo"
                className="grid h-9 w-9 place-items-center rounded-full border border-outline-variant bg-surface-container-lowest text-primary transition active:scale-90 disabled:opacity-40"
                disabled={preparing || busy}
                onClick={() => cameraRef.current?.click()}
              >
                <Icon name="photo_camera" size={20} />
              </button>
              <button
                aria-label="Upload receipt from gallery"
                className="grid h-9 w-9 place-items-center rounded-full border border-outline-variant bg-surface-container-lowest text-primary transition active:scale-90 disabled:opacity-40"
                disabled={preparing || busy}
                onClick={() => galleryRef.current?.click()}
              >
                <Icon name="photo_library" size={20} />
              </button>
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
          <button
            aria-label={recording ? 'Stop and send' : voiceSession ? 'Speak' : 'Start voice'}
            className={`grid h-fab w-fab shrink-0 place-items-center rounded-full bg-primary-container text-on-background shadow-card-raised transition active:scale-90 ${recording ? 'voice-listening' : ''}`}
            onClick={micTap}
          >
            <Icon name="mic" size={32} filled />
          </button>
          <textarea
            className="input max-h-32 flex-1 resize-none py-3.5"
            placeholder={recording ? 'Listening…' : 'Or type it…'}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); }
            }}
          />
          <button
            aria-label="Send"
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-inverse-surface text-inverse-on-surface active:scale-90 disabled:opacity-30"
            disabled={!input.trim() || busy}
            onClick={() => void send(input)}
          >
            <Icon name="send" size={22} filled />
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-end bg-on-background/40" onClick={() => setShowHistory(false)}>
          <div
            className="max-h-[70dvh] w-full overflow-y-auto rounded-t-card bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
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

      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} />}
    </div>
  );
}
