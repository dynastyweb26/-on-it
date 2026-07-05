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
import VoiceMode, { VoiceSendResult } from '@/components/VoiceMode';
import { getPushSubscription, subscribeToPush } from '@/lib/push';
import type { ExtractResult, LineItem } from '@/lib/ai';

interface Msg { role: 'user' | 'assistant'; content: string; }
interface Profile {
  id: string; business_name: string; logo_url: string | null; website_url: string | null;
  slogan: string | null; brand_colors: string[]; background_color: string | null;
  invoice_template: TemplateKey; paypal_me: string | null; cashapp_tag: string | null;
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// Mobile browsers suspend/kill background tabs constantly — persist the
// conversation per-browser so switching apps never loses a draft. The same
// storage layer feeds the "recent conversations" history (last 5).
const CHAT_STORE_KEY = 'onit_chat_current';
const HISTORY_KEY = 'onit_chat_history';
const HISTORY_MAX = 5;
const GREETING: Msg = { role: 'assistant', content: "Hey! Tell me about the job — who it's for and what you did. I'll handle the invoice." };

const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface StoredChat {
  id?: string;
  messages: Msg[];
  draft: Partial<ExtractResult> | null;
  ready: boolean;
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
  const [finalizing, setFinalizing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [finished, setFinished] = useState(false); // invoice sent — stop persisting this convo
  const [voiceMode, setVoiceMode] = useState(false);
  const [reminderPrompt, setReminderPrompt] = useState(false); // one-time, after first sent invoice
  const [convoId, setConvoId] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (!data) { router.push('/onboarding'); return; }
      setProfile(data as Profile);
    })();
    // register service worker for the 2-day follow-up notifications
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    // restore an in-progress conversation (mobile tab suspends wipe React state)
    const stored = loadStoredChat();
    if (stored) {
      setMessages(stored.messages);
      setDraft(stored.draft);
      setReady(Boolean(stored.ready));
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
        const payload: StoredChat = { id: convoId, messages, draft, ready, updatedAt: Date.now() };
        localStorage.setItem(CHAT_STORE_KEY, JSON.stringify(payload));
      }
    } catch { /* storage full or blocked — nothing to do */ }
  }, [messages, draft, ready, hydrated, finished, convoId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, ready]);

  /** Shared parse flow for text AND voice mode. Returns the reply for
   *  voice mode to speak; null tells voice mode to stop. Text mode never speaks. */
  async function send(text: string): Promise<VoiceSendResult | null> {
    const trimmed = text.trim();
    if (!trimmed || busy) return null;
    const next: Msg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setFinished(false); // a new message means a live conversation again
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
      const isReady = Boolean(data.ready) && !data.duplicateWarning && data.intent !== 'expense';
      if (data.intent) setDraft(data);
      setReady(isReady);

      // Expenses save immediately — no preview card needed
      if (data.intent === 'expense' && data.expense && profile) {
        await supabase.from('expenses').insert({
          user_id: profile.id,
          description: data.expense.description,
          amount: data.expense.amount,
          category: data.expense.category,
          tax_deductible: data.expense.tax_deductible,
        });
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
      dueDate: draft.due_date ?? null,
      cashappTag: profile.cashapp_tag,
      paypalMe: profile.paypal_me,
    };
  }

  const [renderData, setRenderData] = useState<InvoiceRenderData | null>(null);

  async function finalize() {
    if (!profile || !draft) { router.push('/login'); return; }
    setFinalizing(true);
    try {
      const { data: no, error: noErr } = await supabase.rpc('next_invoice_no', { p_user: profile.id });
      if (noErr || no == null) throw noErr;

      const rd = buildRenderData(no);
      if (!rd) throw new Error('incomplete');

      // Zelle is encrypted at rest — the server route is the only reader
      try {
        const z = await (await fetch('/api/zelle?full=1')).json();
        if (z?.value) rd.zelle = z.value;
      } catch { /* invoice simply prints without Zelle */ }

      // Upsert client + save invoice
      const { data: client } = await supabase
        .from('clients')
        .upsert({ user_id: profile.id, name: rd.clientName }, { onConflict: 'user_id,name' })
        .select('id').single();

      const { data: saved } = await supabase.from('invoices').insert({
        user_id: profile.id,
        client_id: client?.id ?? null,
        kind: rd.kind,
        invoice_number: no,
        client_name: rd.clientName,
        line_items: rd.lineItems,
        subtotal: rd.subtotal,
        tax_rate: rd.taxRate,
        tax_amount: rd.taxAmount,
        total: rd.total,
        notes: rd.notes,
        due_date: rd.dueDate,
        status: 'sent',
        sent_at: new Date().toISOString(),
      }).select('id').single();

      // Render offscreen → PDF → share sheet
      setRenderData(rd);
      await new Promise((r) => setTimeout(r, 350)); // let the template paint
      if (!printRef.current) throw new Error('render failed');
      const file = await elementToPdf(
        printRef.current,
        invoiceFilename(no, rd.clientName, profile.business_name)
      );
      const outcome = await shareInvoice(file, rd.clientName);

      // Archive in the Vault
      if (saved?.id) {
        const path = `${profile.id}/${file.name}`;
        await supabase.storage.from('vault').upload(path, file, { upsert: true });
        await supabase.from('vault_documents').insert({
          user_id: profile.id,
          title: file.name,
          doc_type: rd.kind,
          storage_path: path,
          invoice_id: saved.id,
        });
      }

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
      setMessages((m) => [...m, { role: 'assistant', content: "Couldn't finish that one. Your draft is safe — try again." }]);
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
          <div className="card border-gold/60 ring-1 ring-gold/30">
            <div className="mb-2 flex items-center gap-2 font-display font-bold">
              <Icon name="description" size={18} className="text-primary" />
              {draft.intent === 'quote' ? 'Quote' : 'Invoice'} for {draft.client_name}
            </div>
            {previewItems.map((li, i) => (
              <div key={i} className="flex justify-between py-1 text-sm">
                <span>{li.description}{li.qty > 1 ? ` ×${li.qty}` : ''}</span>
                <span className="font-mono">{money(li.qty * li.unit_price)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-line pt-2 font-bold">
              <span>Total</span>
              <span className="font-mono text-gold">{money(previewTotal)}</span>
            </div>
            <button className="btn-primary mt-3 flex w-full items-center justify-center gap-2" disabled={finalizing} onClick={finalize}>
              <Icon name="attach_file" size={18} />
              {finalizing ? 'Building your PDF…' : 'Looks right — send it'}
            </button>
            <button className="mt-2 w-full text-center text-sm text-ink/50 underline"
              onClick={() => send('Actually, let me change something')}>
              Change something
            </button>
          </div>
        )}

        {reminderPrompt && (
          <div className="card border-gold/60">
            <p className="text-[15px]">Want me to remind you if they haven&apos;t paid in 2 days?</p>
            <button className="btn-primary mt-3 w-full" onClick={enableReminders}>Enable reminders</button>
            <button className="mt-2 w-full text-center text-sm text-ink/50 underline" onClick={dismissReminders}>
              Not now
            </button>
          </div>
        )}

        {busy && <div className="px-2 text-sm text-ink/40">On It is thinking…</div>}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-line bg-paper px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          aria-label="Open voice mode"
          className="grid h-fab w-fab shrink-0 place-items-center rounded-full bg-primary-container text-on-background shadow-card-raised transition active:scale-90"
          onClick={() => setVoiceMode(true)}
        >
          <Icon name="mic" size={32} filled />
        </button>
        <textarea
          className="input max-h-32 flex-1 resize-none py-3.5"
          placeholder="Or type it…"
          value={input}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); }
          }}
        />
        <button
          aria-label="Send"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ink text-paper active:scale-90 disabled:opacity-30"
          disabled={!input.trim() || busy}
          onClick={() => void send(input)}
        >
          <Icon name="send" size={22} filled />
        </button>
      </div>

      {voiceMode && (
        <VoiceMode onClose={() => setVoiceMode(false)} sendMessage={send} />
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-end bg-on-background/40" onClick={() => setShowHistory(false)}>
          <div
            className="max-h-[70dvh] w-full overflow-y-auto rounded-t-3xl bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 font-display text-lg font-bold">Recent conversations</h2>
            {history.length === 0 && (
              <p className="py-8 text-center text-sm text-ink/50">Nothing here yet — your last 5 conversations will show up.</p>
            )}
            <div className="space-y-2">
              {history.map((h) => (
                <button key={h.id} className="card flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => openHistoryEntry(h)}>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{h.title}</div>
                    <div className="text-xs text-ink/50">{new Date(h.date).toLocaleDateString()}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase
                    ${h.finalized ? 'bg-green-100 text-green-800' : 'bg-gold/15 text-gold'}`}>
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
    </div>
  );
}
