'use client';
// The paywall's access-code field, restyled to the mockup: a mono input on a
// warm field with a black Apply button, and one status line under it.
//
// Forked from components/CodeEntry rather than restyling it, because Settings
// shares that one and this design is paywall-specific (decision K). The logic
// is the same real path: POST /api/redeem, server-side exact match, rate limit
// and one-per-user rule; the messages are the server's own — nothing here
// fakes a code. Codes are case-sensitive, so the field does not capitalise or
// uppercase what the user types.
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { startUnlockPolling } from '@/lib/upgrade-return';

export default function PaywallCodeEntry({ onRedeemed, onEscape }: {
  onRedeemed: () => void;
  onEscape?: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const ready = code.trim().length >= 3;

  async function apply() {
    if (busy || !ready) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        setMessage({ ok: true, text: data.message ?? "You're set. Free access is on." });
        void startUnlockPolling(); // every screen picks the new tier up when it reads paid
        onRedeemed();
      } else {
        setMessage({ ok: false, text: data?.message ?? "That code didn't work. Codes are case-sensitive." });
      }
    } catch {
      setMessage({ ok: false, text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const error = message !== null && !message.ok;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (message && !message.ok) setMessage(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void apply();
            if (e.key === 'Escape' && onEscape) { e.stopPropagation(); onEscape(); }
          }}
          placeholder="Enter code"
          aria-label="Access code"
          aria-invalid={error || undefined}
          aria-describedby="paywall-code-status"
          // Codes are case-sensitive: no auto-capitalize / autocorrect changing them.
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          className={`h-[46px] min-w-0 flex-1 rounded-input border bg-[#fffdf9] px-3.5 font-mono text-[15px] font-medium tracking-[.06em] text-on-background outline-none transition-colors placeholder:text-muted focus:border-on-background focus:shadow-[0_0_0_3px_rgba(212,175,55,.25)] ${
            error ? 'border-alert' : 'border-dash'}`}
        />
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => void apply()}
          className="h-[46px] shrink-0 rounded-input bg-on-background px-4 font-display text-[14px] font-bold text-background outline-none transition-transform active:scale-[0.97] disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {busy ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {message && (
        <div
          id="paywall-code-status"
          role="status"
          className={`flex items-center gap-1.5 text-[12.5px] leading-[1.3] ${message.ok ? 'text-positive' : 'text-alert'}`}
        >
          <Icon name={message.ok ? 'check_circle' : 'error'} size={16} />
          {message.text}
        </div>
      )}
    </div>
  );
}
