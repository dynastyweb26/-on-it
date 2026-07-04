'use client';
/* ═══ The core loop ═══
   Speak or type a job → "On it! 🎉" → follow-up questions →
   invoice preview card → PDF → native share sheet → follow-up engine.
   Works for guests (5 free parses), saves for signed-in users.        */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Square, Send, Share2, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { buildTheme, BrandTheme } from '@/lib/colors';
import { InvoiceTemplate, TemplateKey, InvoiceRenderData } from '@/lib/pdf/templates';
import { elementToPdf, invoiceFilename, shareInvoice } from '@/lib/pdf/generate';
import type { ExtractResult, LineItem } from '@/lib/ai';

interface Msg { role: 'user' | 'assistant'; content: string; }
interface Profile {
  id: string; business_name: string; logo_url: string | null; website_url: string | null;
  slogan: string | null; brand_colors: string[]; background_color: string | null;
  invoice_template: TemplateKey; paypal_me: string | null; cashapp_tag: string | null;
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function Chat() {
  const supabase = createClient();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: "Hey! Tell me about the job — who it's for and what you did. I'll handle the invoice." },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<ExtractResult> | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recording, setRecording] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, ready]);

  function speak(text: string) {
    // Voice read-back — core accessibility feature. Strip emoji for TTS.
    if (typeof speechSynthesis === 'undefined') return;
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1.05;
    speechSynthesis.speak(u);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
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
        return;
      }
      const reply: string = data.duplicateWarning ?? data.reply ?? 'Say that again?';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
      speak(reply);
      if (data.intent) setDraft(data);
      setReady(Boolean(data.ready) && !data.duplicateWarning && data.intent !== 'expense');

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
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Connection hiccup — try that again.' }]);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        setBusy(true);
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: blob });
          const { text } = await res.json();
          setBusy(false);
          if (text) send(text);
        } catch {
          setBusy(false);
          setMessages((m) => [...m, { role: 'assistant', content: "Couldn't hear that — try again or type it." }]);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Mic access is blocked. You can type instead.' }]);
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
        ? `Sent! I'll nudge you if ${rd.clientName} hasn't paid in 2 days. 💪`
        : `Downloaded! Send it to ${rd.clientName} however you like. I'll keep an eye on it.`;
      setMessages((m) => [...m, { role: 'assistant', content: done }]);
      speak(done);
      setDraft(null);
      setReady(false);
      setRenderData(null);
    } catch (e) {
      console.error(e);
      setMessages((m) => [...m, { role: 'assistant', content: "Couldn't finish that one. Your draft is safe — try again." }]);
    } finally {
      setFinalizing(false);
    }
  }

  const previewItems = (draft?.line_items ?? []) as LineItem[];
  const previewTotal = previewItems.reduce((s, li) => s + li.qty * li.unit_price, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[82%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-[15px] leading-relaxed
                ${m.role === 'user' ? 'rounded-br-md bg-ink text-paper' : 'rounded-bl-md bg-white border border-line'}`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {ready && draft && (
          <div className="card border-gold/60 ring-1 ring-gold/30">
            <div className="mb-2 flex items-center gap-2 font-display font-bold">
              <FileText size={18} className="text-gold" />
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
            <button className="btn-gold mt-3 flex w-full items-center justify-center gap-2" disabled={finalizing} onClick={finalize}>
              <Share2 size={18} />
              {finalizing ? 'Building your PDF…' : 'Looks right — send it'}
            </button>
            <button className="mt-2 w-full text-center text-sm text-ink/50 underline"
              onClick={() => send('Actually, let me change something')}>
              Change something
            </button>
          </div>
        )}

        {busy && <div className="px-2 text-sm text-ink/40">On It is thinking…</div>}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-line bg-paper px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          aria-label={recording ? 'Stop recording' : 'Speak your job'}
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-white transition active:scale-90
            ${recording ? 'animate-pulse bg-red-600' : 'bg-gold'}`}
          onClick={toggleRecording}
        >
          {recording ? <Square size={22} /> : <Mic size={24} />}
        </button>
        <textarea
          className="max-h-32 min-h-[3.5rem] flex-1 resize-none rounded-3xl border border-line bg-white px-4 py-3.5 text-[15px] outline-none focus:border-gold"
          placeholder={recording ? 'Listening…' : 'Or type it…'}
          value={input}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
          }}
        />
        <button
          aria-label="Send"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ink text-paper active:scale-90 disabled:opacity-30"
          disabled={!input.trim() || busy}
          onClick={() => send(input)}
        >
          <Send size={20} />
        </button>
      </div>

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
