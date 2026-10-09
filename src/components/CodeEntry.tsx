'use client';
// Access-code entry ("Have a code?"), used by PaywallModal and Settings.
// POSTs /api/redeem; the server does the exact, case-sensitive match, the
// rate limit and the one-per-user rule. On success it calls onRedeemed.
// Styled per the paywall design: a pill field with Apply inside it, and a
// right-aligned helper line under it ("Codes are case-sensitive.").
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { refreshAccess } from '@/lib/upgrade-return';

export default function CodeEntry({ onRedeemed, autoFocus = false, onEscape }: {
  onRedeemed: () => void;
  autoFocus?: boolean;
  onEscape?: () => void; // the modal collapses the field back to "Have a code?"
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

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
        // Tell every screen holding an access copy (Summary's exports, Chat,
        // Recaps, Settings) that the tier just changed.
        void refreshAccess();
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

  const error = message && !message.ok;
  return (
    <div className="min-w-0 flex-1">
      <div className="relative">
        <input
          ref={inputRef}
          className={`h-11 w-full rounded-full border-[1.5px] bg-surface-container-lowest pl-4 pr-[84px] font-body text-[15px] font-medium text-on-background outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-primary ${
            error ? 'border-[#9b2c1c]' : 'border-primary/35'}`}
          // Codes are case-sensitive: no auto-capitalize / autocorrect changing them.
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          placeholder="Enter code"
          aria-label="Access code"
          aria-invalid={error || undefined}
          aria-describedby="code-entry-help"
          value={code}
          onChange={(e) => { setCode(e.target.value); if (message && !message.ok) setMessage(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void apply();
            if (e.key === 'Escape' && onEscape) { e.stopPropagation(); onEscape(); }
          }}
        />
        <button
          className="absolute right-1 top-0 h-11 rounded-full px-3.5 font-body text-[15px] font-semibold text-primary transition-opacity disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary"
          disabled={busy || !ready}
          onClick={apply}
        >
          {busy ? 'Checking…' : 'Apply'}
        </button>
      </div>
      <p
        id="code-entry-help"
        role="status"
        className={`mt-0.5 flex items-center justify-end gap-1 pr-4 text-[13px] leading-[18px] ${error ? 'text-[#9b2c1c]' : 'text-on-surface-variant'}`}
      >
        {message?.ok && <Icon name="check_circle" size={16} className="text-primary" />}
        <span>{message ? message.text : 'Codes are case-sensitive.'}</span>
      </p>
    </div>
  );
}
